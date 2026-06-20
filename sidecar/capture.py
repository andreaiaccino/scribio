"""Cattura audio WASAPI (loopback output di default = "others", mic = "me").

Due stream separati, downmix a 16 kHz mono float32 per lo STT.
Refactor della logica validata in spike.py (M0).
"""

from __future__ import annotations

import io
import queue
import threading
import wave
from dataclasses import dataclass

import numpy as np
import pyaudiowpatch as pyaudio

TARGET_RATE = 16000
CHUNK_SECONDS = 6.0
FRAMES_PER_BUFFER = 1024


SILENCE_RMS = 0.004  # sotto questa energia lo stream è muto → non trascrivere


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

    def _emit(self, raw: bytes) -> None:
        audio = to_mono_16k(raw, self._dev.rate, self._dev.channels)
        if not audio.size:
            return
        self._full.append(audio)  # audio completo per il pass finale (sempre)
        t0 = self._clock()
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
        bytes_per_chunk = int(self._dev.rate * CHUNK_SECONDS) * self._dev.channels * 2
        buf = bytearray()
        try:
            while not self._stop_evt.is_set():
                data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow=False)
                buf.extend(data)
                if len(buf) >= bytes_per_chunk:
                    self._emit(bytes(buf))
                    buf.clear()
            # flush della coda finale (tail < CHUNK) per non perdere gli ultimi secondi
            if buf:
                self._emit(bytes(buf))
        finally:
            stream.stop_stream()
            stream.close()
