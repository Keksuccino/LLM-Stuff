"""Each account's environment catalog: where the app keeps it, and how a merged catalog is written back.

The Code tab keeps an account's saved environments in its web storage, under `persisted.ccd-session-presets.<account>`
(a persisted store: `{"state": {...}, "version": n}`). That entry is the one the app trusts. ccd-session-presets.json is
a mirror the app rewrites from it at every launch, so the mirror is only read for an account the web storage has no
entry for, and written so the two agree until the app starts. The `<account>.<org>` entries beside them belong to a
different store and are left alone.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import appdata
from webstore import LocalStorage, local_storage_dir

STORE_PREFIX = "persisted.ccd-session-presets."
DEFAULT_STORE_VERSION = 4
CATALOG_FIELDS = ("presets", "builtIns", "seededFromDraft")


def store_key(account: str) -> str:
    return STORE_PREFIX + account


@dataclass
class Catalogs:
    """What each account holds now, as the planner reads it, and where it came from."""

    file_document: dict
    store_values: Dict[str, str]
    store_version: int
    by_account: Dict[str, dict] = field(default_factory=dict)
    has_web_storage: bool = True

    def document(self) -> dict:
        """The catalogs in the mirror file's shape, which is what the planner merges."""
        return {"byAccount": dict(self.by_account)}


def read_catalogs(app_dir: Path, accounts: List[str]) -> Catalogs:
    file_document = appdata.read_presets(app_dir)
    file_entries = file_document.get("byAccount") if isinstance(file_document.get("byAccount"), dict) else {}
    storage = LocalStorage(local_storage_dir(app_dir))
    has_web_storage = storage.exists()
    store_values = storage.read(STORE_PREFIX) if has_web_storage else {}
    catalogs = Catalogs(file_document, {}, DEFAULT_STORE_VERSION, has_web_storage=has_web_storage)
    for account in accounts:
        raw = store_values.get(store_key(account))
        if raw is not None:
            parsed = json.loads(raw)
            state = parsed.get("state") if isinstance(parsed, dict) else None
            if not isinstance(state, dict):
                raise ValueError(f"The app's environment store for account {account} is not in a known shape")
            catalogs.store_values[account] = raw
            if isinstance(parsed.get("version"), int):
                catalogs.store_version = parsed["version"]
            catalogs.by_account[account] = {k: state[k] for k in CATALOG_FIELDS if k in state}
            catalogs.by_account[account].setdefault("presets", [])
        elif isinstance(file_entries.get(account), dict):
            catalogs.by_account[account] = file_entries[account]
    return catalogs


def store_writes(catalogs: Catalogs, merged: dict) -> Dict[str, str]:
    """The web storage entries to write so every account holds its merged catalog, keyed by entry name."""
    writes: Dict[str, str] = {}
    if not catalogs.has_web_storage:
        return writes
    for account, entry in merged["byAccount"].items():
        raw = catalogs.store_values.get(account)
        if raw is not None:
            store = json.loads(raw)
        else:
            # Never opened in the Code tab yet: the app takes a store it finds and skips seeding one of its own.
            store = {"state": {"seededFromDraft": True, "fileMirrored": True}, "version": catalogs.store_version}
        state = store["state"]
        state["presets"] = entry["presets"]
        if "builtIns" in entry:
            state["builtIns"] = entry["builtIns"]
        value = json.dumps(store, separators=(",", ":"), ensure_ascii=False)
        if value != raw:
            writes[store_key(account)] = value
    return writes


def file_document_after(catalogs: Catalogs, merged: dict) -> dict:
    """The mirror file with each synced account's entry replaced by its merged catalog."""
    document = dict(catalogs.file_document)
    by_account = dict(document.get("byAccount") or {})
    by_account.update(merged["byAccount"])
    document["byAccount"] = by_account
    return document
