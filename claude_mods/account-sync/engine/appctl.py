"""Finds, quits and reopens the Claude desktop app, and detaches the worker that does it.

The worker is started from inside the app (a Code session's mod), so it has to outlive the app: it forks twice and
starts a new session, which takes it out of the app's process tree and process group before the app goes away.
"""

from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Callable, List, Optional, Tuple

BUNDLE_ID = "com.anthropic.claudefordesktop"
MAIN_EXECUTABLE = "/Contents/MacOS/Claude"
DEFAULT_BUNDLE = "/Applications/Claude.app"

QUIT_WAIT_S = 20.0
TERM_WAIT_S = 10.0
HELPERS_WAIT_S = 10.0
SETTLE_S = 1.5


def _processes() -> List[Tuple[int, str]]:
    output = subprocess.run(["/bin/ps", "-axo", "pid=,comm="], capture_output=True, text=True, check=True).stdout
    found = []
    for line in output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[0].isdigit():
            found.append((int(parts[0]), parts[1]))
    return found


def running_bundles() -> List[Tuple[int, str]]:
    """(pid, bundle path) of every running copy of the app's main process.

    Matched by the exact executable path: the Code sessions run a binary named `claude` (lower case) inside a
    `claude.app` of their own, which must not count as the app.
    """
    found = []
    for pid, comm in _processes():
        if comm.endswith(".app" + MAIN_EXECUTABLE) and "/Contents/Frameworks/" not in comm:
            found.append((pid, comm[: -len(MAIN_EXECUTABLE)]))
    return found


def is_running() -> bool:
    return bool(running_bundles())


def _bundle_processes(bundle: str) -> List[int]:
    prefix = bundle.rstrip("/") + "/"
    own = os.getpid()
    return [pid for pid, comm in _processes() if comm.startswith(prefix) and pid != own]


def _wait(condition: Callable[[], bool], timeout_s: float) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.25)
    return condition()


def _signal(pids: List[int], sig: int) -> None:
    for pid in pids:
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass


def quit_app(log: Callable[[str], None]) -> Optional[str]:
    """Quits the app, forcing it when it does not go by itself. Returns its bundle path, or None when it wasn't running."""
    running = running_bundles()
    if not running:
        return None
    bundle = running[0][1]
    main_pids = [pid for pid, _ in running]

    def main_gone() -> bool:
        return not any(pid in main_pids for pid, _ in running_bundles())

    log("asking Claude to quit")
    subprocess.run(["/usr/bin/osascript", "-e", f'tell application id "{BUNDLE_ID}" to quit'],
                   capture_output=True, timeout=QUIT_WAIT_S, check=False)
    if not _wait(main_gone, QUIT_WAIT_S):
        log("Claude did not quit; sending SIGTERM")
        _signal(main_pids, signal.SIGTERM)
        if not _wait(main_gone, TERM_WAIT_S):
            log("Claude is still running; sending SIGKILL")
            _signal(_bundle_processes(bundle), signal.SIGKILL)
            _wait(main_gone, TERM_WAIT_S)
    # Helpers flush and leave on their own once the main process is gone; whatever is left is stopped.
    if not _wait(lambda: not _bundle_processes(bundle), HELPERS_WAIT_S):
        log("stopping leftover helper processes")
        _signal(_bundle_processes(bundle), signal.SIGKILL)
        _wait(lambda: not _bundle_processes(bundle), HELPERS_WAIT_S)
    time.sleep(SETTLE_S)
    return bundle


def open_app(bundle: Optional[str], log: Callable[[str], None]) -> None:
    target = bundle if bundle and Path(bundle).exists() else DEFAULT_BUNDLE
    log(f"opening {target}")
    result = subprocess.run(["/usr/bin/open", target], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        log(f"open failed ({result.returncode}): {result.stderr.strip()}; trying the bundle id")
        subprocess.run(["/usr/bin/open", "-b", BUNDLE_ID], capture_output=True, check=False)


def detach(run: Callable[[], int], log_path: Path) -> int:
    """Runs `run` in a grandchild that no longer belongs to the caller's process tree. Returns the grandchild's pid."""
    read_end, write_end = os.pipe()
    child = os.fork()
    if child:
        os.close(write_end)
        with os.fdopen(read_end, "rb") as reader:
            pid_text = reader.read().decode("ascii", "replace").strip()
        os.waitpid(child, 0)
        return int(pid_text or 0)

    # Child: a new session leaves the caller's process group, and the second fork leaves its tree.
    os.close(read_end)
    os.setsid()
    grandchild = os.fork()
    if grandchild:
        os.write(write_end, str(grandchild).encode("ascii"))
        os._exit(0)
    os.close(write_end)
    # The caller reads the launcher's output to its end, so every inherited descriptor has to be closed here or the
    # caller would wait for this worker to finish.
    null = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null, 0)
    log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)
    os.closerange(3, 1024)
    os.chdir("/")
    code = 1
    try:
        code = run()
    finally:
        os._exit(code)
