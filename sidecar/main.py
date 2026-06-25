"""Sidecar Scribio — loop JSONL su stdin/stdout (BUILD-SPEC §6.1, §8).

Comandi (stdin):  list_devices | start | stop | ping
Eventi (stdout):  ready | devices | status | segment | stopped | error

Stateless tra sessioni: ogni `start` ricrea cattura+worker, ogni `stop` li distrugge.
L'audio non lascia mai questo processo: verso il main vanno solo i segmenti di testo.
"""

from __future__ import annotations

import json
import queue
import sys
import threading
import time
from typing import Any, Optional

import numpy as np
import pyaudiowpatch as pyaudio

import capture
import protocol as proto
from whisper_engine import WhisperEngine

# Windows: stdout/stderr default = cp1252 → Node legge UTF-8 → accenti diventano '�'.
# Forza UTF-8 sui canali verso il main (JSONL su stdout, log su stderr).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


# Unisce i segmenti whisper (molto frammentati) in blocchi-frase leggibili.
# Spezza su: cambio speaker, fine frase (. ? ! …), pausa lunga, o blocco troppo lungo.
_SENT_END = (".", "?", "!", "…")
_MAX_CHARS = 240
_MAX_GAP = 1.5  # secondi di silenzio che forzano una nuova riga


def _merge_segments(
    segs: list[tuple[str, float, float, str]],
) -> list[tuple[str, float, float, str]]:
    out: list[tuple[str, float, float, str]] = []
    for sp, start, end, text in segs:
        text = text.strip()
        if not text:
            continue
        if out:
            psp, pstart, pend, ptext = out[-1]
            same_speaker = sp == psp
            ends_sentence = ptext.endswith(_SENT_END)
            small_gap = (start - pend) <= _MAX_GAP
            short_enough = len(ptext) + 1 + len(text) <= _MAX_CHARS
            if same_speaker and not ends_sentence and small_gap and short_enough:
                out[-1] = (psp, pstart, end, f"{ptext} {text}")
                continue
        out.append((sp, start, end, text))
    return out


class Session:
    def __init__(
        self,
        pa: pyaudio.PyAudio,
        session_id: str,
        engine: WhisperEngine,
        mic: capture.DeviceInfo,
        loopback: capture.DeviceInfo,
    ):
        self.id = session_id
        self._pa = pa
        self._tr = engine
        self._stop = threading.Event()
        # live queue piccola: backpressure → droppa il display se in ritardo.
        self._q: "queue.Queue[tuple[str, np.ndarray, float]]" = queue.Queue(maxsize=3)
        self._t0 = time.monotonic()
        self._seq = 0
        # audio completo per stream (RAM), per il pass finale di qualità.
        self._full: dict[str, list[np.ndarray]] = {"me": [], "others": []}
        clock = lambda: time.monotonic() - self._t0  # noqa: E731
        self._capturers = [
            capture.Capturer(pa, mic, "me", self._q, self._full["me"], self._stop, clock),
            capture.Capturer(pa, loopback, "others", self._q, self._full["others"], self._stop, clock),
        ]
        self._worker = threading.Thread(target=self._run_worker, daemon=True, name="stt")

    def start(self) -> None:
        for c in self._capturers:
            c.start()
        self._worker.start()
        proto.emit_status(self.id, "capturing")

    def _run_worker(self) -> None:
        # Live display: alla stop SMETTE subito (scarta il backlog) → niente bleed.
        while not self._stop.is_set():
            try:
                speaker, audio, t0 = self._q.get(timeout=0.3)
            except queue.Empty:
                continue
            if capture.is_silent(audio):
                continue  # safety net: i segmenti arrivano già a-voce dal VAD (VadSegmenter)
            try:
                text = self._tr.transcribe(capture.to_wav_bytes(audio))
            except Exception as exc:  # robustezza: non abbattere la sessione
                proto.log(f"transcribe error: {exc}")
                continue
            if text:
                self._seq += 1
                dur = audio.size / capture.TARGET_RATE
                proto.emit_segment(self.id, speaker, t0, t0 + dur, text, self._seq)

    def _final_pass(self) -> None:
        """Ri-trascrive l'audio intero per stream (qualità + ordine corretto)."""
        # il motore potrebbe essere ancora in avvio (cold start): garantisce la readiness
        # prima di trascrivere l'audio accumulato (idempotente, no-op se già pronto).
        try:
            self._tr.start()
        except Exception as exc:
            proto.log(f"final pass: motore non pronto: {exc}")
            proto.emit_final(self.id, [])
            return
        results: list[tuple[str, float, float, str]] = []
        for speaker, chunks in self._full.items():
            if not chunks:
                continue
            audio = np.concatenate(chunks)
            if capture.is_silent(audio):
                continue  # stream interamente muto: salta (no allucinazioni / no errore VAD)
            try:
                wav = capture.to_wav_bytes(audio)
                for start, end, text in self._tr.transcribe_segments(wav):
                    results.append((speaker, start, end, text))
            except Exception as exc:
                proto.log(f"final pass error ({speaker}): {exc}")
        results.sort(key=lambda r: r[1])  # ordine cronologico globale
        merged = _merge_segments(results)
        segments = [
            {"speaker": sp, "ts_start": round(s, 2), "ts_end": round(e, 2), "text": t, "seq": i}
            for i, (sp, s, e, t) in enumerate(merged)
        ]
        proto.emit_final(self.id, segments)

    def stop(self) -> None:
        proto.emit_status(self.id, "finalizing")
        self._stop.set()
        for c in self._capturers:
            c.join(timeout=5.0)
        self._worker.join(timeout=3.0)
        self._final_pass()
        # libera l'audio dalla RAM (mai persistito su disco)
        self._full = {"me": [], "others": []}
        proto.emit_stopped(self.id)


class Sidecar:
    def __init__(self) -> None:
        self._pa = pyaudio.PyAudio()
        self._session: Optional[Session] = None
        self._engine: Optional[WhisperEngine] = None
        self._engine_lock = threading.Lock()  # protegge la creazione dell'istanza
        # probe del VU-meter (onboarding): stream aperti solo per misurare il livello.
        self._probe_stop: Optional[threading.Event] = None
        self._probes: list[capture.LevelProbe] = []

    def _engine_obj(self, language: str) -> WhisperEngine:
        """Ritorna l'unica istanza engine (creata se assente). NON la avvia."""
        with self._engine_lock:
            if self._engine is None:
                self._engine = WhisperEngine(language)
            return self._engine

    def _ensure_engine_started(self, language: str) -> None:
        """Avvia il server (download modello 1ª volta + load). Idempotente."""
        try:
            self._engine_obj(language).start()
        except Exception as exc:
            proto.emit_error(f"Avvio motore STT fallito: {exc}", fatal=True)

    def _prewarm(self) -> None:
        """Pre-carica il modello al boot, così il 1° record non perde l'audio
        iniziale aspettando l'avvio del server."""
        self._ensure_engine_started("it")

    def handle(self, msg: dict[str, Any]) -> None:
        cmd = msg.get("cmd")
        if cmd == "ping":
            proto.emit_status(msg.get("session_id", ""), "capturing")
            return
        if cmd == "list_devices":
            mic, loop = capture.list_devices(self._pa)
            proto.emit_devices(mic, loop)
            return
        if cmd == "start":
            self._start(msg)
            return
        if cmd == "stop":
            self._stop()
            return
        if cmd == "probe":
            self._probe(msg)
            return
        if cmd == "probe_stop":
            self._probe_stop_all()
            return
        proto.log(f"comando sconosciuto: {cmd!r}")

    def _start(self, msg: dict[str, Any]) -> None:
        if self._session is not None:
            proto.emit_error("Sessione già attiva.", fatal=False)
            return
        self._probe_stop_all()  # libera i device dal probe prima di catturare
        session_id = str(msg.get("session_id", ""))
        language = str(msg.get("language", "it"))
        try:
            mic_index = msg.get("mic_index")
            loop_index = msg.get("loopback_index")
            # default solo per ciò che non è specificato (selezione indipendente)
            def_mic = def_loop = None
            if mic_index is None or loop_index is None:
                def_mic, def_loop = capture.default_devices(self._pa)
            mic = (
                capture.device_by_index(self._pa, int(mic_index), 1)
                if mic_index is not None
                else def_mic
            )
            loopback = (
                capture.device_by_index(self._pa, int(loop_index), 2)
                if loop_index is not None
                else def_loop
            )
            # NON bloccare sull'avvio del server: prendi solo l'istanza (creata o
            # già pre-riscaldata) così i capturer partono subito (audio da t0).
            engine = self._engine_obj(language)
        except Exception as exc:
            proto.emit_error(f"Avvio sessione fallito: {exc}", fatal=True)
            return
        self._session = Session(self._pa, session_id, engine, mic, loopback)
        self._session.start()  # cattura immediata; il pass finale avrà tutto l'audio
        # assicura la readiness del motore in background (idempotente col pre-warm):
        # il live mostra testo appena pronto, il finale attende comunque la readiness.
        threading.Thread(
            target=self._ensure_engine_started, args=(language,), daemon=True
        ).start()

    def _stop(self) -> None:
        if self._session is None:
            return
        sess = self._session
        self._session = None
        sess.stop()

    def _probe(self, msg: dict[str, Any]) -> None:
        if self._session is not None:
            proto.emit_error("Sessione attiva: impossibile avviare il probe.", fatal=False)
            return
        self._probe_stop_all()  # idempotente: chiude eventuali probe precedenti
        mic_index = msg.get("mic_index")
        loop_index = msg.get("loopback_index")
        def_mic = def_loop = None
        if mic_index is None or loop_index is None:
            try:
                def_mic, def_loop = capture.default_devices(self._pa)
            except Exception as exc:
                proto.emit_error(f"Device di default non disponibili: {exc}", fatal=False)
        stop_evt = threading.Event()
        self._probe_stop = stop_evt
        # un probe per stream: errore isolato (es. loopback assente) → niente crash.
        for speaker, index, dflt, fb in (
            ("me", mic_index, def_mic, 1),
            ("others", loop_index, def_loop, 2),
        ):
            try:
                dev = (
                    capture.device_by_index(self._pa, int(index), fb)
                    if index is not None
                    else dflt
                )
                if dev is None:
                    raise RuntimeError("device non selezionato e nessun default")
                probe = capture.LevelProbe(self._pa, dev, speaker, self._emit_level, stop_evt)
                probe.start()
                self._probes.append(probe)
            except Exception as exc:
                proto.emit_error(f"Probe '{speaker}' fallito: {exc}", fatal=False)

    def _emit_level(self, speaker: str, rms: float) -> None:
        proto.emit_level(speaker, rms)

    def _probe_stop_all(self) -> None:
        if self._probe_stop is not None:
            self._probe_stop.set()
        for p in self._probes:
            p.join(timeout=2.0)
        self._probes = []
        self._probe_stop = None

    def run(self) -> None:
        proto.emit_ready()
        # pre-carica il modello subito: quando l'utente preme Registra il server è
        # già pronto → nessuna perdita dell'audio iniziale (fix delay all'avvio).
        threading.Thread(target=self._prewarm, daemon=True).start()
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                proto.log(f"JSON non valido: {line!r}")
                continue
            try:
                self.handle(msg)
            except Exception as exc:
                proto.emit_error(f"Errore interno: {exc}", fatal=False)
        # stdin chiuso -> shutdown pulito
        self._probe_stop_all()
        self._stop()
        if self._engine is not None:
            self._engine.stop()
        self._pa.terminate()


if __name__ == "__main__":
    Sidecar().run()
