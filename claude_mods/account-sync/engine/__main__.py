"""Account Sync's engine: keeps the Claude desktop app's Code sessions and environments the same in every account.

Run it as a folder: `/usr/bin/python3 <mod>/engine <command>`.

  plan     prints, as JSON, the accounts and what a sync would change in each (read-only, fine while the app runs)
  status   prints the last run's result as JSON
  launch   starts a worker in the background that quits Claude, syncs (or undoes the last sync, or puts a sidebar
           order snapshot back) and opens Claude again, then returns at once
  run      syncs now; Claude must be closed
  undo     undoes the last sync now; Claude must be closed

  sorting-list      prints the sidebar order snapshots and which one each account has now
  sorting-snapshot  saves the sidebar order of each account (with --auto: at most once per 9 minutes)

Every command prints one JSON object. `--app-dir` and `--state-dir` point it at other folders (the tests use them).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List

import appctl
import appdata
from state import STATE_DIR, StateStore
from syncer import Engine, worker


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(prog="account-sync")
    parser.add_argument("--app-dir", type=Path, default=appdata.APP_DIR)
    parser.add_argument("--state-dir", type=Path, default=STATE_DIR)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("plan")
    commands.add_parser("status")
    launch = commands.add_parser("launch")
    launch.add_argument("--action", choices=["sync", "undo", "restore-sorting"], default="sync")
    launch.add_argument("--max-removals", type=int)
    launch.add_argument("--snapshot", help="the snapshot id, for restore-sorting")
    launch.add_argument("--no-app-control", action="store_true", help="leave the app alone (tests)")
    run = commands.add_parser("run")
    run.add_argument("--max-removals", type=int)
    commands.add_parser("undo")
    commands.add_parser("sorting-list")
    snapshot = commands.add_parser("sorting-snapshot")
    snapshot.add_argument("--auto", action="store_true", help="a timer's snapshot: skipped when one was taken lately")
    args = parser.parse_args(argv)

    store = StateStore(args.state_dir)
    engine = Engine(args.app_dir, store)
    if args.command == "plan":
        output = engine.preview()
    elif args.command == "status":
        output = {"ok": True, "lastRun": store.last_run(), "lastRestore": engine.sorting.last_restore(),
                  "isWorking": store.is_locked()}
    elif args.command == "sorting-list":
        output = engine.sorting_overview()
    elif args.command == "sorting-snapshot":
        output = engine.snapshot_sorting("auto" if args.auto else "manual")
    elif args.command == "launch":
        if store.is_locked():
            output = {"ok": False, "error": "A sync or restore is already running."}
        elif args.action == "restore-sorting" and not args.snapshot:
            output = {"ok": False, "error": "Name the snapshot to restore with --snapshot."}
        else:
            if args.action == "restore-sorting":
                task = lambda: engine.run_restore_sorting(args.snapshot)
            else:
                task = lambda: engine.run_action(args.action, args.max_removals)
            store.ensure()
            pid = appctl.detach(worker(engine, args.action, task, not args.no_app_control), store.log_path)
            output = {"ok": True, "started": True, "pid": pid}
    else:
        if appctl.is_running() and args.app_dir == appdata.APP_DIR:
            output = {"ok": False, "error": "Quit Claude first: it writes over changes made while it runs."}
        else:
            output = engine.run_action("sync" if args.command == "run" else "undo",
                                       getattr(args, "max_removals", None))
    print(json.dumps(output))
    return 0 if output.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
