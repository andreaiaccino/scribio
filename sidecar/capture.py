"""Cattura audio WASAPI (loopback output di default = "others", mic = "me").

Due stream separati, downmix a 16 kHz mono float32 per lo STT.
Refactor della logica validata in spike.py (M0).
"""

from __future__ import annotations

import io
import os
import queue
import threading
import wave
from collections import deque
from dataclasses import dataclass

import numpy as np
import pyaudiowpatch as pyaudio
import webrtcvad

TARGET_RATE = 16000
CHUNK_SECONDS = 6.0  # legacy: non più usato per il live (segmentazione ora a VAD)
FRAMES_PER_BUFFER = 1024


SILENCE_RMS = 0.004  # sotto questa energia lo stream è muto → non trascrivere

# --- VAD (segmentazione live a voce, non a orologio) -------------------------
# webrtcvad pretende PCM16 mono a 8/16/32/48k e frame ESATTI da 10/20/30ms.
# Usiamo 16k/20ms = 320 sample/frame.
VAD_FRAME_MS = 20
VAD_AGGRESSIVENESS = int(os.environ.get("SCRIBIO_VAD_AGGRESSIVENESS", "2"))  # 0=lasco … 3=aggressivo
VAD_HANGOVER_MS = 500   # silenzio di coda che chiude l'enunciato
VAD_PREROLL_MS = 200    # audio pre-voce conservato per non tagliare gli attacchi
VAD_MAX_SEGMENT_S = 12.0  # cap di sicurezza: flush forzato su monologhi lunghissimi

_VAD_FRAME_LEN = TARGET_RATE * VAD_FRAME_MS // 1000  # 320 sample @16k


def _to_pcm16_bytes(frame: np.ndarray) -> bytes:
    """float32 [-1,1] → PCM16 little-endian bytes (formato preteso da webrtcvad)."""
    return (np.clip(frame, -1.0, 1.0) * 32767.0).astype(np.int16).tobytes()


class VadSegmenter:
    """Segmenta uno stream 16k mono in enunciati con webrtcvad.

    `feed()` consuma audio arbitrario, lo affetta in frame esatti da 20ms e
    ritorna i segmenti CHIUSI (per silenzio di coda o per cap di durata).
    `flush()` chiude l'eventuale segmento ancora aperto a fine cattura.
    Nessun audio lascia il processo: qui si decide solo dove tagliare il live.
    """

    def __init__(self, aggressiveness: int = VAD_AGGRESSIVENESS):
        self._vad = webrtcvad.Vad(int(aggressiveness))
        self._residual = np.empty(0, dtype=np.float32)  # campioni < 1 frame, riportati al feed dopo
        self._preroll: "deque[np.ndarray]" = deque(maxlen=max(1, VAD_PREROLL_MS // VAD_FRAME_MS))
        self._voiced: list[np.ndarray] = []
        self._silence_frames = 0
        self._in_speech = False
        self._hangover = max(1, VAD_HANGOVER_MS // VAD_FRAME_MS)
        self._max_frames = max(1, int(VAD_MAX_SEGMENT_S * 1000 / VAD_FRAME_MS))

    def _close(self) -> np.ndarray:
        seg = np.concatenate(self._voiced)
        self._voiced = []
        self._in_speech = False
        self._silence_frames = 0
        return seg

    def feed(self, audio16k: np.ndarray) -> list[np.ndarray]:
        out: list[np.ndarray] = []
        if audio16k.size:
            self._residual = np.concatenate((self._residual, audio16k))
        n_frames = self._residual.size // _VAD_FRAME_LEN
        for i in range(n_frames):
            frame = self._residual[i * _VAD_FRAME_LEN : (i + 1) * _VAD_FRAME_LEN]
            speech = self._vad.is_speech(_to_pcm16_bytes(frame), TARGET_RATE)
            if speech:
                if not self._in_speech:
                    self._voiced.extend(self._preroll)  # attacco: anteponi il pre-roll
                    self._preroll.clear()
                    self._in_speech = True
                self._voiced.append(frame)
                self._silence_frames = 0
            elif self._in_speech:
                self._voiced.append(frame)  # coda (entro l'hangover)
                self._silence_frames += 1
                if self._silence_frames >= self._hangover:
                    out.append(self._close())
            else:
                self._preroll.append(frame)
            if self._in_speech and len(self._voiced) >= self._max_frames:
                out.append(self._close())
        rem = self._residual.size - n_frames * _VAD_FRAME_LEN
        self._residual = self._residual[-rem:] if rem else np.empty(0, dtype=np.float32)
        return out

    def flush(self) -> "np.ndarray | None":
        if self._in_speech and self._voiced:
            return self._close()
        return None


def is_silent(audio: np.ndarray) -> bool:
    """True se l'audio è praticamente silenzio (evita allucinazioni di Whisper
    sui tratti muti e l'errore del server VAD su 0 segmenti vocali)."""
    if audio.size == 0:
        return True
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) < SILENCE_RMS


def to_wav_bytes(audio: np.ndarray) -> bytes:
    """float32 mono 16k in [-1,1] → WAV PCM16 (per whisper-server /inference)."""
    pcm = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TARGET_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


@dataclass
class DeviceInfo:
    index: int
    name: str
    rate: int
    channels: int


def _wasapi(pa: pyaudio.PyAudio) -> dict:
    try:
        return pa.get_host_api_info_by_type(pyaudio.paWASAPI)
    except OSError as exc:
        raise RuntimeError(f"WASAPI non disponibile: {exc}") from exc


def list_devices(pa: pyaudio.PyAudio) -> tuple[list[dict], list[dict]]:
    """Ritorna (mic[], loopback[]) come liste {index, name} per la UI."""
    _wasapi(pa)
    mics: list[dict] = []
    loops: list[dict] = []
    for info in pa.get_device_info_generator():
        if int(info.get("maxInputChannels", 0)) > 0 and not info.get("isLoopbackDevice", False):
            mics.append({"index": int(info["index"]), "name": str(info["name"])})
    for info in pa.get_loopback_device_info_generator():
        loops.append({"index": int(info["index"]), "name": str(info["name"])})
    return mics, loops


def default_devices(pa: pyaudio.PyAudio) -> tuple[DeviceInfo, DeviceInfo]:
    """Default WASAPI: (mic, loopback dell'output di default)."""
    wasapi = _wasapi(pa)
    mic_raw = pa.get_device_info_by_index(wasapi["defaultInputDevice"])
    mic = DeviceInfo(
        index=int(mic_raw["index"]),
        name=str(mic_raw["name"]),
        rate=int(mic_raw["defaultSampleRate"]),
        channels=int(mic_raw["maxInputChannels"]) or 1,
    )
    default_out = pa.get_device_info_by_index(wasapi["defaultOutputDevice"])
    loop_raw = None
    for info in pa.get_loopback_device_info_generator():
        if default_out["name"] in info["name"]:
            loop_raw = info
            break
    if loop_raw is None:
        raise RuntimeError(
            f"Nessun loopback per l'output di default ('{default_out['name']}')."
        )
    loopback = DeviceInfo(
        index=int(loop_raw["index"]),
        name=str(loop_raw["name"]),
        rate=int(loop_raw["defaultSampleRate"]),
        channels=int(loop_raw["maxInputChannels"]) or 2,
    )
    return mic, loopback


def device_by_index(pa: pyaudio.PyAudio, index: int, fallback_channels: int) -> DeviceInfo:
    raw = pa.get_device_info_by_index(index)
    return DeviceInfo(
        index=int(raw["index"]),
        name=str(raw["name"]),
        rate=int(raw["defaultSampleRate"]),
        channels=int(raw["maxInputChannels"]) or fallback_channels,
    )


def to_mono_16k(raw: bytes, src_rate: int, src_channels: int) -> np.ndarray:
    """int16 interleaved -> float32 mono 16 kHz in [-1, 1]."""
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if src_channels > 1:
        audio = audio.reshape(-1, src_channels).mean(axis=1)
    if src_rate != TARGET_RATE and audio.size:
        duration = audio.size / src_rate
        tgt_len = int(round(duration * TARGET_RATE))
        if tgt_len > 0:
            x_old = np.linspace(0.0, duration, num=audio.size, endpoint=False)
            x_new = np.linspace(0.0, duration, num=tgt_len, endpoint=False)
            audio = np.interp(x_new, x_old, audio).astype(np.float32)
    return audio


class LevelProbe(threading.Thread):
    """Apre uno stream e misura il livello (RMS) ~10 volte/s, senza trascrivere
    né accumulare audio. Usato dall'onboarding per il VU-meter: la callback
    riceve (speaker, rms). Nessun audio lascia il processo."""

    WINDOW_SECONDS = 0.1  # finestra di misura → ~10 emissioni/s

    def __init__(
        self,
        pa: pyaudio.PyAudio,
        dev: DeviceInfo,
        speaker: str,
        on_level,  # callable(speaker: str, rms: float)
        stop_evt: threading.Event,
    ):
        super().__init__(daemon=True, name=f"probe-{speaker}")
        self._pa = pa
        self._dev = dev
        self._speaker = speaker
        self._on_level = on_level
        self._stop_evt = stop_evt

    def run(self) -> None:
        stream = self._pa.open(
            format=pyaudio.paInt16,
            channels=self._dev.channels,
            rate=self._dev.rate,
            input=True,
            input_device_index=self._dev.index,
            frames_per_buffer=FRAMES_PER_BUFFER,
        )
        bytes_per_window = int(self._dev.rate * self.WINDOW_SECONDS) * self._dev.channels * 2
        buf = bytearray()
        try:
            while not self._stop_evt.is_set():
                data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                buf.extend(data)
                if len(buf) >= bytes_per_window:
                    audio = to_mono_16k(bytes(buf), self._dev.rate, self._dev.channels)
                    buf.clear()
                    if audio.size:
                        rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
                        self._on_level(self._speaker, rms)
        finally:
            stream.stop_stream()
            stream.close()


class Capturer(threading.Thread):
    """Cattura uno stream. Due uscite:
    - live queue (con backpressure: droppa il display se in ritardo, mai l'audio finale);
    - full_sink: accumula TUTTO l'audio 16k mono per il pass finale (in RAM).
    """

    def __init__(
        self,
        pa: pyaudio.PyAudio,
        dev: DeviceInfo,
        speaker: str,
        live_q: "queue.Queue[tuple[str, np.ndarray, float]]",
        full_sink: "list[np.ndarray]",
        stop_evt: threading.Event,
        clock,
    ):
        super().__init__(daemon=True, name=f"cap-{speaker}")
        self._pa = pa
        self._dev = dev
        self._speaker = speaker
        self._q = live_q
        self._full = full_sink
        # NB: NON usare self._stop — collide con Thread._stop() interno di CPython.
        self._stop_evt = stop_evt
        self._clock = clock  # callable -> secondi dall'inizio sessione
        self._seg = VadSegmenter()  # segmentazione live a voce (vedi VadSegmenter)

    def _push(self, audio: np.ndarray) -> None:
        """Manda un enunciato (già a-voce) alla coda live. Il full_sink ha già
        tutto l'audio grezzo: qui si alimenta solo il display."""
        if not audio.size:
            return
        dur = audio.size / TARGET_RATE
        t0 = max(0.0, self._clock() - dur)  # offset all'inizio dell'enunciato
        try:
            self._q.put_nowait((self._speaker, audio, t0))
        except queue.Full:
            pass  # live in ritardo: salta il display, l'audio finale resta integro

    def run(self) -> None:
        stream = self._pa.open(
            format=pyaudio.paInt16,
            channels=self._dev.channels,
            rate=self._dev.rate,
            input=True,
            input_device_index=self._dev.index,
            frames_per_buffer=FRAMES_PER_BUFFER,
        )
        try:
            while not self._stop_evt.is_set():
                data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                audio = to_mono_16k(data, self._dev.rate, self._dev.channels)
                if not audio.size:
                    continue
                self._full.append(audio)  # audio completo per il pass finale (sempre)
                for seg in self._seg.feed(audio):
                    self._push(seg)
            # chiudi l'ultimo enunciato per non perdere gli ultimi secondi
            tail = self._seg.flush()
            if tail is not None:
                self._push(tail)
        finally:
            stream.stop_stream()
            stream.close()
