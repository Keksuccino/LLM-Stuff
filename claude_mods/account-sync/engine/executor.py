"""Applies a plan to the app's files, keeping a backup of everything it changes so the run can be undone.

A run works in two steps. First it copies every file it will overwrite into a new backup folder and writes the
manifest, the list of every path it touches with where its old content went, and of every web storage entry it sets
with the value it had. Only then does it change anything, moving removed files into the backup instead of deleting
them. A run cut short is therefore still undone from its manifest: an entry whose backup never arrived names a file
that was never moved. The web storage database is also copied whole into the backup, for a recovery by hand should
the app ever refuse it.
"""

from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Dict, List, Optional, Set

import catalog
from appdata import (SESSION_PREFIX, DigestCache, Profile, encode_archive_index, encode_presets, is_archived,
                     archive_index_path, presets_path, read_archive_index, session_path, tombstone_path, write_atomic)
from planner import Baseline, Plan
from webstore import LocalStorage, local_storage_dir

MANIFEST = "manifest.json"


class ApplyFailed(Exception):
    """A run that failed after it started changing files. Its backup holds what it changed, so it can be undone."""

    def __init__(self, run_id: str, cause: BaseException):
        super().__init__(f"{type(cause).__name__}: {cause}")
        self.run_id = run_id
        self.cause = cause


class RunBackup:
    """One run's backup folder and manifest."""

    def __init__(self, backups_dir: Path, kind: str, baseline_before: Optional[dict]):
        backups_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Ids sort by time, which the rotation relies on; the counter only matters for runs within one millisecond.
        stamp = time.strftime("%Y%m%d-%H%M%S") + f".{int(time.time() * 1000) % 1000:03d}"
        for attempt in range(1000):
            run_id = f"{stamp}-{attempt:03d}"
            try:
                (backups_dir / run_id).mkdir(mode=0o700)
                break
            except FileExistsError:
                continue
        else:
            raise RuntimeError("Could not make a backup folder")
        self.dir = backups_dir / run_id
        (self.dir / "files").mkdir(mode=0o700)
        self.run_id = run_id
        self.entries: List[dict] = []
        self.web_entries: List[dict] = []
        self.kind = kind
        self.baseline_before = baseline_before
        self.is_complete = False

    def _slot(self, path: Path) -> str:
        return f"files/{len(self.entries):05d}-{path.name}"

    def copy_before_write(self, path: Path) -> None:
        """Keeps the current content of a file about to be overwritten, or notes that the run creates it."""
        if path.exists():
            rel = self._slot(path)
            shutil.copy2(path, self.dir / rel)
            self.entries.append({"path": str(path), "backup": rel})
        else:
            self.entries.append({"path": str(path), "backup": None})

    def reserve_move(self, path: Path) -> str:
        """Notes a file the run will move into the backup; the move itself comes with the change."""
        rel = self._slot(path)
        self.entries.append({"path": str(path), "backup": rel})
        return rel

    def keep_web_storage(self, storage: LocalStorage, before: Dict[str, Optional[str]]) -> None:
        """Notes the old value of each entry the run sets (None: it had none), and copies the database whole."""
        self.web_entries.extend({"key": key, "before": value} for key, value in before.items())
        copy = self.dir / "local-storage"
        copy.mkdir(mode=0o700)
        for name in os.listdir(storage.path):
            if name != "LOCK" and (storage.path / name).is_file():
                shutil.copy2(storage.path / name, copy / name)

    def write_manifest(self) -> None:
        manifest = {
            "version": 1,
            "kind": self.kind,
            "createdAt": int(time.time() * 1000),
            "complete": self.is_complete,
            "entries": self.entries,
            "webEntries": self.web_entries,
            "baselineBefore": self.baseline_before,
        }
        write_atomic(self.dir / MANIFEST, json.dumps(manifest, indent=1).encode("utf-8"))


def apply_plan(plan: Plan, app_dir: Path, backups_dir: Path, baseline_before: Optional[Baseline],
               cache: DigestCache, catalogs: catalog.Catalogs) -> Optional[str]:
    """Applies the plan. Returns the backup's run id, or None when there was nothing to change."""
    if not plan.session_ops and plan.presets_document is None:
        return None
    backup = RunBackup(backups_dir, "sync", baseline_before.to_json() if baseline_before is not None else None)
    storage = LocalStorage(local_storage_dir(app_dir))
    web_writes: Dict[str, str] = {}
    if plan.presets_document is not None:
        web_writes = catalog.store_writes(catalogs, plan.presets_document)

    touched: Dict[str, Profile] = {}
    moves: Dict[Path, str] = {}
    for op in plan.session_ops:
        touched[op.profile.key] = op.profile
        if op.kind == "put":
            backup.copy_before_write(session_path(op.profile, op.sid))
        elif op.kind == "remove":
            path = session_path(op.profile, op.sid)
            moves[path] = backup.reserve_move(path)
        elif op.kind == "tombstone":
            backup.copy_before_write(tombstone_path(op.profile, op.sid))
        elif op.kind == "untombstone":
            path = tombstone_path(op.profile, op.sid)
            moves[path] = backup.reserve_move(path)
    for profile in touched.values():
        backup.copy_before_write(archive_index_path(profile))
    if plan.presets_document is not None:
        backup.copy_before_write(presets_path(app_dir))
    if web_writes:
        backup.keep_web_storage(storage, {key: catalogs.store_values.get(key[len(catalog.STORE_PREFIX):])
                                          for key in web_writes})
    backup.write_manifest()

    try:
        sources: Dict[Path, bytes] = {}
        archive_changes: Dict[str, Dict[str, bool]] = {}
        for op in plan.session_ops:
            flags = archive_changes.setdefault(op.profile.key, {})
            if op.kind == "put":
                source = op.source
                data = sources.get(source.path)
                if data is None:
                    data = sources[source.path] = source.path.read_bytes()
                write_atomic(session_path(op.profile, op.sid), data, mtime_ns=source.mtime_ns)
                cache.store(op.profile.key, op.sid, len(data), source.mtime_ns, source.digest)
                flags[op.sid] = is_archived(data)
            elif op.kind == "remove":
                path = session_path(op.profile, op.sid)
                shutil.move(str(path), str(backup.dir / moves[path]))
                cache.forget(op.profile.key, op.sid)
                flags[op.sid] = False
            elif op.kind == "tombstone":
                write_atomic(tombstone_path(op.profile, op.sid), str(op.tombstone_ms).encode("utf-8"))
            elif op.kind == "untombstone":
                path = tombstone_path(op.profile, op.sid)
                shutil.move(str(path), str(backup.dir / moves[path]))

        for key, flags in archive_changes.items():
            _update_archive_index(touched[key], flags)
        if plan.presets_document is not None:
            write_atomic(presets_path(app_dir), encode_presets(catalog.file_document_after(catalogs,
                                                                                           plan.presets_document)))
        # Last, as the app trusts these entries over every file above.
        storage.write(web_writes)

    except Exception as error:
        raise ApplyFailed(backup.run_id, error) from error

    backup.is_complete = True
    backup.write_manifest()
    return backup.run_id


def _update_archive_index(profile: Profile, flags: Dict[str, bool]) -> None:
    current = read_archive_index(profile)
    if current is None:
        current = _archived_on_disk(profile)
        had_file = False
    else:
        had_file = True
    updated = set(current)
    for sid, archived in flags.items():
        name = SESSION_PREFIX + sid
        if archived:
            updated.add(name)
        else:
            updated.discard(name)
    if updated != current or (not had_file and updated):
        write_atomic(archive_index_path(profile), encode_archive_index(updated))


def _archived_on_disk(profile: Profile) -> Set[str]:
    archived = set()
    for path in profile.path.glob(f"{SESSION_PREFIX}*.json"):
        try:
            if is_archived(path.read_bytes()):
                archived.add(path.stem)
        except OSError:
            continue
    return archived


def read_manifest(backups_dir: Path, run_id: str) -> dict:
    return json.loads((backups_dir / run_id / MANIFEST).read_text(encoding="utf-8"))


def undo_run(backups_dir: Path, run_id: str, app_dir: Path) -> Optional[dict]:
    """Puts back every file the run changed and returns the baseline from before it.

    Files the run created are moved into the backup's `undone` folder, not deleted.
    """
    run_dir = backups_dir / run_id
    manifest = read_manifest(backups_dir, run_id)
    if manifest.get("undoneAt"):
        raise RuntimeError("This sync was already undone")
    undone_dir = run_dir / "undone"
    for index, entry in reversed(list(enumerate(manifest["entries"]))):
        path = Path(entry["path"])
        rel = entry["backup"]
        if rel is None:
            if path.exists():
                undone_dir.mkdir(exist_ok=True, mode=0o700)
                shutil.move(str(path), str(undone_dir / f"{index:05d}-{path.name}"))
            continue
        saved = run_dir / rel
        if not saved.exists():
            # A move the run never got to: the file is still in place.
            continue
        stat = saved.stat()
        write_atomic(path, saved.read_bytes(), mtime_ns=stat.st_mtime_ns)
    web_entries = manifest.get("webEntries") or []
    if web_entries:
        LocalStorage(local_storage_dir(app_dir)).write({entry["key"]: entry["before"] for entry in web_entries})
    manifest["undoneAt"] = int(time.time() * 1000)
    write_atomic(run_dir / MANIFEST, json.dumps(manifest, indent=1).encode("utf-8"))
    return manifest.get("baselineBefore")
