"""Reads and writes the desktop app's web storage: Chromium's Local Storage, a leveldb database.

The Code tab's own state lives there, not in the app's JSON files: the saved environments of each account are the
`persisted.ccd-session-presets.<account>` entry of the claude.ai origin. The app copies that entry into
ccd-session-presets.json whenever it starts, so a change made to the JSON file alone is overwritten at the next launch.

leveldb has no Python binding on a stock Mac, so this module reads the database's files itself (log files, sorted
tables with snappy compression, the manifest) and writes by appending one record to the current log file, exactly as
leveldb itself writes: the database replays that log when it next opens. Writing is only safe while the app is closed,
since an open database holds the log and would write over the appended record. The format is leveldb's documented
on-disk format; if a later app version changes the storage engine, reading fails loudly instead of guessing.
"""

from __future__ import annotations

import os
import struct
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

ORIGIN = "https://claude.ai"
LOCAL_STORAGE_DIR_PARTS = ("Local Storage", "leveldb")

BLOCK_SIZE = 32768
HEADER_SIZE = 7
FULL, FIRST, MIDDLE, LAST = 1, 2, 3, 4
TYPE_DELETION, TYPE_VALUE = 0, 1
COMPARATOR = b"leveldb.BytewiseComparator"


class WebStoreError(Exception):
    """The database is not in a shape this module understands; nothing was written."""


def local_storage_dir(app_dir: Path) -> Path:
    return app_dir.joinpath(*LOCAL_STORAGE_DIR_PARTS)


def _crc32c_table():
    table = []
    for n in range(256):
        crc = n
        for _ in range(8):
            crc = (crc >> 1) ^ 0x82F63B78 if crc & 1 else crc >> 1
        table.append(crc)
    return table


_CRC_TABLE = _crc32c_table()


def crc32c(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for byte in data:
        crc = _CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >> 8)
    return crc ^ 0xFFFFFFFF


def masked_crc(data: bytes) -> int:
    crc = crc32c(data)
    return (((crc >> 15) | (crc << 17)) + 0xA282EAD8) & 0xFFFFFFFF


def _varint(buf: bytes, pos: int) -> Tuple[int, int]:
    result = shift = 0
    while True:
        byte = buf[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7


def _encode_varint(value: int) -> bytes:
    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value)
    return bytes(out)


def _snappy_decompress(src: bytes) -> bytes:
    length, pos = _varint(src, 0)
    out = bytearray()
    while pos < len(src):
        tag = src[pos]
        pos += 1
        kind = tag & 3
        if kind == 0:
            size = tag >> 2
            if size >= 60:
                extra = size - 59
                size = int.from_bytes(src[pos:pos + extra], "little")
                pos += extra
            size += 1
            out += src[pos:pos + size]
            pos += size
            continue
        if kind == 1:
            size = ((tag >> 2) & 7) + 4
            offset = ((tag >> 5) << 8) | src[pos]
            pos += 1
        elif kind == 2:
            size = (tag >> 2) + 1
            offset = int.from_bytes(src[pos:pos + 2], "little")
            pos += 2
        else:
            size = (tag >> 2) + 1
            offset = int.from_bytes(src[pos:pos + 4], "little")
            pos += 4
        start = len(out) - offset
        if offset <= 0 or start < 0:
            raise WebStoreError("A Local Storage table block does not decompress")
        if offset >= size:
            out += out[start:start + size]
        else:
            for index in range(size):
                out.append(out[start + index])
    if len(out) != length:
        raise WebStoreError("A Local Storage table block does not decompress")
    return bytes(out)


def _log_records(data: bytes) -> Iterator[bytes]:
    """The whole records of a leveldb log, checksums verified. A damaged or unfinished record is skipped, as leveldb
    itself skips it when it replays the log."""
    pos = 0
    pending: Optional[bytearray] = None
    while pos + HEADER_SIZE <= len(data):
        left = BLOCK_SIZE - pos % BLOCK_SIZE
        if left < HEADER_SIZE:
            pos += left
            continue
        crc, length, kind = struct.unpack("<IHB", data[pos:pos + HEADER_SIZE])
        payload = data[pos + HEADER_SIZE:pos + HEADER_SIZE + length]
        pos += HEADER_SIZE + length
        if kind == 0 and length == 0:
            continue
        if len(payload) != length or masked_crc(bytes([kind]) + payload) != crc:
            pending = None
            continue
        if kind == FULL:
            pending = None
            yield payload
        elif kind == FIRST:
            pending = bytearray(payload)
        elif kind == MIDDLE and pending is not None:
            pending += payload
        elif kind == LAST and pending is not None:
            yield bytes(pending + payload)
            pending = None


def _batch_entries(record: bytes) -> Iterator[Tuple[bytes, int, int, bytes]]:
    sequence, count = struct.unpack("<QI", record[:12])
    pos = 12
    for index in range(count):
        kind = record[pos]
        pos += 1
        key_length, pos = _varint(record, pos)
        key = record[pos:pos + key_length]
        pos += key_length
        value = b""
        if kind == TYPE_VALUE:
            value_length, pos = _varint(record, pos)
            value = record[pos:pos + value_length]
            pos += value_length
        yield key, sequence + index, kind, value


def _read_block(data: bytes, offset: int, size: int) -> bytes:
    raw = data[offset:offset + size]
    compression = data[offset + size]
    if compression == 0:
        return raw
    if compression == 1:
        return _snappy_decompress(raw)
    raise WebStoreError(f"A Local Storage table uses compression type {compression}")


def _block_entries(block: bytes) -> Iterator[Tuple[bytes, bytes]]:
    restarts = struct.unpack("<I", block[-4:])[0]
    end = len(block) - 4 - 4 * restarts
    pos = 0
    key = b""
    while pos < end:
        shared, pos = _varint(block, pos)
        unshared, pos = _varint(block, pos)
        value_length, pos = _varint(block, pos)
        key = key[:shared] + block[pos:pos + unshared]
        pos += unshared
        yield key, block[pos:pos + value_length]
        pos += value_length


def _table_entries(data: bytes) -> Iterator[Tuple[bytes, int, int, bytes]]:
    if len(data) < 48 or data[-8:] != bytes.fromhex("57fb808b247547db"):
        raise WebStoreError("A Local Storage table has no leveldb footer")
    footer = data[-48:]
    _, pos = _varint(footer, 0)
    _, pos = _varint(footer, pos)
    index_offset, pos = _varint(footer, pos)
    index_size, pos = _varint(footer, pos)
    for _, handle in _block_entries(_read_block(data, index_offset, index_size)):
        offset, pos = _varint(handle, 0)
        size, pos = _varint(handle, pos)
        for internal_key, value in _block_entries(_read_block(data, offset, size)):
            trailer = struct.unpack("<Q", internal_key[-8:])[0]
            yield internal_key[:-8], trailer >> 8, trailer & 0xFF, value


def _map_key(key: str) -> bytes:
    # Chromium's layout: "_" + origin + NUL, then the key with a format byte (1: Latin-1).
    return b"_" + ORIGIN.encode("ascii") + b"\x00\x01" + key.encode("latin-1")


def decode_value(raw: bytes) -> str:
    if not raw:
        return ""
    if raw[0] == 0:
        return raw[1:].decode("utf-16-le")
    if raw[0] == 1:
        return raw[1:].decode("latin-1")
    raise WebStoreError("A Local Storage value has an unknown format")


def encode_value(value: str) -> bytes:
    # The format byte the renderer itself picks: Latin-1 when every character fits, else UTF-16.
    try:
        return b"\x01" + value.encode("latin-1")
    except UnicodeEncodeError:
        return b"\x00" + value.encode("utf-16-le")


class LocalStorage:
    """One Chromium Local Storage database, the claude.ai origin's entries."""

    def __init__(self, path: Path):
        self.path = path

    def exists(self) -> bool:
        return (self.path / "CURRENT").is_file()

    def _manifest(self) -> Tuple[int, int]:
        """(current log number, last sequence) from the manifest that CURRENT names."""
        name = (self.path / "CURRENT").read_text(encoding="ascii").strip()
        if not name.startswith("MANIFEST-") or "/" in name:
            raise WebStoreError("Local Storage's CURRENT file names no manifest")
        log_number = last_sequence = None
        for record in _log_records((self.path / name).read_bytes()):
            pos = 0
            while pos < len(record):
                tag, pos = _varint(record, pos)
                if tag == 1:
                    length, pos = _varint(record, pos)
                    if record[pos:pos + length] != COMPARATOR:
                        raise WebStoreError("Local Storage uses a comparator this module does not know")
                    pos += length
                elif tag in (2, 3, 4, 9):
                    value, pos = _varint(record, pos)
                    if tag == 2:
                        log_number = value
                    elif tag == 4:
                        last_sequence = value
                elif tag == 5:
                    _, pos = _varint(record, pos)
                    length, pos = _varint(record, pos)
                    pos += length
                elif tag == 6:
                    _, pos = _varint(record, pos)
                    _, pos = _varint(record, pos)
                elif tag == 7:
                    for _ in range(3):
                        _, pos = _varint(record, pos)
                    for _ in range(2):
                        length, pos = _varint(record, pos)
                        pos += length
                else:
                    raise WebStoreError(f"Local Storage's manifest holds an unknown field ({tag})")
        if log_number is None or last_sequence is None:
            raise WebStoreError("Local Storage's manifest names no log")
        return log_number, last_sequence

    def _entries(self) -> Iterator[Tuple[bytes, int, int, bytes]]:
        for name in sorted(os.listdir(self.path)):
            path = self.path / name
            try:
                if name.endswith(".ldb") or name.endswith(".sst"):
                    yield from _table_entries(path.read_bytes())
                elif name.endswith(".log"):
                    for record in _log_records(path.read_bytes()):
                        yield from _batch_entries(record)
            except FileNotFoundError:
                # A compaction of the running app removed the file between the listing and the read.
                continue

    def read(self, prefix: str) -> Dict[str, str]:
        """The live values of the origin's keys that start with `prefix`."""
        wanted = _map_key(prefix)
        latest: Dict[bytes, Tuple[int, int, bytes]] = {}
        for key, sequence, kind, value in self._entries():
            if key.startswith(wanted) and (key not in latest or latest[key][0] < sequence):
                latest[key] = (sequence, kind, value)
        offset = len(_map_key(""))
        return {key[offset:].decode("latin-1"): decode_value(value)
                for key, (_, kind, value) in latest.items() if kind == TYPE_VALUE}

    def last_sequence(self) -> int:
        _, last = self._manifest()
        for _, sequence, _, _ in self._entries():
            last = max(last, sequence)
        return last

    def write(self, changes: Dict[str, Optional[str]]) -> None:
        """Sets each key to its value, or deletes it for None, in one batch appended to the current log."""
        if not changes:
            return
        log_number, _ = self._manifest()
        log_path = self.path / f"{log_number:06d}.log"
        if not log_path.is_file():
            raise WebStoreError("Local Storage's current log file is missing")
        batch = bytearray(struct.pack("<QI", self.last_sequence() + 1, len(changes)))
        for key, value in changes.items():
            raw_key = _map_key(key)
            if value is None:
                batch += bytes([TYPE_DELETION]) + _encode_varint(len(raw_key)) + raw_key
            else:
                raw_value = encode_value(value)
                batch += (bytes([TYPE_VALUE]) + _encode_varint(len(raw_key)) + raw_key
                          + _encode_varint(len(raw_value)) + raw_value)
        append_log_record(log_path, bytes(batch))


def append_log_record(path: Path, payload: bytes) -> None:
    """Appends one record to a leveldb log, split over blocks the way leveldb's own log writer splits it."""
    offset = path.stat().st_size % BLOCK_SIZE
    out = bytearray()
    remaining = payload
    is_first = True
    while True:
        left = BLOCK_SIZE - offset
        if left < HEADER_SIZE:
            out += b"\x00" * left
            offset = 0
            left = BLOCK_SIZE
        fragment = remaining[:left - HEADER_SIZE]
        remaining = remaining[len(fragment):]
        is_last = not remaining
        kind = FULL if is_first and is_last else FIRST if is_first else LAST if is_last else MIDDLE
        out += struct.pack("<IHB", masked_crc(bytes([kind]) + fragment), len(fragment), kind) + fragment
        offset = (offset + HEADER_SIZE + len(fragment)) % BLOCK_SIZE
        is_first = False
        if is_last:
            break
    with open(path, "ab") as handle:
        handle.write(out)
        handle.flush()
        os.fsync(handle.fileno())
