"""Protocollo JSONL main <-> sidecar (BUILD-SPEC §6.1).

Una riga = un oggetto JSON. Comandi su stdin, eventi su stdout.
Le funzioni emit_* scrivono su stdout e flushano subito.
"""

from __future__ import annotations

import json
import sys
import threading
from typing import Any

_stdout_lock = threading.Lock()


def _emit(obj: dict[str, Any]) -> None:
    line = json.dumps(obj, ensure_ascii=False)
    with _stdout_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def emit_ready() -> None:
    _emit({"event": "ready"})


def emit_devices(mic: list[dict[str, Any]], loopback: list[dict[str, Any]]) -> None:
    _emit({"event": "devices", "mic": mic, "loopback": loopback})


def emit_status(session_id: str, state: str) -> None:
    # state: capturing | finalizing
    _emit({"event": "status", "session_id": session_id, "state": state})


def emit_segment(
    session_id: str, speaker: str, ts_start: float, ts_end: float, text: str, seq: int
) -> None:
    _emit(
        {
            "event": "segment",
            "session_id": session_id,
            "speaker": speaker,
            "ts_start": round(ts_start, 2),
            "ts_end": round(ts_end, 2),
            "text": text,
            "seq": seq,
        }
    )


def emit_final(session_id: str, segments: list[dict[str, Any]]) -> None:
    # transcript autoritativo (pass finale): sostituisce i segmenti live.
    _emit({"event": "final", "session_id": session_id, "segments": segments})


def emit_stopped(session_id: str) -> None:
    _emit({"event": "stopped", "session_id": session_id})


def emit_error(message: str, fatal: bool = False) -> None:
    _emit({"event": "error", "message": message, "fatal": fatal})


def log(message: str) -> None:
    """Diagnostica su stderr (non interferisce col canale JSONL)."""
    sys.stderr.write(f"[sidecar] {message}\n")
    sys.stderr.flush()
