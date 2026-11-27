"""Tests of the sync engine against throwaway copies of the app's folder layout. Run with
`/usr/bin/python3 -B -m unittest discover -s tests` from the mod's folder. Nothing here touches the real app's data.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent / "engine"
sys.path.insert(0, str(ENGINE))

import appdata  # noqa: E402
from syncer import Engine  # noqa: E402
from state import StateStore  # noqa: E402

ACCOUNT_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
ORG_A = "a0a0a0a0-2222-4222-8222-a0a0a0a0a0a0"
ACCOUNT_B = "bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb"
ORG_B = "b0b0b0b0-4444-4444-8444-b0b0b0b0b0b0"
SID_1 = "11111111-1111-4111-8111-111111111111"
SID_2 = "22222222-2222-4222-8222-222222222222"
SID_3 = "33333333-3333-4333-8333-333333333333"


class AppFixture:
    """A fake ~/Library/Application Support/Claude with two accounts, as the app lays it out."""

    def __init__(self, root: Path):
        self.app = root / "Claude"
        self.state = root / "state"
        self.dirs = {ACCOUNT_A: self.app / "claude-code-sessions" / ACCOUNT_A / ORG_A,
                     ACCOUNT_B: self.app / "claude-code-sessions" / ACCOUNT_B / ORG_B}
        for account, path in self.dirs.items():
            path.mkdir(parents=True)
            (path / "scheduled-tasks.json").write_text("{}")
        # The cross folders the app makes, with nothing but scheduled tasks in them.
        for account, org in ((ACCOUNT_A, ORG_B), (ACCOUNT_B, ORG_A)):
            cross = self.app / "claude-code-sessions" / account / org
            cross.mkdir(parents=True)
            (cross / "scheduled-tasks.json").write_text("{}")
        (self.app / "plugin-list" / ACCOUNT_A / ORG_A).mkdir(parents=True)
        (self.app / "plugin-list" / ACCOUNT_B / ORG_B).mkdir(parents=True)
        (self.app / "config.json").write_text(json.dumps({"lastKnownAccountUuid": ACCOUNT_B, "oauth:tokenCache": "x"}))
        self.write_presets({ACCOUNT_A: {"presets": [], "seededFromDraft": True},
                            ACCOUNT_B: {"presets": [], "seededFromDraft": True}})
        self.clock = int(time.time()) - 10_000

    def engine(self) -> Engine:
        return Engine(self.app, StateStore(self.state))

    def tick(self) -> int:
        self.clock += 10
        return self.clock

    def session(self, account: str, sid: str, title: str = "t", archived: bool = False, at=None) -> Path:
        path = self.dirs[account] / f"local_{sid}.json"
        path.write_text(json.dumps({"sessionId": f"local_{sid}", "title": title, "isArchived": archived}))
        stamp = at if at is not None else self.tick()
        os.utime(path, (stamp, stamp))
        return path

    def tombstone(self, account: str, sid: str, at_ms: int) -> None:
        (self.dirs[account] / f"deleted_{sid}").write_text(str(at_ms))

    def file(self, account: str, sid: str) -> Path:
        return self.dirs[account] / f"local_{sid}.json"

    def archived_index(self, account: str):
        path = self.dirs[account] / "archived-sessions.idx"
        return json.loads(path.read_text())["archived"] if path.exists() else None

    def write_presets(self, by_account: dict) -> None:
        (self.app / "ccd-session-presets.json").write_text(json.dumps({"byAccount": by_account}, indent="\t"))

    def presets(self, account: str) -> list:
        data = json.loads((self.app / "ccd-session-presets.json").read_text())
        return data["byAccount"][account]["presets"]


def preset(pid: str, name: str, last_used: int = 1, folder: str = "/tmp/x") -> dict:
    return {"id": pid, "name": name, "createdAt": 1, "lastUsedAt": last_used,
            "target": {"kind": "local", "cwd": folder}, "settings": {"effort": "high"}}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.fx = AppFixture(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def sync(self, max_removals=None) -> dict:
        result = self.fx.engine().run_action("sync", max_removals)
        self.assertTrue(result["ok"], result.get("error"))
        return result

    def test_profiles_skip_the_folders_without_sessions(self):
        self.fx.session(ACCOUNT_A, SID_1)
        profiles, passed_over = appdata.discover_profiles(self.fx.app)
        self.assertEqual({(p.account, p.org) for p in profiles}, {(ACCOUNT_A, ORG_A), (ACCOUNT_B, ORG_B)})
        self.assertEqual(passed_over, [])

    def test_first_sync_merges_both_ways_and_keeps_files_identical(self):
        a = self.fx.session(ACCOUNT_A, SID_1, archived=True)
        self.fx.session(ACCOUNT_B, SID_2)
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "🌸 | Alice")], "seededFromDraft": True},
                               ACCOUNT_B: {"presets": [], "seededFromDraft": True}})
        preview = self.fx.engine().preview()
        self.assertEqual(preview["changes"][ACCOUNT_B]["sessionsAdded"], 1)
        self.assertEqual(preview["changes"][ACCOUNT_B]["environmentsAdded"], 1)
        self.assertEqual(preview["changes"][ACCOUNT_A]["sessionsAdded"], 1)

        self.sync()
        copy = self.fx.file(ACCOUNT_B, SID_1)
        self.assertEqual(copy.read_bytes(), a.read_bytes())
        self.assertEqual(copy.stat().st_mtime_ns, a.stat().st_mtime_ns)
        self.assertEqual(oct(copy.stat().st_mode & 0o777), "0o600")
        self.assertTrue(self.fx.file(ACCOUNT_A, SID_2).exists())
        self.assertEqual(self.fx.archived_index(ACCOUNT_B), [f"local_{SID_1}"])
        self.assertEqual([p["name"] for p in self.fx.presets(ACCOUNT_B)], ["🌸 | Alice"])
        raw = (self.fx.app / "ccd-session-presets.json").read_bytes()
        self.assertIn("🌸".encode("utf-8"), raw)
        self.assertTrue(raw.startswith(b"{\n\t\"byAccount\""))
        self.assertFalse(raw.endswith(b"\n"))
        self.assertEqual(self.fx.engine().preview()["total"], 0)

    def test_a_deletion_with_a_tombstone_reaches_the_other_account(self):
        self.fx.session(ACCOUNT_A, SID_1, archived=True)
        self.sync()
        self.fx.file(ACCOUNT_A, SID_1).unlink()
        self.fx.tombstone(ACCOUNT_A, SID_1, int(time.time() * 1000))
        preview = self.fx.engine().preview()
        self.assertEqual(preview["changes"][ACCOUNT_B]["sessionsRemoved"], 1)

        self.sync()
        self.assertFalse(self.fx.file(ACCOUNT_B, SID_1).exists())
        self.assertTrue((self.fx.dirs[ACCOUNT_B] / f"deleted_{SID_1}").exists())
        self.assertEqual(self.fx.archived_index(ACCOUNT_B), [])

    def test_a_file_gone_since_the_last_sync_counts_as_deleted(self):
        self.fx.session(ACCOUNT_A, SID_1)
        self.sync()
        self.fx.file(ACCOUNT_B, SID_1).unlink()
        self.sync()
        self.assertFalse(self.fx.file(ACCOUNT_A, SID_1).exists())

    def test_a_session_deleted_before_any_sync_is_not_brought_back(self):
        self.fx.session(ACCOUNT_A, SID_1, at=self.fx.clock - 500)
        self.fx.tombstone(ACCOUNT_B, SID_1, int(time.time() * 1000))
        self.sync()
        self.assertFalse(self.fx.file(ACCOUNT_A, SID_1).exists())
        self.assertFalse(self.fx.file(ACCOUNT_B, SID_1).exists())

    def test_the_changed_copy_wins_and_the_newest_when_both_changed(self):
        self.fx.session(ACCOUNT_A, SID_1, title="first")
        self.fx.session(ACCOUNT_A, SID_2, title="first")
        self.sync()
        self.fx.session(ACCOUNT_B, SID_1, title="renamed in B", at=self.fx.clock - 1000)
        self.fx.session(ACCOUNT_A, SID_2, title="older edit")
        self.fx.session(ACCOUNT_B, SID_2, title="newer edit")
        self.sync()
        self.assertIn("renamed in B", self.fx.file(ACCOUNT_A, SID_1).read_text())
        self.assertIn("newer edit", self.fx.file(ACCOUNT_A, SID_2).read_text())

    def test_a_session_continued_after_its_deletion_comes_back(self):
        self.fx.session(ACCOUNT_A, SID_1)
        self.sync()
        deleted_at = (self.fx.clock + 5) * 1000
        self.fx.file(ACCOUNT_A, SID_1).unlink()
        self.fx.tombstone(ACCOUNT_A, SID_1, deleted_at)
        self.fx.session(ACCOUNT_B, SID_1, title="continued")
        preview = self.fx.engine().preview()
        self.assertEqual(preview["changes"][ACCOUNT_A]["sessionsRestored"], 1)
        self.sync()
        self.assertIn("continued", self.fx.file(ACCOUNT_A, SID_1).read_text())
        self.assertFalse((self.fx.dirs[ACCOUNT_A] / f"deleted_{SID_1}").exists())

    def test_environments_follow_additions_edits_and_deletions(self):
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "Alice"), preset("p2", "FancyMenu")]},
                               ACCOUNT_B: {"presets": []}})
        self.sync()
        self.fx.write_presets({
            ACCOUNT_A: {"presets": [preset("p1", "Alice", last_used=50), preset("p3", "New")]},
            ACCOUNT_B: {"presets": [preset("p1", "Alice", last_used=9), preset("p2", "FancyMenu 2")]},
        })
        preview = self.fx.engine().preview()
        changes_b = preview["changes"][ACCOUNT_B]
        self.assertEqual((changes_b["environmentsAdded"], changes_b["environmentsUpdated"]), (1, 0))
        self.sync()
        for account in (ACCOUNT_A, ACCOUNT_B):
            names = {p["id"]: p["name"] for p in self.fx.presets(account)}
            # p2 was deleted in A but edited in B, and an edit beats a deletion.
            self.assertEqual(names, {"p1": "Alice", "p2": "FancyMenu 2", "p3": "New"})
            self.assertEqual({p["id"]: p["lastUsedAt"] for p in self.fx.presets(account)}["p1"], 50)

        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "Alice", last_used=50), preset("p3", "New")]},
                               ACCOUNT_B: {"presets": [preset("p1", "Alice", last_used=50), preset("p2", "FancyMenu 2"),
                                                       preset("p3", "New")]}})
        self.sync()
        self.assertEqual({p["id"] for p in self.fx.presets(ACCOUNT_B)}, {"p1", "p3"})

    def test_the_signed_in_account_wins_when_both_edited_an_environment(self):
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "Alice")]}, ACCOUNT_B: {"presets": []}})
        self.sync()
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "Edit in A", last_used=99)]},
                               ACCOUNT_B: {"presets": [preset("p1", "Edit in B")]}})
        self.sync()
        self.assertEqual(self.fx.presets(ACCOUNT_A)[0]["name"], "Edit in B")

    def test_an_account_new_to_the_presets_file_gets_the_environments_and_no_seeding(self):
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "Alice")], "seededFromDraft": True}})
        self.sync()
        data = json.loads((self.fx.app / "ccd-session-presets.json").read_text())
        self.assertTrue(data["byAccount"][ACCOUNT_B]["seededFromDraft"])
        self.assertEqual(len(data["byAccount"][ACCOUNT_B]["presets"]), 1)

    def test_undo_puts_back_every_file_and_the_baseline(self):
        self.fx.session(ACCOUNT_A, SID_1)
        self.fx.session(ACCOUNT_A, SID_3, title="old")
        self.sync()
        presets_before = (self.fx.app / "ccd-session-presets.json").read_bytes()
        self.fx.session(ACCOUNT_B, SID_2)
        self.fx.session(ACCOUNT_B, SID_3, title="new")
        before = {p: p.read_bytes() for p in [self.fx.file(ACCOUNT_A, SID_3)]}
        result = self.sync()
        self.assertTrue(result["undoable"])
        self.assertTrue(self.fx.file(ACCOUNT_A, SID_2).exists())

        undo = self.fx.engine().run_action("undo", None)
        self.assertTrue(undo["ok"], undo.get("error"))
        self.assertFalse(self.fx.file(ACCOUNT_A, SID_2).exists())
        for path, data in before.items():
            self.assertEqual(path.read_bytes(), data)
        self.assertEqual((self.fx.app / "ccd-session-presets.json").read_bytes(), presets_before)
        # Back on the baseline of the first sync: B's newer copy of SID_3 is an edit again.
        preview = self.fx.engine().preview()
        self.assertEqual(preview["changes"][ACCOUNT_A]["sessionsUpdated"], 1)
        self.assertFalse(self.fx.engine().run_action("undo", None)["ok"])

    def test_a_run_that_fails_halfway_can_be_undone(self):
        import executor

        self.fx.session(ACCOUNT_A, SID_1)
        self.fx.session(ACCOUNT_A, SID_2)
        real_write = executor.write_atomic
        calls = []

        def failing_write(path, data, mtime_ns=None):
            # The first write is the manifest, the second the first session copy: the third one fails.
            calls.append(path)
            if len(calls) == 3:
                raise OSError("disk full")
            real_write(path, data, mtime_ns)

        executor.write_atomic = failing_write
        try:
            result = self.fx.engine().run_action("sync", None)
        finally:
            executor.write_atomic = real_write
        self.assertFalse(result["ok"])
        self.assertTrue(result["undoable"])
        self.assertEqual(sum(self.fx.file(ACCOUNT_B, sid).exists() for sid in (SID_1, SID_2)), 1)

        self.assertTrue(self.fx.engine().run_action("undo", None)["ok"])
        self.assertFalse(any(self.fx.file(ACCOUNT_B, sid).exists() for sid in (SID_1, SID_2)))
        self.assertTrue(self.fx.engine().preview()["isFirstSync"])

    def test_a_refused_run_keeps_the_sync_before_it_undoable(self):
        self.fx.session(ACCOUNT_A, SID_1)
        self.fx.session(ACCOUNT_A, SID_2)
        self.sync()
        for sid in (SID_1, SID_2):
            self.fx.file(ACCOUNT_A, sid).unlink()
        self.assertFalse(self.fx.engine().run_action("sync", 0)["ok"])
        last = StateStore(self.fx.state).last_run()
        self.assertTrue(last["undoable"])
        self.assertEqual(last["lastError"]["kind"], "sync")

    def test_more_removals_than_the_preview_showed_are_refused(self):
        self.fx.session(ACCOUNT_A, SID_1)
        self.fx.session(ACCOUNT_A, SID_2)
        self.sync()
        for sid in (SID_1, SID_2):
            self.fx.file(ACCOUNT_A, sid).unlink()
        result = self.fx.engine().run_action("sync", 1)
        self.assertFalse(result["ok"])
        self.assertTrue(self.fx.file(ACCOUNT_B, SID_1).exists())

    def test_emptying_most_of_an_account_is_refused_without_a_preview(self):
        sids = [f"{n:08d}-0000-4000-8000-000000000000" for n in range(12)]
        for sid in sids:
            self.fx.session(ACCOUNT_A, sid)
        self.sync()
        for sid in sids:
            self.fx.file(ACCOUNT_A, sid).unlink()
        self.assertFalse(self.fx.engine().run_action("sync", None)["ok"])
        self.assertTrue(self.fx.engine().run_action("sync", 12)["ok"])

    def test_launch_returns_at_once_and_the_worker_records_its_result(self):
        self.fx.session(ACCOUNT_A, SID_1)
        started = time.monotonic()
        output = subprocess.run(
            [sys.executable, "-B", str(ENGINE), "--app-dir", str(self.fx.app), "--state-dir", str(self.fx.state),
             "launch", "--no-app-control"],
            capture_output=True, text=True, timeout=30)
        self.assertLess(time.monotonic() - started, 10)
        self.assertTrue(json.loads(output.stdout)["started"])
        deadline = time.monotonic() + 15
        last_run = None
        while time.monotonic() < deadline and last_run is None:
            time.sleep(0.2)
            path = self.fx.state / "last-run.json"
            last_run = json.loads(path.read_text()) if path.exists() else None
        self.assertIsNotNone(last_run)
        self.assertTrue(last_run["ok"])
        self.assertTrue(self.fx.file(ACCOUNT_B, SID_1).exists())


if __name__ == "__main__":
    unittest.main()
