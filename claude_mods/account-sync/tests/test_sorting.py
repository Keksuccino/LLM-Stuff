"""Tests of the sidebar order snapshots against throwaway copies of the app's folder layout. Run with
`/usr/bin/python3 -B -m unittest discover -s tests` from the mod's folder. Nothing here touches the real app's data.
"""

import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from test_engine import ACCOUNT_A, ACCOUNT_B, ENGINE, ORG_A, ORG_B, AppFixture, preset

import sorting  # noqa: E402

ORDER = ["preset::p2", "keksuccino/kaleeta", "preset::p1", "/Volumes/X/silent_hill_decomp", "preset::gone"]
SCOPE_A = f"{ACCOUNT_A}/{ORG_A}"
SCOPE_B = f"{ACCOUNT_B}/{ORG_B}"


def sections(group_by=None, collapsed=False, empty_groups=False):
    sessions = {"id": "sessions", "kind": "sessions", "v": 2, "order": 2, "sortBy": "recency", "ascending": False,
                "show": {"metadata": False, "emptyGroups": empty_groups}, "collapsed": collapsed, "shown": True}
    if group_by:
        sessions["groupBy"] = group_by
    pinned = {"id": "pinned", "kind": "pinned", "v": 2, "order": 0, "sortBy": "recency", "collapsed": False}
    return {"sections": [pinned, sessions], "migratedFrom": 1, "prefsSeeded": True}


class SortingTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.fx = AppFixture(Path(self._tmp.name))
        self.fx.write_presets({ACCOUNT_A: {"presets": [preset("p1", "🌸 | Alice"), preset("p2", "🫟 | FancyMenu")]},
                               ACCOUNT_B: {"presets": [preset("p1", "🌸 | Alice"), preset("p2", "🫟 | FancyMenu")]}})
        self.engine = self.fx.engine()
        self.now = int(time.time() * 1000)

    def tearDown(self):
        self._tmp.cleanup()

    def lss(self, value):
        return json.dumps({"value": value, "tabId": "", "timestamp": 1}, ensure_ascii=False)

    def set_sidebar(self, by_scope, collapsed_groups=(), custom=None, starred=()):
        """The sidebar's own entries, as the app keeps them: sections twice (an LSS entry and dframe-store)."""
        state = {"sidebarWidth": 305, "collapsedGroups": list(collapsed_groups), "groupByByMode": {},
                 "sortByByMode": {}, "codeSidebarByScope": by_scope,
                 "customGroupsByScope": custom or {}, "lastSidebarScopeKey": SCOPE_B}
        self.fx.web.write({
            sorting.SECTIONS_KEY: self.lss(by_scope),
            sorting.SIDEBAR_STORE_KEY: json.dumps({"state": state, "version": 1, "shared": 2}),
            sorting.SIDEBAR_BACKUP_KEY: json.dumps({"state": {"sidebarWidth": 305,
                                                              "collapsedGroups": list(collapsed_groups)},
                                                    "version": 1, "shared": 2}),
            sorting.STARRED_GROUPS_KEY: self.lss(list(starred)),
            "dframe-code-pinned-project-ids": json.dumps([]),
        })

    def entry(self, key):
        raw = self.fx.web.read(key).get(key)
        return None if raw is None else json.loads(raw)

    def set_order(self, account, groups):
        value = None if groups is None else json.dumps({"value": groups, "tabId": "", "timestamp": 1})
        self.fx.web.write({sorting.order_key(account): value})

    def order(self, account):
        raw = self.fx.web.read(sorting.order_key(account)).get(sorting.order_key(account))
        return None if raw is None else json.loads(raw)

    def capture(self, trigger="manual", at=None):
        return sorting.capture(self.fx.app, self.engine.sorting, trigger, at or self.now)

    def snapshots(self):
        return self.engine.sorting.history()["snapshots"]

    def test_a_snapshot_names_every_group_as_the_sidebar_does(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.assertEqual(self.capture()["saved"], 1)
        snapshot = self.snapshots()[0]
        self.assertEqual(snapshot["groups"], ORDER)
        self.assertEqual(snapshot["account"], ACCOUNT_B)
        self.assertEqual(snapshot["labels"],
                         ["🫟 | FancyMenu", "kaleeta", "🌸 | Alice", "silent_hill_decomp", "Deleted environment"])

    def test_the_same_order_is_kept_once_and_moves_to_the_top(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.capture(at=self.now)
        self.set_order(ACCOUNT_B, list(reversed(ORDER)))
        self.capture(at=self.now + 1000)
        self.set_order(ACCOUNT_B, ORDER)
        self.assertEqual(self.capture(at=self.now + 2000)["saved"], 0)
        snapshots = self.snapshots()
        self.assertEqual(len(snapshots), 2)
        self.assertEqual(snapshots[0]["groups"], ORDER)
        self.assertEqual(snapshots[0]["takenAt"], self.now + 2000)

    def test_automatic_snapshots_wait_for_the_gap_and_manual_ones_do_not(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.assertEqual(self.capture("auto", self.now)["saved"], 1)
        self.set_order(ACCOUNT_B, list(reversed(ORDER)))
        self.assertEqual(self.capture("auto", self.now + 60_000)["reason"], "too-soon")
        self.assertEqual(self.capture("manual", self.now + 60_000)["saved"], 1)
        self.set_order(ACCOUNT_B, ORDER[:2])
        self.assertEqual(self.capture("auto", self.now + sorting.AUTO_MIN_GAP_MS)["saved"], 1)

    def test_the_history_keeps_the_newest_twenty(self):
        for index in range(sorting.MAX_SNAPSHOTS + 5):
            self.set_order(ACCOUNT_B, [f"group-{index}"])
            self.capture(at=self.now + index)
        snapshots = self.snapshots()
        self.assertEqual(len(snapshots), sorting.MAX_SNAPSHOTS)
        self.assertEqual(snapshots[0]["groups"], [f"group-{sorting.MAX_SNAPSHOTS + 4}"])

    def test_an_account_on_the_default_order_saves_nothing(self):
        result = self.capture()
        self.assertEqual((result["saved"], result["reason"]), (0, "no-order"))
        self.assertEqual(self.snapshots(), [])

    def test_a_snapshot_of_one_account_restores_into_the_signed_in_one(self):
        self.set_order(ACCOUNT_A, ORDER)
        self.capture(at=self.now)
        snapshot_id = self.snapshots()[0]["id"]
        # Account A's order is gone, as after switching away from it; B (signed in) has an order of its own.
        self.set_order(ACCOUNT_A, None)
        self.set_order(ACCOUNT_B, ["keksuccino/kaleeta"])
        result = self.engine.run_restore_sorting(snapshot_id)
        self.assertTrue(result["ok"], result.get("error"))
        written = self.order(ACCOUNT_B)
        self.assertEqual(written["value"], ORDER)
        self.assertEqual(written["tabId"], "")
        self.assertIsInstance(written["timestamp"], int)
        # The order B had before is kept as a snapshot of its own.
        before = [s for s in self.snapshots() if s["trigger"] == "before-restore"]
        self.assertEqual([s["groups"] for s in before], [["keksuccino/kaleeta"]])
        self.assertTrue(self.engine.sorting.last_restore()["ok"])

    def test_a_snapshot_no_longer_in_the_history_is_refused(self):
        result = self.engine.run_restore_sorting("missing")
        self.assertFalse(result["ok"])
        self.assertIsNone(self.order(ACCOUNT_B))

    def test_the_overview_marks_the_order_in_use(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.capture()
        overview = self.engine.sorting_overview()
        self.assertEqual(overview["activeAccount"], ACCOUNT_B)
        self.assertEqual(overview["current"][ACCOUNT_B], overview["snapshots"][0]["digest"])

    def test_a_snapshot_holds_the_grouping_and_sorting_it_was_made_under(self):
        self.set_sidebar({SCOPE_B: sections("savedEnvironment", empty_groups=True)},
                         custom={SCOPE_B: {"groups": ["g1"], "assignments": {}, "order": {}}}, starred=["preset::p1"])
        self.set_order(ACCOUNT_B, ORDER)
        self.capture()
        snapshot = self.snapshots()[0]
        self.assertEqual(snapshot["summary"], {"groupBy": "savedEnvironment", "sortBy": "recency",
                                               "ascending": False, "emptyGroups": True})
        layout = snapshot["layout"]
        self.assertEqual(layout["sections"], sections("savedEnvironment", empty_groups=True))
        self.assertEqual(layout["customGroups"]["groups"], ["g1"])
        self.assertEqual(layout["starredGroups"], ["preset::p1"])
        self.assertEqual(layout["projectPins"], {"dframe-code-pinned-project-ids": []})

    def test_a_different_grouping_is_a_different_snapshot(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.set_sidebar({SCOPE_B: sections("savedEnvironment")})
        self.capture(at=self.now)
        self.set_sidebar({SCOPE_B: sections(None)})
        self.assertEqual(self.capture(at=self.now + 1)["saved"], 1)

    def test_folding_groups_or_sections_makes_no_new_snapshot(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.set_sidebar({SCOPE_B: sections("savedEnvironment")})
        self.capture(at=self.now)
        self.set_sidebar({SCOPE_B: sections("savedEnvironment", collapsed=True)},
                         collapsed_groups=["project-preset::p1"])
        self.assertEqual(self.capture(at=self.now + 1)["saved"], 0)
        snapshots = self.snapshots()
        self.assertEqual(len(snapshots), 1)
        # The kept snapshot carries the latest fold state.
        self.assertEqual(snapshots[0]["layout"]["collapsedGroups"], ["project-preset::p1"])

    def test_a_restore_puts_back_the_whole_layout_in_the_signed_in_account(self):
        # Made in account A, grouped by environment with empty groups shown and one group folded.
        self.set_sidebar({SCOPE_A: sections("savedEnvironment", empty_groups=True)},
                         collapsed_groups=["project-preset::p2"], starred=["preset::p2"],
                         custom={SCOPE_A: {"groups": ["mine"], "assignments": {"x": "mine"}, "order": {}}})
        self.set_order(ACCOUNT_A, ORDER)
        self.capture(at=self.now)
        snapshot_id = self.snapshots()[0]["id"]
        # B is signed in, with the default grouping and no custom order.
        self.set_order(ACCOUNT_A, None)
        self.set_sidebar({SCOPE_A: sections("savedEnvironment", empty_groups=True), SCOPE_B: sections(None)})
        result = self.engine.run_restore_sorting(snapshot_id)
        self.assertTrue(result["ok"], result.get("error"))

        self.assertEqual(self.order(ACCOUNT_B)["value"], ORDER)
        lss_sections = self.entry(sorting.SECTIONS_KEY)
        self.assertEqual(lss_sections["value"][SCOPE_B], sections("savedEnvironment", empty_groups=True))
        self.assertGreater(lss_sections["timestamp"], 1)
        store = self.entry(sorting.SIDEBAR_STORE_KEY)
        state = store["state"]
        self.assertEqual(state["codeSidebarByScope"][SCOPE_B], sections("savedEnvironment", empty_groups=True))
        self.assertEqual(state["customGroupsByScope"][SCOPE_B]["groups"], ["mine"])
        self.assertEqual(state["collapsedGroups"], ["project-preset::p2"])
        self.assertEqual((state["sidebarWidth"], store["version"], store["shared"]), (305, 1, 2))
        self.assertEqual(self.entry(sorting.SIDEBAR_BACKUP_KEY)["state"]["collapsedGroups"], ["project-preset::p2"])
        self.assertEqual(self.entry(sorting.STARRED_GROUPS_KEY)["value"], ["preset::p2"])
        # The other account's settings stay as they were.
        self.assertEqual(lss_sections["value"][SCOPE_A], sections("savedEnvironment", empty_groups=True))

    def test_launch_restores_in_the_background(self):
        self.set_order(ACCOUNT_B, ORDER)
        self.capture()
        snapshot_id = self.snapshots()[0]["id"]
        self.set_order(ACCOUNT_B, None)
        output = subprocess.run(
            [sys.executable, "-B", str(ENGINE), "--app-dir", str(self.fx.app), "--state-dir", str(self.fx.state),
             "launch", "--action", "restore-sorting", "--snapshot", snapshot_id, "--no-app-control"],
            capture_output=True, text=True, timeout=30)
        self.assertTrue(json.loads(output.stdout)["started"])
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline and self.engine.sorting.last_restore() is None:
            time.sleep(0.2)
        self.assertTrue(self.engine.sorting.last_restore()["ok"])
        self.assertEqual(self.order(ACCOUNT_B)["value"], ORDER)


if __name__ == "__main__":
    unittest.main()
