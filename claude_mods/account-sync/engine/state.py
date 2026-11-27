"""The sync's own files: the baseline and digest cache, the last run's result, the run lock and the backups.

They live in ~/.claude/account-sync, outside the mod's folder, so reinstalling or moving the mod keeps the baseline. A
lost baseline would not break anything, but the next sync could no longer tell a session deleted since the last sync
from a new one, and would bring back the deleted ones that left no tombstone.
"""

from __future__ import annotations

import fcntl
import json
import os
import subprocess
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Iterator, Optional

from appdata import DigestCache, write_atomic
from planner import Baseline

STATE_DIR = Path.home() / ".claude" / "account-sync"
STATE_FILE = "state.json"
LAST_RUN_FILE = "last-run.json"
LOCK_FILE = "run.lock"
LOG_FILE = "worker.log"
BACKUPS_DIR = "backups"
KEPT_BACKUPS = 10
MAX_LOG_BYTES = 262144


class StateStore:
    def __init__(self, root: Path):
        self.root = root

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    @property
    def backups_dir(self) -> Path:
        return self.root / BACKUPS_DIR

    @property
    def log_path(self) -> Path:
        return self.root / LOG_FILE

    def _read_json(self, name: str) -> Optional[dict]:
        try:
            data = json.loads((self.root / name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def _write_json(self, name: str, data: dict) -> None:
        self.ensure()
        write_atomic(self.root / name, json.dumps(data, indent=1, sort_keys=True).encode("utf-8"))

    def load(self) -> "SyncState":
        data = self._read_json(STATE_FILE) or {}
        return SyncState(
            baseline=Baseline.from_json(data.get("baseline")),
            has_baseline="baseline" in data,
            cache=DigestCache(data.get("digestCache")),
            account_emails=dict(data.get("accountEmails", {})),
        )

    def save(self, state: "SyncState") -> None:
        data = {
            "version": 1,
            "digestCache": state.cache.to_json(),
            "accountEmails": state.account_emails,
        }
        if state.has_baseline:
            data["baseline"] = state.baseline.to_json()
        self._write_json(STATE_FILE, data)

    def last_run(self) -> Optional[dict]:
        return self._read_json(LAST_RUN_FILE)

    def save_last_run(self, result: dict) -> None:
        self._write_json(LAST_RUN_FILE, result)

    @contextmanager
    def lock(self) -> Iterator[None]:
        """Holds the run lock, so two workers never write at once. Raises BlockingIOError when one already runs."""
        self.ensure()
        fd = os.open(self.root / LOCK_FILE, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield
        finally:
            os.close(fd)

    def is_locked(self) -> bool:
        try:
            with self.lock():
                return False
        except BlockingIOError:
            return True

    def trim_log(self) -> None:
        """Keeps the worker log to its last quarter megabyte."""
        try:
            size = self.log_path.stat().st_size
        except FileNotFoundError:
            return
        if size > MAX_LOG_BYTES:
            with open(self.log_path, "rb") as handle:
                handle.seek(size - MAX_LOG_BYTES // 2)
                tail = handle.read()
            write_atomic(self.log_path, tail[tail.find(b"\n") + 1:])

    def rotate_backups(self) -> None:
        """Moves all but the newest backups to the Trash, where they stay restorable until it is emptied."""
        try:
            runs = sorted(d for d in self.backups_dir.iterdir() if d.is_dir())
        except FileNotFoundError:
            return
        old = runs[:-KEPT_BACKUPS]
        if old and Path("/usr/bin/trash").exists():
            subprocess.run(["/usr/bin/trash", *map(str, old)], check=False, capture_output=True)


class SyncState:
    def __init__(self, baseline: Baseline, has_baseline: bool, cache: DigestCache, account_emails: Dict[str, str]):
        self.baseline = baseline
        self.has_baseline = has_baseline
        self.cache = cache
        self.account_emails = account_emails
