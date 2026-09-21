#!/usr/bin/env python3
"""Regenerate the `catalogEntries` section of `test-data/seed-profiles.json`.

`catalogEntries` is generated from `server/Api/rawCardCatalogDump.txt` (the real
catalogue); `profiles` is hand-authored and is preserved byte-for-byte. Only the
entries a profile actually references are emitted, in their existing manifest
order, so a dump edit produces a minimal, reviewable diff.

Ids that no dump record exists for (for example the hand-authored `T-120`
fixture) are left exactly as they are in the manifest.

Usage:
  python3 scripts/generate-seed-catalog.py            # rewrite the manifest
  python3 scripts/generate-seed-catalog.py --check     # report staleness, exit 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DUMP_PATH = REPO_ROOT / "server" / "Api" / "rawCardCatalogDump.txt"
MANIFEST_PATH = REPO_ROOT / "test-data" / "seed-profiles.json"

CATALOG_MARKER = '"catalogEntries": ['

# (manifest key, dump key) in the manifest's own key order. Fields the dump
# carries but the manifest deliberately omits (`attribute`, `imageVersion`,
# `supportCost`) are not projected.
FIELD_PROJECTION: tuple[tuple[str, str], ...] = (
    ("cardId", "id"),
    ("originalId", "originalId"),
    ("displayName", "displayName"),
    ("image", "image"),
    ("type", "type"),
    ("color", "color"),
    ("description", "description"),
    ("name", "name"),
    ("traits", "traits"),
    ("conditions", "conditions"),
    ("effects", "effects"),
    ("damage", "damage"),
    ("power", "power"),
    ("life", "life"),
    ("health", "health"),
    ("supportName", "supportName"),
    ("supportEffect", "supportEffect"),
    ("mainAlternate", "mainAlternate"),
    ("cannotBeNormalSummoned", "cannotBeNormalSummoned"),
)


def project_entry(dump_record: dict, existing_entry: dict) -> dict:
    """Build one manifest entry from a dump record, keeping the manifest key order."""
    entry: dict = {}
    for manifest_key, dump_key in FIELD_PROJECTION:
        value = dump_record.get(dump_key)
        if manifest_key == "supportName" and value is None:
            # The manifest normalises a missing support name to "" (leaders).
            value = ""
        entry[manifest_key] = value
    # Preserve keys the projection does not cover (none today, but keeps the
    # script forward-compatible with hand-added manifest fields).
    for key, value in existing_entry.items():
        entry.setdefault(key, value)
    return entry


def describe_changes(referenced_ids: list[str], dump_by_id: dict, manifest: dict) -> list[str]:
    changes: list[str] = []
    for entry in manifest["catalogEntries"]:
        card_id = entry["cardId"]
        dump_record = dump_by_id.get(card_id)
        if dump_record is None:
            continue
        projected = project_entry(dump_record, entry)
        for key, new_value in projected.items():
            old_value = entry.get(key)
            if old_value != new_value and key != "cardId":
                changes.append(f"  {card_id}.{key}: changed")
    missing = [card_id for card_id in referenced_ids if card_id not in dump_by_id]
    for card_id in missing:
        changes.append(f"  {card_id}: not in dump - left untouched (hand-authored fixture)")
    return changes


def render_catalog_entries(entries: list[dict]) -> str:
    """Serialise the array exactly like the existing manifest: indent 2, shifted +2."""
    rendered = json.dumps(entries, indent=2, ensure_ascii=False)
    lines = rendered.splitlines()
    if lines[0] != "[" or lines[-1] != "]":
        raise ValueError("Unexpected json.dumps layout for the entries array.")
    return "\n".join("  " + line for line in lines[1:-1])


def regenerate() -> tuple[str, list[str]]:
    with DUMP_PATH.open(encoding="utf-8") as handle:
        dump_records = json.load(handle)
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        raw_manifest = handle.read()

    manifest = json.loads(raw_manifest)
    dump_by_id = {record["id"]: record for record in dump_records}

    referenced_ids: list[str] = []
    for profile in manifest["profiles"]:
        for deck in profile["decks"].values():
            for card in deck["cards"]:
                if card["cardId"] not in referenced_ids:
                    referenced_ids.append(card["cardId"])

    entries = [
        project_entry(dump_by_id[entry["cardId"]], entry)
        if entry["cardId"] in dump_by_id
        else entry
        for entry in manifest["catalogEntries"]
    ]

    start = raw_manifest.index(CATALOG_MARKER) + len(CATALOG_MARKER)
    end = raw_manifest.rindex("]")
    updated = raw_manifest[:start] + "\n" + render_catalog_entries(entries) + "\n  ]" + raw_manifest[end + 1 :]

    changes = describe_changes(referenced_ids, dump_by_id, manifest)
    return updated, changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report staleness without writing")
    args = parser.parse_args()

    updated, changes = regenerate()
    with MANIFEST_PATH.open(encoding="utf-8") as handle:
        current = handle.read()

    if updated == current:
        print("catalogEntries is up to date with the dump.")
        return 0

    if changes:
        print("catalogEntries differences against the dump:")
        print("\n".join(changes))

    if args.check:
        print("catalogEntries is stale. Run: python3 scripts/generate-seed-catalog.py")
        return 1

    MANIFEST_PATH.write_text(updated, encoding="utf-8")
    print(f"Rewrote {MANIFEST_PATH.relative_to(REPO_ROOT)} (profiles preserved).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
