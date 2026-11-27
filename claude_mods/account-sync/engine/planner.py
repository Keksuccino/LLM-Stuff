"""Decides what a sync changes in each account, without touching anything.

Every account ends up with the same sessions and environments. Additions, edits and deletions made in any account since
the last sync reach the others:

- A session or environment missing from an account is added there, unless the account deleted it. Sessions carry the
  app's own tombstones; for anything else a deletion is told apart from a new item by the baseline, what all accounts
  held after the last sync.
- When copies differ, the copy that changed since the last sync wins; when several did, the newest session file wins,
  and for environments, which carry no edit time, the signed-in account's copy wins.
- A session that was continued in one account after another account deleted it is kept, and comes back where it was
  deleted.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Set, Tuple

from appdata import MAX_PRESET_CATALOG_BYTES, MAX_PRESETS_PER_ACCOUNT, Profile, ProfileScan, SessionFile

PRESETS_SOURCE = "web-storage"


@dataclass
class Baseline:
    """What every account held after the last sync, by digest."""

    profiles: Set[str] = field(default_factory=set)
    sessions: Dict[str, str] = field(default_factory=dict)
    preset_accounts: Set[str] = field(default_factory=set)
    presets: Dict[str, str] = field(default_factory=dict)
    built_ins: Optional[str] = None

    @classmethod
    def from_json(cls, data: Optional[dict]) -> "Baseline":
        data = data or {}
        baseline = cls(profiles=set(data.get("profiles", [])), sessions=dict(data.get("sessions", {})))
        # Environments read from the mirror file instead of the app's web storage are no baseline: the app had
        # overwritten what was synced into the mirror, so taking them as such would read as deletions.
        if data.get("presetsSource") == PRESETS_SOURCE:
            baseline.preset_accounts = set(data.get("presetAccounts", []))
            baseline.presets = dict(data.get("presets", {}))
            baseline.built_ins = data.get("builtIns")
        return baseline

    def to_json(self) -> dict:
        return {
            "profiles": sorted(self.profiles),
            "sessions": dict(sorted(self.sessions.items())),
            "presetsSource": PRESETS_SOURCE,
            "presetAccounts": sorted(self.preset_accounts),
            "presets": dict(sorted(self.presets.items())),
            "builtIns": self.built_ins,
        }


@dataclass
class SessionOp:
    """One change to one profile's folder. `kind` is put, remove, tombstone or untombstone."""

    kind: str
    profile: Profile
    sid: str
    source: Optional[SessionFile] = None
    tombstone_ms: int = 0


@dataclass
class AccountChanges:
    """What a sync does to one account, as the preview shows it."""

    sessions_added: int = 0
    sessions_updated: int = 0
    sessions_removed: int = 0
    sessions_restored: int = 0
    environments_added: int = 0
    environments_updated: int = 0
    environments_removed: int = 0
    defaults_updated: bool = False

    @property
    def total(self) -> int:
        return (self.sessions_added + self.sessions_updated + self.sessions_removed + self.sessions_restored
                + self.environments_added + self.environments_updated + self.environments_removed
                + int(self.defaults_updated))

    def to_json(self) -> dict:
        return {
            "sessionsAdded": self.sessions_added,
            "sessionsUpdated": self.sessions_updated,
            "sessionsRemoved": self.sessions_removed,
            "sessionsRestored": self.sessions_restored,
            "environmentsAdded": self.environments_added,
            "environmentsUpdated": self.environments_updated,
            "environmentsRemoved": self.environments_removed,
            "defaultsUpdated": self.defaults_updated,
            "total": self.total,
        }


@dataclass
class Plan:
    session_ops: List[SessionOp]
    presets_document: Optional[dict]
    changes: Dict[str, AccountChanges]
    baseline_after: Baseline

    @property
    def total(self) -> int:
        return sum(change.total for change in self.changes.values())

    def removals_in(self, profile: Profile) -> int:
        return sum(1 for op in self.session_ops if op.kind == "remove" and op.profile == profile)


def _newest(files: List[SessionFile], rank: Dict[str, int]) -> SessionFile:
    # Ties go to the signed-in account's copy, then to a fixed order, so a plan is the same every time it is made.
    return max(files, key=lambda f: (f.mtime_ns, rank.get(str(f.path.parent), 0), str(f.path)))


def plan_sessions(scans: List[ProfileScan], baseline: Baseline, active: Optional[str], now_ms: int,
                  changes: Dict[str, AccountChanges]) -> Tuple[List[SessionOp], Dict[str, str]]:
    """Returns the operations and the digest every account holds of each session afterwards."""
    ops: List[SessionOp] = []
    final: Dict[str, str] = {}
    rank = {str(scan.profile.path): int(scan.profile.account == active) for scan in scans}
    all_ids = set()
    for scan in scans:
        all_ids.update(scan.sessions)
    for sid in sorted(all_ids):
        present = {scan.profile: scan.sessions[sid] for scan in scans if sid in scan.sessions}
        tombstoned = {scan.profile: scan.tombstones[sid] for scan in scans if sid in scan.tombstones}
        absent = [scan.profile for scan in scans if scan.profile not in present]
        known = baseline.sessions.get(sid)
        deleted_in = [p for p in absent if p in tombstoned or (known is not None and p.key in baseline.profiles)]

        if deleted_in:
            # Without a tombstone (a file gone since the last sync) there is no deletion time, so any copy edited
            # since then counts as continued.
            deleted_at = max(tombstoned.get(p, 0) for p in deleted_in)
            continued = [f for f in present.values() if f.digest != known and f.mtime_ms > deleted_at]
            if not continued:
                for profile in present:
                    ops.append(SessionOp("remove", profile, sid))
                    changes[profile.account].sessions_removed += 1
                for scan in scans:
                    if scan.profile not in tombstoned:
                        ops.append(SessionOp("tombstone", scan.profile, sid, tombstone_ms=deleted_at or now_ms))
                continue
            winner = _newest(continued, rank)
            for scan in scans:
                profile = scan.profile
                if profile not in present:
                    ops.append(SessionOp("put", profile, sid, source=winner))
                    changes[profile.account].sessions_restored += 1
                elif present[profile].digest != winner.digest:
                    ops.append(SessionOp("put", profile, sid, source=winner))
                    changes[profile.account].sessions_updated += 1
                if profile in tombstoned:
                    ops.append(SessionOp("untombstone", profile, sid))
            final[sid] = winner.digest
            continue

        digests = {f.digest for f in present.values()}
        if not absent and len(digests) == 1:
            final[sid] = next(iter(digests))
            continue
        changed = [f for f in present.values() if f.digest != known]
        winner = _newest(changed or list(present.values()), rank)
        for scan in scans:
            profile = scan.profile
            if profile not in present:
                ops.append(SessionOp("put", profile, sid, source=winner))
                changes[profile.account].sessions_added += 1
            elif present[profile].digest != winner.digest:
                ops.append(SessionOp("put", profile, sid, source=winner))
                changes[profile.account].sessions_updated += 1
        final[sid] = winner.digest
    return ops, final


def _preset_digest(preset: dict) -> str:
    # lastUsedAt moves every time an environment is picked; it is merged on its own and is no edit.
    body = {k: v for k, v in preset.items() if k != "lastUsedAt"}
    return _digest(body)


def _digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def presets_of(entry: dict) -> Dict[str, dict]:
    found: Dict[str, dict] = {}
    for preset in entry.get("presets", []):
        if isinstance(preset, dict) and isinstance(preset.get("id"), str):
            found.setdefault(preset["id"], preset)
    return found


def _pick(candidates: List[str], active: Optional[str], recency: Callable[[str], float]) -> str:
    """The account whose copy wins: the signed-in one when it is among them, else the most recently used copy."""
    if active in candidates:
        return active
    return max(candidates, key=lambda a: (recency(a), a))


def plan_presets(document: dict, accounts: List[str], baseline: Baseline, after: Baseline, active: Optional[str],
                 changes: Dict[str, AccountChanges]) -> Optional[dict]:
    """Returns the merged presets document, or None when no account's catalog changes. Fills `after`'s presets."""
    by_account = document.get("byAccount")
    if by_account is not None and not isinstance(by_account, dict):
        raise ValueError("ccd-session-presets.json: byAccount is not an object")
    by_account = dict(by_account or {})
    entries = {a: by_account[a] if isinstance(by_account.get(a), dict) else {"presets": []} for a in accounts}
    items = {a: presets_of(entries[a]) for a in accounts}

    merged: Dict[str, dict] = {}
    all_ids: List[str] = []
    for account in [a for a in [active] if a in accounts] + [a for a in accounts if a != active]:
        all_ids.extend(pid for pid in items[account] if pid not in all_ids)
    for pid in all_ids:
        copies = {a: items[a][pid] for a in accounts if pid in items[a]}
        digests = {a: _preset_digest(p) for a, p in copies.items()}
        known = baseline.presets.get(pid)
        absent = [a for a in accounts if a not in copies]
        deleted = known is not None and any(a in baseline.preset_accounts for a in absent)
        edited = [a for a in copies if digests[a] != known]
        if deleted and not edited:
            continue
        winner = _pick(edited or list(copies), active, lambda a: copies[a].get("lastUsedAt") or 0)
        preset = dict(copies[winner])
        last_used = [p.get("lastUsedAt") for p in copies.values() if isinstance(p.get("lastUsedAt"), (int, float))]
        if last_used:
            preset["lastUsedAt"] = max(last_used)
        merged[pid] = preset

    built_in_copies = {a: entries[a]["builtIns"] for a in accounts if isinstance(entries[a].get("builtIns"), dict)}
    built_ins = None
    if built_in_copies:
        built_in_digests = {a: _digest(b) for a, b in built_in_copies.items()}
        edited = [a for a in built_in_copies if built_in_digests[a] != baseline.built_ins]
        built_ins = built_in_copies[_pick(edited or list(built_in_copies), active, lambda a: 0)]

    order = list(merged)
    new_document = dict(document)
    new_by_account = dict(by_account)
    is_changed = False
    for account in accounts:
        entry = dict(entries[account])
        if account not in by_account:
            # The app seeds up to eight environments of its own into an account the first time it opens the Code tab;
            # the synced ones take their place.
            entry["seededFromDraft"] = True
        entry["presets"] = [merged[pid] for pid in order]
        if built_ins is not None:
            entry["builtIns"] = built_ins
        if len(entry["presets"]) > MAX_PRESETS_PER_ACCOUNT:
            raise ValueError(f"The merged environments come to {len(entry['presets'])}, over the app's limit of "
                             f"{MAX_PRESETS_PER_ACCOUNT}")
        if len(json.dumps(entry, ensure_ascii=False).encode("utf-8")) > MAX_PRESET_CATALOG_BYTES:
            raise ValueError("The merged environments are over the app's size limit")

        before = items[account]
        change = changes[account]
        change.environments_added += sum(1 for pid in merged if pid not in before)
        change.environments_removed += sum(1 for pid in before if pid not in merged)
        change.environments_updated += sum(1 for pid in merged
                                           if pid in before and _preset_digest(before[pid]) != _preset_digest(merged[pid]))
        if built_ins is not None and entries[account].get("builtIns") != built_ins:
            change.defaults_updated = True
        if _digest(entry) != _digest(by_account.get(account)):
            is_changed = True
        new_by_account[account] = entry

    after.preset_accounts = set(accounts)
    after.presets = {pid: _preset_digest(p) for pid, p in merged.items()}
    after.built_ins = _digest(built_ins) if built_ins is not None else None
    if not is_changed:
        return None
    new_document["byAccount"] = new_by_account
    return new_document


def make_plan(scans: List[ProfileScan], presets_document: dict, baseline: Baseline, active: Optional[str],
              now_ms: int) -> Plan:
    accounts = sorted({scan.profile.account for scan in scans})
    changes = {account: AccountChanges() for account in accounts}
    ops, final = plan_sessions(scans, baseline, active, now_ms, changes)
    after = Baseline(profiles={scan.profile.key for scan in scans}, sessions=final)
    document = plan_presets(presets_document, accounts, baseline, after, active, changes)
    return Plan(ops, document, changes, after)
