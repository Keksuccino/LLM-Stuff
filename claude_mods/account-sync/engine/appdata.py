"""Reads and writes the parts of the Claude desktop app's data that hold each account's Code sessions and environments.

Layout, as the app keeps it under ~/Library/Application Support/Claude:

- claude-code-sessions/<account>/<org>/local_<id>.json: one pointer file per session in that account's sidebar. The
  conversation itself lives in ~/.claude/projects and is shared by every account, so copying a pointer file is all it
  takes to show a session in another account.
- claude-code-sessions/<account>/<org>/deleted_<id>: a tombstone the app writes when a session is deleted. Its text is
  the deletion time in milliseconds.
- claude-code-sessions/<account>/<org>/archived-sessions.idx: the ids of the archived sessions, a hint the app reads at
  start-up. It must list exactly the sessions whose file says isArchived, so it is rewritten whenever a sync changes
  that folder.
- ccd-session-presets.json: the saved environments, under byAccount.<account>. Environment variables saved for an
  environment are kept elsewhere, keyed by the environment's id and shared by all accounts, so keeping ids unchanged
  carries them over.

The app keeps all of this in memory while it runs and writes over outside changes, so nothing here may be written
while the app runs.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

APP_DIR = Path.home() / "Library" / "Application Support" / "Claude"
CLI_CONFIG = Path.home() / ".claude.json"

SESSIONS_DIR_NAME = "claude-code-sessions"
PRESETS_FILE_NAME = "ccd-session-presets.json"
CONFIG_FILE_NAME = "config.json"
ARCHIVE_INDEX_NAME = "archived-sessions.idx"
SESSION_PREFIX = "local_"
SESSION_SUFFIX = ".json"
TOMBSTONE_PREFIX = "deleted_"

# The app refuses to save a catalog over these limits, so a merge must stay within them.
MAX_PRESETS_PER_ACCOUNT = 200
MAX_PRESET_CATALOG_BYTES = 524288

FILE_MODE = 0o600

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


@dataclass(frozen=True)
class Profile:
    """One account's session folder: the org folder the app uses for that account."""

    account: str
    org: str
    path: Path

    @property
    def key(self) -> str:
        return f"{self.account}/{self.org}"


@dataclass(frozen=True)
class SessionFile:
    """A session pointer file as found on disk. `sid` is the id without the `local_` prefix."""

    sid: str
    path: Path
    size: int
    mtime_ns: int
    digest: str

    @property
    def mtime_ms(self) -> int:
        return self.mtime_ns // 1_000_000


@dataclass
class ProfileScan:
    """Everything a sync needs to know about one profile's folder."""

    profile: Profile
    sessions: Dict[str, SessionFile]
    tombstones: Dict[str, int]


class DigestCache:
    """Remembers file digests by (size, mtime) so a scan reads only the session files that changed since the last one.

    Hashing every pointer file on each preview would read tens of megabytes; with the cache a scan is a directory
    listing plus one stat per file.
    """

    def __init__(self, entries: Optional[Dict[str, Dict[str, list]]] = None):
        self._entries: Dict[str, Dict[str, list]] = entries or {}

    def lookup(self, profile_key: str, sid: str, size: int, mtime_ns: int) -> Optional[str]:
        entry = self._entries.get(profile_key, {}).get(sid)
        if entry and entry[0] == size and entry[1] == mtime_ns:
            return entry[2]
        return None

    def store(self, profile_key: str, sid: str, size: int, mtime_ns: int, digest: str) -> None:
        self._entries.setdefault(profile_key, {})[sid] = [size, mtime_ns, digest]

    def forget(self, profile_key: str, sid: str) -> None:
        self._entries.get(profile_key, {}).pop(sid, None)

    def prune(self, profile_key: str, live: Iterable[str]) -> None:
        keep = set(live)
        bucket = self._entries.get(profile_key)
        if bucket is not None:
            for sid in [sid for sid in bucket if sid not in keep]:
                del bucket[sid]

    def to_json(self) -> Dict[str, Dict[str, list]]:
        return self._entries


def file_digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _uuid_dirs(path: Path) -> List[Path]:
    try:
        return sorted(child for child in path.iterdir() if child.is_dir() and UUID_RE.match(child.name))
    except FileNotFoundError:
        return []


def _session_data_count(path: Path) -> int:
    count = 0
    for name in os.listdir(path):
        if (name.startswith(SESSION_PREFIX) and name.endswith(SESSION_SUFFIX)) or name.startswith(TOMBSTONE_PREFIX):
            count += 1
        elif name == ARCHIVE_INDEX_NAME:
            count += 1
    return count


def discover_profiles(app_dir: Path) -> Tuple[List[Profile], List[str]]:
    """Finds each account's session folder. Returns the profiles and the folders that were passed over.

    The app makes an <account>/<org> folder for other combinations too (one per account and org it has seen, holding
    only scheduled-tasks.json), so the folder that holds session files wins. For an account with none yet, the org
    the app keeps that account's plugin list or scratch folders under names the right one.
    """
    root = app_dir / SESSIONS_DIR_NAME
    profiles: List[Profile] = []
    passed_over: List[str] = []
    for account_dir in _uuid_dirs(root):
        account = account_dir.name
        known_orgs = {d.name for d in _uuid_dirs(app_dir / "plugin-list" / account)}
        known_orgs |= {d.name for d in _uuid_dirs(app_dir / "scratch-workspaces" / account)}
        candidates = []
        for org_dir in _uuid_dirs(account_dir):
            candidates.append((_session_data_count(org_dir), org_dir.name in known_orgs, org_dir))
        with_data = [c for c in candidates if c[0] > 0]
        if with_data:
            chosen = max(with_data, key=lambda c: (c[0], c[1], c[2].name))
        else:
            known = [c for c in candidates if c[1]]
            if not known:
                continue
            chosen = known[0]
        profiles.append(Profile(account, chosen[2].name, chosen[2]))
        passed_over.extend(f"{account}/{c[2].name}" for c in with_data if c is not chosen)
    return profiles, passed_over


def scan_profile(profile: Profile, cache: DigestCache) -> ProfileScan:
    sessions: Dict[str, SessionFile] = {}
    tombstones: Dict[str, int] = {}
    with os.scandir(profile.path) as entries:
        for entry in entries:
            name = entry.name
            if name.startswith(TOMBSTONE_PREFIX):
                sid = name[len(TOMBSTONE_PREFIX):]
                if SESSION_ID_RE.match(sid) and entry.is_file(follow_symlinks=False):
                    tombstones[sid] = read_tombstone(Path(entry.path))
                continue
            if not (name.startswith(SESSION_PREFIX) and name.endswith(SESSION_SUFFIX)):
                continue
            sid = name[len(SESSION_PREFIX):-len(SESSION_SUFFIX)]
            if not SESSION_ID_RE.match(sid) or not entry.is_file(follow_symlinks=False):
                continue
            stat = entry.stat(follow_symlinks=False)
            digest = cache.lookup(profile.key, sid, stat.st_size, stat.st_mtime_ns)
            path = Path(entry.path)
            if digest is None:
                digest = file_digest(path)
                cache.store(profile.key, sid, stat.st_size, stat.st_mtime_ns, digest)
            sessions[sid] = SessionFile(sid, path, stat.st_size, stat.st_mtime_ns, digest)
    cache.prune(profile.key, sessions)
    # A live file beats a tombstone of the same id: the app never leaves both, so such a pair can only come from a
    # restore, and the session is meant to be there.
    for sid in sessions:
        tombstones.pop(sid, None)
    return ProfileScan(profile, sessions, tombstones)


def read_tombstone(path: Path) -> int:
    try:
        return int(path.read_text(encoding="utf-8").strip() or 0)
    except (OSError, ValueError):
        return 0


def session_path(profile: Profile, sid: str) -> Path:
    return profile.path / f"{SESSION_PREFIX}{sid}{SESSION_SUFFIX}"


def tombstone_path(profile: Profile, sid: str) -> Path:
    return profile.path / f"{TOMBSTONE_PREFIX}{sid}"


def archive_index_path(profile: Profile) -> Path:
    return profile.path / ARCHIVE_INDEX_NAME


def read_archive_index(profile: Profile) -> Optional[Set[str]]:
    """The archived ids (with the `local_` prefix) the folder's index lists, or None when it is missing or unreadable."""
    try:
        data = json.loads(archive_index_path(profile).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("v") != 1 or not isinstance(data.get("archived"), list):
        return None
    return {sid for sid in data["archived"] if isinstance(sid, str)}


def encode_archive_index(archived: Iterable[str]) -> bytes:
    # Byte for byte what the app writes itself: compact JSON with the ids sorted.
    return json.dumps({"v": 1, "archived": sorted(archived)}, separators=(",", ":")).encode("utf-8")


def is_archived(session_bytes: bytes) -> bool:
    try:
        return json.loads(session_bytes).get("isArchived") is True
    except (ValueError, AttributeError):
        return False


def presets_path(app_dir: Path) -> Path:
    return app_dir / PRESETS_FILE_NAME


def read_presets(app_dir: Path) -> dict:
    path = presets_path(app_dir)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} does not hold a JSON object")
    return data


def encode_presets(document: dict) -> bytes:
    # electron-store's own format: tab indentation, raw UTF-8 (environment names hold emoji), no trailing newline.
    return json.dumps(document, indent="\t", ensure_ascii=False).encode("utf-8")


def active_account(app_dir: Path) -> Optional[str]:
    """The account the app was last signed in to. Reads one key of config.json; the rest of that file is left alone."""
    try:
        value = json.loads((app_dir / CONFIG_FILE_NAME).read_text(encoding="utf-8")).get("lastKnownAccountUuid")
    except (OSError, ValueError, AttributeError):
        return None
    return value if isinstance(value, str) and UUID_RE.match(value) else None


def cli_account_email(cli_config: Path = CLI_CONFIG) -> Optional[Tuple[str, str]]:
    """The (account id, email) of the account the terminal CLI is signed in to, when it says so."""
    try:
        account = json.loads(cli_config.read_text(encoding="utf-8")).get("oauthAccount") or {}
    except (OSError, ValueError, AttributeError):
        return None
    uuid, email = account.get("accountUuid"), account.get("emailAddress")
    if isinstance(uuid, str) and isinstance(email, str) and UUID_RE.match(uuid) and "@" in email:
        return uuid, email
    return None


def write_atomic(path: Path, data: bytes, mtime_ns: Optional[int] = None) -> None:
    """Writes through a hidden temporary file in the same folder, so the app never reads half a file.

    The temporary name starts with a dot: the app lists `local_*.json` (and `local_*.json.tmp` mirrors) in session
    folders, and a dot name matches neither.
    """
    tmp = path.with_name(f".account-sync-{os.getpid()}-{path.name}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, FILE_MODE)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if mtime_ns is not None:
            os.utime(tmp, ns=(mtime_ns, mtime_ns))
        os.replace(tmp, path)
    except BaseException:
        if tmp.exists():
            tmp.unlink()
        raise
