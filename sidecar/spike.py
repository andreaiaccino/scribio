"""
M0 — Spike audio (standalone, NO Electron).

De-risk prioritario del BUILD-SPEC (§9 M0): apre due stream WASAPI
(loopback dell'output di default = "Altri", microfono = "Tu"), li trascrive
con faster-whisper e stampa i segmenti a console etichettati per speaker.

Uso:
    py -m venv .venv
    .venv\\Scripts\\activate
    pip install -r requirements.txt
    python spike.py            # modello "small", CPU int8
    python spike.py --model medium --device cuda --compute float16

AC: con una call/video in riproduzione + voce al microfono, la console mostra
in near-real-time due flussi di testo italiano corretti (Tu / Altri).

NB: questo è uno spike, non codice di produzione. Il sidecar reale (M2) riusa
la stessa logica di cattura/STT ma parla JSONL su stdin/stdout (vedi protocol).
"""

from __future__ import annotations

import argparse
import queue
import sys
import threading
import time
from dataclasses import dataclass

import numpy as np
import pyaudiowpatch as pyaudio
from faster_whisper import WhisperModel

TARGET_RATE = 16000          # faster-whisper vuole 16 kHz mono
CHUNK_SECONDS = 6.0          # ~5-10s di audio per chunk (delimitato poi dal VAD)
BYTES_DTYPE = np.int16       # cattura a int16, poi convertito a float32


# --------------------------------------------------------------------------- #
# Device discovery
# --------------------------------------------------------------------------- #
@dataclass
class DeviceInfo:
    index: int
    name: str
    rate: int
    channels: int


def find_devices(pa: pyaudio.PyAudio) -> tuple[DeviceInfo, DeviceInfo]:
    """Ritorna (mic, loopback) usando i default WASAPI.

    Il loopback del device di output di default si ottiene dalla host API
    WASAPI: default output -> cerco il device loopback corrispondente
    (PyAudioWPatch duplica gli output come input virtuali in fondo alla lista).
    """
    try:
        wasapi = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    except OSError as exc:  # WASAPI non disponibile
        raise RuntimeError(f"WASAPI non disponibile: {exc}") from exc

    # --- microfono: default input ---
    mic_raw = pa.get_device_info_by_index(wasapi["defaultInputDevice"])
    mic = DeviceInfo(
        index=mic_raw["index"],
        name=mic_raw["name"],
        rate=int(mic_raw["defaultSampleRate"]),
        channels=int(mic_raw["maxInputChannels"]) or 1,
    )

    # --- loopback: default output -> suo loopback ---
    default_out = pa.get_device_info_by_index(wasapi["defaultOutputDevice"])
    loop_raw = None
    for info in pa.get_loopback_device_info_generator():
        # il loopback del default output condivide il nome del device di output
        if default_out["name"] in info["name"]:
            loop_raw = info
            break
    if loop_raw is None:
        raise RuntimeError(
            "Nessun device loopback trovato per l'output di default "
            f"('{default_out['name']}'). Verifica i driver audio."
        )
    loopback = DeviceInfo(
        index=loop_raw["index"],
        name=loop_raw["name"],
        rate=int(loop_raw["defaultSampleRate"]),
        channels=int(loop_raw["maxInputChannels"]) or 2,
    )
    return mic, loopback


# --------------------------------------------------------------------------- #
# Resampling / downmix
# --------------------------------------------------------------------------- #
def to_mono_16k(raw: bytes, src_rate: int, src_channels: int) -> np.ndarray:
    """int16 interleaved -> float32 mono 16 kHz in [-1, 1]."""
    audio = np.frombuffer(raw, dtype=BYTES_DTYPE).astype(np.float32) / 32768.0
    if src_channels > 1:
        audio = audio.reshape(-1, src_channels).mean(axis=1)
    if src_rate != TARGET_RATE and audio.size:
        # resample lineare: sufficiente per lo spike (no scipy/resampy)
        duration = audio.size / src_rate
        tgt_len = int(round(duration * TARGET_RATE))
        if tgt_len > 0:
            x_old = np.linspace(0.0, duration, num=audio.size, endpoint=False)
            x_new = np.linspace(0.0, duration, num=tgt_len, endpoint=False)
            audio = np.interp(x_new, x_old, audio).astype(np.float32)
    return audio


# --------------------------------------------------------------------------- #
# Capture thread
# --------------------------------------------------------------------------- #
class Capturer(threading.Thread):
    def __init__(self, pa: pyaudio.PyAudio, dev: DeviceInfo, speaker: str,
                 out_q: "queue.Queue[tuple[str, np.ndarray]]",
                 stop_evt: threading.Event):
        super().__init__(daemon=True, name=f"cap-{speaker}")
        self._pa = pa
        self._dev = dev
        self._speaker = speaker
        self._q = out_q
        self._stop_evt = stop_evt  # non self._stop: collide con Thread._stop()

    def run(self) -> None:
        frames_per_buffer = 1024
        stream = self._pa.open(
            format=pyaudio.paInt16,
            channels=self._dev.channels,
            rate=self._dev.rate,
            input=True,
            input_device_index=self._dev.index,
            frames_per_buffer=frames_per_buffer,
        )
        samples_per_chunk = int(self._dev.rate * CHUNK_SECONDS)
        buf = bytearray()
        bytes_per_chunk = samples_per_chunk * self._dev.channels * 2  # int16
        try:
            while not self._stop_evt.is_set():
                data = stream.read(frames_per_buffer, exception_on_overflow=False)
                buf.extend(data)
                if len(buf) >= bytes_per_chunk:
                    audio = to_mono_16k(bytes(buf), self._dev.rate, self._dev.channels)
                    buf.clear()
                    if audio.size:
                        self._q.put((self._speaker, audio))
        finally:
            stream.stop_stream()
            stream.close()


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description="Scribio M0 audio spike")
    parser.add_argument("--model", default="small",
                        help="faster-whisper model: small|medium|large-v3")
    parser.add_argument("--device", default="cpu", help="cpu|cuda")
    parser.add_argument("--compute", default="int8",
                        help="compute type: int8 (cpu) | float16 (cuda)")
    parser.add_argument("--language", default="it")
    args = parser.parse_args()

    pa = pyaudio.PyAudio()
    try:
        mic, loopback = find_devices(pa)
    except RuntimeError as exc:
        print(f"[ERRORE] {exc}", file=sys.stderr)
        return 1

    print(f"[mic]      idx={mic.index} {mic.name} ({mic.rate} Hz, {mic.channels}ch)")
    print(f"[loopback] idx={loopback.index} {loopback.name} "
          f"({loopback.rate} Hz, {loopback.channels}ch)")
    print(f"[stt]      caricamento faster-whisper '{args.model}' "
          f"({args.device}/{args.compute}, lang={args.language})…")

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute)
    print("[stt]      pronto. Parla / riproduci audio. CTRL+C per uscire.\n")

    audio_q: "queue.Queue[tuple[str, np.ndarray]]" = queue.Queue()
    stop_evt = threading.Event()
    stt_lock = threading.Lock()  # una sola istanza modello -> serializza

    cappers = [
        Capturer(pa, mic, "Tu", audio_q, stop_evt),
        Capturer(pa, loopback, "Altri", audio_q, stop_evt),
    ]
    for c in cappers:
        c.start()

    seq = 0
    try:
        while True:
            try:
                speaker, audio = audio_q.get(timeout=0.5)
            except queue.Empty:
                continue
            with stt_lock:
                segments, _ = model.transcribe(
                    audio, language=args.language, vad_filter=True,
                    beam_size=1,
                )
                text = " ".join(s.text.strip() for s in segments).strip()
            if text:
                seq += 1
                tag = "\033[92mTu\033[0m" if speaker == "Tu" else "Altri"
                print(f"#{seq:03d} [{tag}] {text}")
    except KeyboardInterrupt:
        print("\n[stop] chiusura…")
    finally:
        stop_evt.set()
        for c in cappers:
            c.join(timeout=2.0)
        pa.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
