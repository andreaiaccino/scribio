"""Motore STT cross-vendor: whisper.cpp (build Vulkan) come whisper-server.

Un solo binario che usa la GPU su AMD/NVIDIA/Intel (Vulkan) e ricade su CPU dove
non c'è device Vulkan. Il server carica il modello UNA volta; il sidecar gli invia
gli WAV via HTTP /inference. Modelli GGUF scaricati al primo avvio (HF).

Sostituisce transcribe.py (faster-whisper, CUDA-only).
"""

from __future__ import annotations

import io
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from typing import Optional

MODEL_FILE = "ggml-large-v3-turbo-q5_0.bin"
MODEL_URL = (
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/"
    "ggml-large-v3-turbo-q5_0.bin"
)

# Modello VAD (silero) per ritagliare il parlato dal silenzio: evita le
# "allucinazioni" di Whisper sui tratti muti (es. "grazie a tutti", "grazie").
VAD_FILE = "ggml-silero-v5.1.2.bin"
VAD_URL = (
    "https://huggingface.co/ggml-org/whisper-vad/resolve/main/"
    "ggml-silero-v5.1.2.bin"
)


def _log(msg: str) -> None:
    sys.stderr.write(f"[whisper] {msg}\n")
    sys.stderr.flush()


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class WhisperEngine:
    def __init__(self, language: str = "it"):
        self._lang = language
        self._port = _free_port()
        self._base = f"http://127.0.0.1:{self._port}"
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()  # whisper-server è single-context
        self._start_lock = threading.Lock()  # start() idempotente e thread-safe
        self._started = False

    # ---- modelli -------------------------------------------------------- #
    def _model_dir(self) -> str:
        root = os.environ.get("SCRIBIO_MODEL_DIR") or os.getcwd()
        os.makedirs(root, exist_ok=True)
        return root

    def _download(self, url: str, path: str, label: str, min_size: int) -> str:
        if os.path.exists(path) and os.path.getsize(path) > min_size:
            return path
        _log(f"download {label} …")
        tmp = path + ".part"
        with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
            total = int(r.headers.get("Content-Length", 0))
            done = 0
            last = 0.0
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                now = time.time()
                if total and now - last > 2:
                    _log(f"  {done * 100 // total}%")
                    last = now
        os.replace(tmp, path)
        _log(f"download {label} completato")
        return path

    def _ensure_model(self) -> str:
        return self._download(
            MODEL_URL, os.path.join(self._model_dir(), MODEL_FILE), MODEL_FILE, 1_000_000
        )

    def _ensure_vad(self) -> Optional[str]:
        """Scarica il modello VAD; ritorna None se non disponibile (degrada senza VAD)."""
        try:
            return self._download(
                VAD_URL, os.path.join(self._model_dir(), VAD_FILE), VAD_FILE, 100_000
            )
        except Exception as exc:
            _log(f"VAD non disponibile (procedo senza): {exc}")
            return None

    # ---- server --------------------------------------------------------- #
    def _whisper_exe(self) -> str:
        d = os.environ.get("SCRIBIO_WHISPER_DIR") or os.getcwd()
        return os.path.join(d, "whisper-server.exe")

    def start(self) -> None:
        """Avvio idempotente: il 1° chiamante scarica/avvia, gli altri attendono.

        Bloccante fino a server pronto. Sicuro da chiamare da più thread
        (pre-warm al boot, avvio sessione, pass finale).
        """
        with self._start_lock:
            if self._started:
                return
            model = self._ensure_model()
            exe = self._whisper_exe()
            if not os.path.exists(exe):
                raise RuntimeError(f"whisper-server non trovato: {exe}")
            args = [
                exe, "-m", model, "-l", self._lang,
                "--host", "127.0.0.1", "--port", str(self._port),
                "-t", str(max(1, (os.cpu_count() or 4))),
                "--suppress-nst",  # sopprime i token non-vocali (anti-allucinazione)
            ]
            vad = self._ensure_vad()
            if vad:
                # VAD: trascrive solo il parlato → niente "grazie a tutti" sul silenzio.
                args += ["--vad", "--vad-model", vad]
            _log("avvio whisper-server…")
            self._proc = subprocess.Popen(
                args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1, cwd=os.path.dirname(exe),
            )
            threading.Thread(target=self._pump_log, daemon=True).start()
            self._wait_ready(timeout=600)  # 1° avvio: download modello (~570MB) può essere lungo
            self._started = True

    def _pump_log(self) -> None:
        # solo logging (il device Vulkan/CPU compare qui); la readiness è via TCP.
        assert self._proc and self._proc.stdout
        for line in self._proc.stdout:
            _log(f"srv: {line.rstrip()}")

    def _wait_ready(self, timeout: float) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._proc and self._proc.poll() is not None:
                raise RuntimeError("whisper-server terminato all'avvio")
            try:
                with socket.create_connection(("127.0.0.1", self._port), timeout=1):
                    return  # porta in ascolto → pronto (modello già caricato)
            except OSError:
                time.sleep(0.5)
        raise RuntimeError("whisper-server non pronto (timeout)")

    def stop(self) -> None:
        if self._proc and self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
        self._proc = None

    # ---- inferenza ------------------------------------------------------ #
    def _post(self, wav: bytes, response_format: str) -> bytes:
        boundary = "----scribio" + uuid.uuid4().hex
        buf = io.BytesIO()

        def w(s: str) -> None:
            buf.write(s.encode("utf-8"))

        w(f"--{boundary}\r\n")
        w('Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n')
        w("Content-Type: audio/wav\r\n\r\n")
        buf.write(wav)
        w("\r\n")
        for k, v in {"response_format": response_format, "temperature": "0"}.items():
            w(f"--{boundary}\r\n")
            w(f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n')
        w(f"--{boundary}--\r\n")

        req = urllib.request.Request(
            f"{self._base}/inference",
            data=buf.getvalue(),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with self._lock:
            with urllib.request.urlopen(req, timeout=600) as resp:
                return resp.read()

    def transcribe(self, wav: bytes) -> str:
        """Live: testo semplice, veloce."""
        try:
            return self._post(wav, "text").decode("utf-8", "replace").strip()
        except Exception as exc:
            _log(f"transcribe error: {exc}")
            return ""

    def transcribe_segments(self, wav: bytes) -> list[tuple[float, float, str]]:
        """Pass finale: segmenti con timestamp (verbose_json)."""
        import json

        try:
            raw = self._post(wav, "verbose_json")
            data = json.loads(raw.decode("utf-8", "replace"))
        except Exception as exc:
            _log(f"transcribe_segments error: {exc}")
            return []
        out: list[tuple[float, float, str]] = []
        for seg in data.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            start = float(seg.get("start", seg.get("t0", 0)) or 0)
            end = float(seg.get("end", seg.get("t1", start)) or start)
            out.append((start, end, text))
        return out
