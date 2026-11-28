"""Snapshots of the sidebar's layout (group order, grouping, sorting and what shows), and putting one back.

The Code tab keeps the sidebar's layout in its web storage, spread over these entries:

- `LSS-persisted.code-projects-order.<account>`: the order of the groups (saved environments, repositories,
  folders), as `{"value": [group ids], "tabId": "", "timestamp": ms}`. The app deletes this entry for the account it
  switches away from, so after every account switch the groups fall back to the default order.
- `LSS-persisted.dframe-code-sections`: per scope (`<account>/<org>`), the sidebar's sections and their settings: the
  sessions section's grouping and sorting, which options and sections show, their order. `dframe-store` keeps a copy
  of the same under `codeSidebarByScope`; both are written so the app finds the same in each.
- `dframe-store`: per scope, custom groups (`customGroupsByScope`); for every account, grouping and sorting by mode
  and the collapsed groups. `dframe-store.backup.v1` repeats some of these fields and is kept in step.
- `LSS-persisted.dframe-group-scopes` (per scope), `LSS-persisted.starred-session-groups` and the
  `dframe-*-project-ids` lists: group scopes, starred groups and pinned projects.

A snapshot holds all of it for one account, so a restore puts back the order together with the settings it was made
under. Snapshots are kept newest first and work in any account: group ids are the same in every account (environment
ids are kept by the sync, repositories and folders are named the same everywhere). Pinned and starred sessions are left
out: they belong to sessions, not to the layout, and switching accounts does not reset them.

Reading works while the app runs. Putting a snapshot back writes the web storage, which only works while it is closed.
"""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import appdata
import catalog
from appdata import write_atomic
from webstore import LocalStorage, local_storage_dir

ORDER_PREFIX = "LSS-persisted.code-projects-order."
SECTIONS_KEY = "LSS-persisted.dframe-code-sections"
GROUP_SCOPES_KEY = "LSS-persisted.dframe-group-scopes"
STARRED_GROUPS_KEY = "LSS-persisted.starred-session-groups"
SIDEBAR_STORE_KEY = "dframe-store"
SIDEBAR_BACKUP_KEY = "dframe-store.backup.v1"
PROJECT_PIN_KEYS = ("dframe-code-pinned-project-ids", "dframe-home-pinned-project-ids",
                    "dframe-unpinned-epitaxy-project-ids", "dframe-code-project-choice-ids")
# Fields of dframe-store that hold layout for every account at once.
SHARED_STORE_FIELDS = ("groupByByMode", "sortByByMode", "collapsedGroups")
# Parts of a layout that change whenever a group or section is folded. They are kept and put back, but two layouts
# that differ only in them count as the same, so folding a group never pushes a saved order out of the history.
FOLD_STATE_FIELDS = ("collapsedGroups",)

HISTORY_FILE = "sorting-snapshots.json"
LAST_RESTORE_FILE = "sorting-last-restore.json"
MAX_SNAPSHOTS = 20
# Every open Code session asks for an automatic snapshot on its own timer; one per this many milliseconds is kept.
AUTO_MIN_GAP_MS = 9 * 60_000
PRESET_GROUP_PREFIX = "preset::"


def order_key(account: str) -> str:
    return ORDER_PREFIX + account


def group_label(group_id: str, preset_names: Dict[str, str]) -> str:
    """How the sidebar names a group: an environment by its name, a repository by its name, a folder by its last part."""
    if group_id.startswith(PRESET_GROUP_PREFIX):
        return preset_names.get(group_id[len(PRESET_GROUP_PREFIX):], "Deleted environment")
    if "::" in group_id:
        return group_id.split("::", 1)[1] or group_id
    return group_id.rstrip("/").rsplit("/", 1)[-1] or group_id


def layout_digest(layout: dict) -> str:
    """What makes two layouts different: everything but the scope they came from and their fold state."""
    identity = {k: v for k, v in layout.items() if k != "scope" and k not in FOLD_STATE_FIELDS}
    sections = identity.get("sections")
    if isinstance(sections, dict) and isinstance(sections.get("sections"), list):
        identity["sections"] = {**sections, "sections": [{k: v for k, v in s.items() if k != "collapsed"}
                                                         for s in sections["sections"] if isinstance(s, dict)]}
    return hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _summary(layout: dict) -> dict:
    """The sessions section's grouping and sorting, for the pane to show."""
    for section in ((layout.get("sections") or {}).get("sections") or []):
        if isinstance(section, dict) and section.get("kind") == "sessions":
            return {"groupBy": section.get("groupBy"), "sortBy": section.get("sortBy"),
                    "ascending": section.get("ascending"),
                    "emptyGroups": (section.get("show") or {}).get("emptyGroups")}
    return {}


class SortingStore:
    """The snapshot history and the last restore's result, in the sync's state folder."""

    def __init__(self, root: Path):
        self.root = root

    def _read(self, name: str) -> Optional[dict]:
        try:
            data = json.loads((self.root / name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None

    def _write(self, name: str, data: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_atomic(self.root / name, json.dumps(data, indent=1, ensure_ascii=False).encode("utf-8"))

    def history(self) -> dict:
        data = self._read(HISTORY_FILE) or {}
        snapshots = data.get("snapshots") if isinstance(data.get("snapshots"), list) else []
        return {"lastAutoAt": data.get("lastAutoAt", 0), "snapshots": snapshots}

    def save_history(self, history: dict) -> None:
        self._write(HISTORY_FILE, {"version": 2, **history})

    def last_restore(self) -> Optional[dict]:
        return self._read(LAST_RESTORE_FILE)

    def save_last_restore(self, result: dict) -> None:
        self._write(LAST_RESTORE_FILE, result)


def _json(items: Dict[str, str], key: str):
    try:
        return json.loads(items[key])
    except (KeyError, ValueError):
        return None


def _wrapped(items: Dict[str, str], key: str):
    """The `value` of an `LSS-` entry (`{"value": ..., "tabId": "", "timestamp": ms}`), or None."""
    data = _json(items, key)
    return data.get("value") if isinstance(data, dict) else None


def _scope_of(account: str, items: Dict[str, str], profiles: Dict[str, str]) -> Optional[str]:
    """The `<account>/<org>` scope the app keeps the account's sidebar under."""
    if account in profiles:
        return f"{account}/{profiles[account]}"
    store = _json(items, SIDEBAR_STORE_KEY) or {}
    last = (store.get("state") or {}).get("lastSidebarScopeKey")
    if isinstance(last, str) and last.startswith(account + "/"):
        return last
    sections = _wrapped(items, SECTIONS_KEY) or {}
    return next((scope for scope in sections if scope.startswith(account + "/")), None)


def _profiles(app_dir: Path) -> Dict[str, str]:
    profiles, _ = appdata.discover_profiles(app_dir)
    return {p.account: p.org for p in profiles}


def read_layouts(app_dir: Path) -> Tuple[Dict[str, dict], Dict[str, str]]:
    """The sidebar layout of every account that has its own group order now (one that was reset has none), and the
    raw web storage entries they came from."""
    storage = LocalStorage(local_storage_dir(app_dir))
    if not storage.exists():
        return {}, {}
    items = storage.read("")
    profiles = _profiles(app_dir)
    state = (_json(items, SIDEBAR_STORE_KEY) or {}).get("state") or {}
    sections = _wrapped(items, SECTIONS_KEY) or {}
    group_scopes = _wrapped(items, GROUP_SCOPES_KEY) or {}
    shared: dict = {field: state[field] for field in SHARED_STORE_FIELDS if field in state}
    starred = _wrapped(items, STARRED_GROUPS_KEY)
    if starred is not None:
        shared["starredGroups"] = starred
    pins = {key: _json(items, key) for key in PROJECT_PIN_KEYS if key in items}
    if pins:
        shared["projectPins"] = pins

    layouts: Dict[str, dict] = {}
    for key, raw in items.items():
        if not key.startswith(ORDER_PREFIX):
            continue
        account = key[len(ORDER_PREFIX):]
        order = _wrapped(items, key)
        if not (isinstance(order, list) and order and all(isinstance(g, str) for g in order)):
            continue
        scope = _scope_of(account, items, profiles)
        layout = {"groupOrder": order, "scope": scope}
        if scope is not None:
            if isinstance(sections.get(scope), dict):
                layout["sections"] = sections[scope]
            if isinstance((state.get("customGroupsByScope") or {}).get(scope), dict):
                layout["customGroups"] = state["customGroupsByScope"][scope]
            if scope in group_scopes:
                layout["groupScope"] = group_scopes[scope]
        layout.update(copy.deepcopy(shared))
        layouts[account] = layout
    return layouts, items


def _preset_names(items: Dict[str, str], app_dir: Path) -> Dict[str, str]:
    names: Dict[str, str] = {}
    document = appdata.read_presets(app_dir)
    for entry in (document.get("byAccount") or {}).values():
        for preset in entry.get("presets", []) if isinstance(entry, dict) else []:
            if isinstance(preset, dict) and isinstance(preset.get("id"), str):
                names.setdefault(preset["id"], str(preset.get("name", "")))
    for key, raw in items.items():
        if not key.startswith(catalog.STORE_PREFIX):
            continue
        try:
            presets = json.loads(raw)["state"]["presets"]
        except (ValueError, KeyError, TypeError):
            continue
        for preset in presets:
            if isinstance(preset, dict) and isinstance(preset.get("id"), str):
                names[preset["id"]] = str(preset.get("name", ""))
    return names


def current_digests(app_dir: Path) -> Dict[str, str]:
    """For each account with its own group order, the digest of the layout it has now."""
    layouts, _ = read_layouts(app_dir)
    return {account: layout_digest(layout) for account, layout in layouts.items()}


def capture(app_dir: Path, store: SortingStore, trigger: str, now_ms: int) -> dict:
    """Saves the current layout of every account that has its own group order. A layout already in the history is
    not saved twice: its snapshot moves to the top with the new time and the latest fold state. Automatic snapshots
    come at most once per AUTO_MIN_GAP_MS."""
    history = store.history()
    if trigger == "auto":
        if now_ms - int(history.get("lastAutoAt") or 0) < AUTO_MIN_GAP_MS:
            return {"saved": 0, "reason": "too-soon"}
        history["lastAutoAt"] = now_ms
    layouts, items = read_layouts(app_dir)
    snapshots: List[dict] = history["snapshots"]
    saved = 0
    if layouts:
        names = _preset_names(items, app_dir)
        for account, layout in sorted(layouts.items()):
            digest = layout_digest(layout)
            existing = next((s for s in snapshots if s.get("digest") == digest), None)
            if existing is not None:
                snapshots.remove(existing)
                existing.update(takenAt=now_ms, account=account, layout=layout)
                snapshots.insert(0, existing)
                continue
            groups = layout["groupOrder"]
            snapshots.insert(0, {
                "id": f"{now_ms}-{account[:8]}",
                "takenAt": now_ms,
                "account": account,
                "trigger": trigger,
                "groups": groups,
                "labels": [group_label(g, names) for g in groups],
                "summary": _summary(layout),
                "layout": layout,
                "digest": digest,
            })
            saved += 1
    history["snapshots"] = snapshots[:MAX_SNAPSHOTS]
    store.save_history(history)
    return {"saved": saved, "reason": None if layouts else "no-order"}


def _rewrapped(items: Dict[str, str], key: str, value, now_ms: int) -> str:
    wrapper = _json(items, key)
    wrapper = wrapper if isinstance(wrapper, dict) else {"tabId": ""}
    wrapper = {**wrapper, "value": value, "timestamp": now_ms}
    return json.dumps(wrapper, separators=(",", ":"), ensure_ascii=False)


def layout_writes(layout: dict, account: str, scope: Optional[str], items: Dict[str, str], now_ms: int) -> Dict[str, str]:
    """The web storage entries that make `layout` the account's sidebar layout, by entry name."""
    def dump(value) -> str:
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)

    writes = {order_key(account): _rewrapped(items, order_key(account), layout["groupOrder"], now_ms)}
    store = _json(items, SIDEBAR_STORE_KEY)
    backup = _json(items, SIDEBAR_BACKUP_KEY)
    state = store.get("state") if isinstance(store, dict) and isinstance(store.get("state"), dict) else None
    backup_state = backup.get("state") if isinstance(backup, dict) and isinstance(backup.get("state"), dict) else None

    if scope is not None and "sections" in layout:
        sections = _wrapped(items, SECTIONS_KEY)
        sections = dict(sections) if isinstance(sections, dict) else {}
        sections[scope] = layout["sections"]
        writes[SECTIONS_KEY] = _rewrapped(items, SECTIONS_KEY, sections, now_ms)
        if state is not None:
            state["codeSidebarByScope"] = {**(state.get("codeSidebarByScope") or {}), scope: layout["sections"]}
    if scope is not None and "customGroups" in layout and state is not None:
        state["customGroupsByScope"] = {**(state.get("customGroupsByScope") or {}), scope: layout["customGroups"]}
    if scope is not None and "groupScope" in layout:
        group_scopes = _wrapped(items, GROUP_SCOPES_KEY)
        group_scopes = dict(group_scopes) if isinstance(group_scopes, dict) else {}
        group_scopes[scope] = layout["groupScope"]
        writes[GROUP_SCOPES_KEY] = _rewrapped(items, GROUP_SCOPES_KEY, group_scopes, now_ms)
    for field in SHARED_STORE_FIELDS:
        if field in layout:
            if state is not None:
                state[field] = layout[field]
            if backup_state is not None and field in backup_state:
                backup_state[field] = layout[field]
    if "starredGroups" in layout:
        writes[STARRED_GROUPS_KEY] = _rewrapped(items, STARRED_GROUPS_KEY, layout["starredGroups"], now_ms)
    for key, value in (layout.get("projectPins") or {}).items():
        if key in PROJECT_PIN_KEYS:
            writes[key] = dump(value)

    if state is not None:
        new_store = dump(store)
        if new_store != items.get(SIDEBAR_STORE_KEY):
            writes[SIDEBAR_STORE_KEY] = new_store
    if backup_state is not None:
        new_backup = dump(backup)
        if new_backup != items.get(SIDEBAR_BACKUP_KEY):
            writes[SIDEBAR_BACKUP_KEY] = new_backup
    return writes


def restore(app_dir: Path, store: SortingStore, snapshot_id: str, account: str, now_ms: int) -> dict:
    """Makes the snapshot's layout the account's sidebar layout. The layout the account has now is saved first, so the
    restore itself can be taken back. The app must be closed."""
    snapshot = next((s for s in store.history()["snapshots"] if s.get("id") == snapshot_id), None)
    if snapshot is None or not isinstance(snapshot.get("layout"), dict):
        raise LookupError("That snapshot is no longer in the history.")
    capture(app_dir, store, "before-restore", now_ms)
    storage = LocalStorage(local_storage_dir(app_dir))
    items = storage.read("")
    scope = _scope_of(account, items, _profiles(app_dir))
    layout = snapshot["layout"]
    storage.write(layout_writes(layout, account, scope, items, now_ms))
    return {"groups": len(layout["groupOrder"]), "account": account, "snapshot": snapshot_id}
