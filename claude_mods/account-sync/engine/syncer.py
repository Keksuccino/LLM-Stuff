"""Runs a sync or an undo: the preview, the guards against a misread folder, the lock, and the worker that quits and
reopens the app around a run.
"""

from __future__ import annotations

import json
import time
import traceback
from pathlib import Path
from typing import Callable, Optional

import appctl
import appdata
import catalog
import executor
import planner
from state import StateStore, SyncState

# Without a preview to compare with, a run that would empty more than half of an account's sessions is taken for a
# misread folder and refused.
MASS_REMOVAL_MIN = 10


class Refused(Exception):
    """A run the engine will not do, with the reason the pane shows."""


def _now_ms() -> int:
    return int(time.time() * 1000)


def _log(message: str) -> None:
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}", flush=True)


class Engine:
    def __init__(self, app_dir: Path, store: StateStore):
        self.app_dir = app_dir
        self.store = store

    def _load_state(self) -> SyncState:
        state = self.store.load()
        found = appdata.cli_account_email()
        if found:
            state.account_emails[found[0]] = found[1]
        return state

    def _scan(self, state: SyncState):
        profiles, passed_over = appdata.discover_profiles(self.app_dir)
        scans = [appdata.scan_profile(profile, state.cache) for profile in profiles]
        catalogs = catalog.read_catalogs(self.app_dir, sorted({p.account for p in profiles}))
        active = appdata.active_account(self.app_dir)
        plan = planner.make_plan(scans, catalogs.document(), state.baseline, active, _now_ms())
        return scans, passed_over, catalogs, active, plan

    def preview(self) -> dict:
        state = self._load_state()
        scans, passed_over, catalogs, active, plan = self._scan(state)
        self.store.save(state)
        accounts = []
        for scan in scans:
            account = scan.profile.account
            archived = appdata.read_archive_index(scan.profile) or set()
            entry = catalogs.by_account.get(account, {})
            accounts.append({
                "id": account,
                "email": state.account_emails.get(account),
                "isActive": account == active,
                "sessions": len(scan.sessions),
                "archived": len(archived),
                "environments": len(planner.presets_of(entry)),
            })
        accounts.sort(key=lambda a: (not a["isActive"], a["id"]))
        return {
            "ok": True,
            "accounts": accounts,
            "changes": {account: change.to_json() for account, change in plan.changes.items()},
            "total": plan.total if len(scans) > 1 else 0,
            "removals": sum(1 for op in plan.session_ops if op.kind == "remove"),
            "isFirstSync": not state.has_baseline,
            "passedOver": passed_over,
            "lastRun": self.store.last_run(),
            "isWorking": self.store.is_locked(),
        }

    def sync(self, max_removals: Optional[int]) -> dict:
        state = self._load_state()
        scans, _, catalogs, _, plan = self._scan(state)
        if len(scans) < 2:
            raise Refused("Only one account has Code sessions on this Mac, so there is nothing to sync.")
        removals = sum(1 for op in plan.session_ops if op.kind == "remove")
        if max_removals is not None and removals > max_removals:
            raise Refused(f"The sync would delete {removals} sessions, more than the preview showed. Nothing was "
                          "changed; open the pane again to see the new preview.")
        if max_removals is None:
            for scan in scans:
                count = plan.removals_in(scan.profile)
                if count >= MASS_REMOVAL_MIN and count * 2 > len(scan.sessions):
                    raise Refused(f"The sync would delete {count} of {len(scan.sessions)} sessions in one account, "
                                  "which looks like a misread folder. Nothing was changed.")
        before = state.baseline if state.has_baseline else None
        run_id = executor.apply_plan(plan, self.app_dir, self.store.backups_dir, before, state.cache, catalogs)
        state.baseline = plan.baseline_after
        state.has_baseline = True
        self.store.save(state)
        self.store.rotate_backups()
        return {
            "kind": "sync",
            "ok": True,
            "finishedAt": _now_ms(),
            "changes": {account: change.to_json() for account, change in plan.changes.items()},
            "total": plan.total,
            "backup": run_id,
            "undoable": run_id is not None,
        }

    def undo(self) -> dict:
        last = self.store.last_run() or {}
        if last.get("kind") != "sync" or not last.get("undoable") or not last.get("backup"):
            raise Refused("There is no sync to undo.")
        baseline_before = executor.undo_run(self.store.backups_dir, last["backup"], self.app_dir)
        state = self.store.load()
        state.baseline = planner.Baseline.from_json(baseline_before)
        state.has_baseline = baseline_before is not None
        self.store.save(state)
        return {"kind": "undo", "ok": True, "finishedAt": _now_ms(), "undid": last["backup"], "undoable": False}

    def run_action(self, action: str, max_removals: Optional[int]) -> dict:
        """Runs one action under the lock and records its result, a failure included."""
        try:
            with self.store.lock():
                try:
                    result = self.sync(max_removals) if action == "sync" else self.undo()
                except Refused as refusal:
                    result = {"kind": action, "ok": False, "finishedAt": _now_ms(), "error": str(refusal)}
                except executor.ApplyFailed as failure:
                    traceback.print_exc()
                    result = {"kind": action, "ok": False, "finishedAt": _now_ms(), "error": str(failure),
                              "backup": failure.run_id, "undoable": True}
                except Exception as error:  # Reported to the pane; the details go to the log.
                    traceback.print_exc()
                    result = {"kind": action, "ok": False, "finishedAt": _now_ms(),
                              "error": f"{type(error).__name__}: {error}"}
                self._record(action, result)
                return result
        except BlockingIOError:
            return {"kind": action, "ok": False, "finishedAt": _now_ms(), "error": "Another sync is already running."}

    def _record(self, action: str, result: dict) -> None:
        """Saves the result as the last run. A failure that changed nothing keeps the sync before it undoable: the
        failure is noted on that sync's record instead of taking its place."""
        previous = self.store.last_run()
        if (not result["ok"] and not result.get("undoable") and previous and previous.get("kind") == "sync"
                and previous.get("undoable")):
            previous["lastError"] = {"kind": action, "error": result["error"], "finishedAt": result["finishedAt"]}
            self.store.save_last_run(previous)
        else:
            self.store.save_last_run(result)


def worker(engine: Engine, action: str, max_removals: Optional[int], control_app: bool) -> Callable[[], int]:
    def run() -> int:
        _log(f"worker started: {action}")
        bundle = None
        try:
            if control_app:
                bundle = appctl.quit_app(_log)
            result = engine.run_action(action, max_removals)
            _log(f"result: {json.dumps(result)}")
            return 0 if result.get("ok") else 1
        finally:
            if control_app and bundle is not None:
                appctl.open_app(bundle, _log)
            engine.store.trim_log()
    return run
