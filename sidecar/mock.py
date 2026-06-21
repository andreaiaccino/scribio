"""Sidecar mock: stesso protocollo JSONL, segmenti finti. Per sviluppare la UI
senza audio reale (BUILD-SPEC §11). Avvio: SCRIBIO_SIDECAR_MOCK=1.
"""

from __future__ import annotations

import json
import random
import sys
import threading
import time

import protocol as proto

LINES = [
    ("others", "Allora, partiamo dal punto sulla reportistica di fine mese."),
    ("me", "Perfetto. Quante persone sono coinvolte nel processo attuale?"),
    ("others", "Almeno quattro, e ci vanno via un paio di giorni a testa."),
    ("me", "Capito, quindi c'è parecchio margine di automazione."),
    ("others", "Esatto. E ci servirebbero permessi granulari e un log delle modifiche."),
    ("me", "Lo segno tra le esigenze chiave. Vi serve anche il self-hosting?"),
    ("others", "Sì, per motivi di sicurezza preferiamo tenere tutto in casa."),
]


class MockSession:
    def __init__(self, session_id: str):
        self.id = session_id
        self._stop = threading.Event()
        self._t0 = time.monotonic()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        proto.emit_status(self.id, "capturing")
        self._thread.start()

    def _run(self) -> None:
        seq = 0
        i = 0
        while not self._stop.is_set():
            time.sleep(2.5)
            if self._stop.is_set():
                break
            speaker, text = LINES[i % len(LINES)]
            i += 1
            seq += 1
            t = time.monotonic() - self._t0
            proto.emit_segment(self.id, speaker, t, t + 2.0, text, seq)

    def stop(self) -> None:
        proto.emit_status(self.id, "finalizing")
        self._stop.set()
        self._thread.join(timeout=2.0)
        proto.emit_stopped(self.id)


class MockProbe:
    """Emette livelli finti (random, ondulati) per il VU-meter dell'onboarding."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> None:
        self._thread.start()

    def _run(self) -> None:
        phase = 0.0
        while not self._stop.is_set():
            phase += 0.4
            for speaker in ("me", "others"):
                base = 0.18 + 0.12 * abs((phase % 2.0) - 1.0)
                proto.emit_level(speaker, max(0.0, base + random.uniform(-0.05, 0.05)))
            time.sleep(0.1)

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1.0)


def main() -> None:
    proto.emit_ready()
    session: MockSession | None = None
    probe: MockProbe | None = None
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        cmd = msg.get("cmd")
        if cmd == "list_devices":
            proto.emit_devices(
                [{"index": 0, "name": "Mock Microphone"}],
                [{"index": 1, "name": "Mock Loopback (Speakers)"}],
            )
        elif cmd == "start":
            if probe is not None:
                probe.stop()
                probe = None
            if session is None:
                session = MockSession(str(msg.get("session_id", "")))
                session.start()
        elif cmd == "stop":
            if session is not None:
                session.stop()
                session = None
        elif cmd == "probe":
            if probe is None:
                probe = MockProbe()
                probe.start()
        elif cmd == "probe_stop":
            if probe is not None:
                probe.stop()
                probe = None
    if probe is not None:
        probe.stop()
    if session is not None:
        session.stop()


if __name__ == "__main__":
    main()
