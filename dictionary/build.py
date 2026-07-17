from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
import unicodedata
from contextlib import closing
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source"
LEXICON_PATH = SOURCE_DIR / "lexicon.json"
ENTRIES_PATH = SOURCE_DIR / "xel-general-1.0.jsonl"
PERSONAL_DIR = ROOT / "personal"
GENERATED_DIR = ROOT / "generated"


class BuildError(ValueError):
    pass


def json_bytes(value: object, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def load_lexicon(
    lexicon_path: Path = LEXICON_PATH,
    entries_path: Path = ENTRIES_PATH,
) -> tuple[dict, list[dict]]:
    try:
        lexicon = json.loads(lexicon_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as error:
        raise BuildError(f"Invalid or missing lexicon manifest: {lexicon_path}") from error

    entries = []
    digest = hashlib.sha256()
    try:
        with entries_path.open("rb") as source:
            for line_number, raw_line in enumerate(source, start=1):
                digest.update(raw_line)
                if not raw_line.strip():
                    continue
                try:
                    entry = json.loads(raw_line)
                except json.JSONDecodeError as error:
                    raise BuildError(f"Invalid JSONL at {entries_path}:{line_number}") from error
                entries.append(entry)
    except FileNotFoundError as error:
        raise BuildError(f"Missing frozen entries: {entries_path}") from error

    if lexicon.get("schemaVersion") != 1 or lexicon.get("frozen") is not True:
        raise BuildError("Lexicon manifest must be a frozen schemaVersion 1 snapshot.")
    if not isinstance(lexicon.get("name"), str) or not lexicon["name"]:
        raise BuildError("Lexicon manifest has an invalid name.")
    if not isinstance(lexicon.get("version"), str) or not lexicon["version"]:
        raise BuildError("Lexicon manifest has an invalid version.")

    expected_total = lexicon.get("totalEntries")
    if isinstance(expected_total, bool) or not isinstance(expected_total, int) or expected_total <= 0:
        raise BuildError("Lexicon manifest has an invalid totalEntries value.")
    if len(entries) != expected_total:
        raise BuildError(f"Expected {expected_total} entries, found {len(entries)}.")
    if digest.hexdigest() != lexicon.get("contentSha256"):
        raise BuildError("Frozen entry content hash does not match lexicon.json.")

    ids = set()
    keys = set()
    relation_targets = []
    block_size = lexicon.get("cognitiveBlockSize")
    shard_size = lexicon.get("payloadShardSize")
    for label, value in (("cognitiveBlockSize", block_size), ("payloadShardSize", shard_size)):
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise BuildError(f"Lexicon manifest has an invalid {label} value.")
    previous_key = None
    for expected_rank, entry in enumerate(entries, start=1):
        if entry.get("schemaVersion") != 1:
            raise BuildError(f"Entry at rank {expected_rank} has an invalid schemaVersion.")
        entry_id = entry.get("entryId")
        canonical_key = entry.get("canonicalKey")
        word = entry.get("word")
        if not isinstance(word, str) or not word:
            raise BuildError(f"Entry at rank {expected_rank} has an invalid word.")
        expected_key = unicodedata.normalize("NFKC", word).casefold()
        if canonical_key != expected_key or not canonical_key.isascii():
            raise BuildError(f"Entry at rank {expected_rank} has an invalid canonical key.")
        if entry_id != f"en:{canonical_key}":
            raise BuildError(f"Entry at rank {expected_rank} has an invalid permanent id.")
        if not entry_id or entry_id in ids:
            raise BuildError(f"Duplicate or empty entry id at rank {expected_rank}.")
        if not canonical_key or canonical_key in keys:
            raise BuildError(f"Duplicate or empty canonical key at rank {expected_rank}.")
        if previous_key is not None and canonical_key <= previous_key:
            raise BuildError(f"Entries are not in strict canonical-key order at {entry_id}.")
        if entry.get("rank") != expected_rank:
            raise BuildError(f"Non-contiguous rank at {entry_id}.")
        if entry.get("block") != (expected_rank - 1) // block_size + 1:
            raise BuildError(f"Invalid block at {entry_id}.")
        if entry.get("slot") != (expected_rank - 1) % block_size + 1:
            raise BuildError(f"Invalid slot at {entry_id}.")
        if entry.get("shard") != (expected_rank - 1) // shard_size:
            raise BuildError(f"Invalid shard at {entry_id}.")
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict) or not isinstance(metadata.get("tags"), list) or not all(
            isinstance(tag, str) and tag for tag in metadata["tags"]
        ):
            raise BuildError(f"Invalid metadata tags at {entry_id}.")
        if len(metadata["tags"]) != len(set(metadata["tags"])):
            raise BuildError(f"Duplicate metadata tags at {entry_id}.")
        if not isinstance(entry.get("phonetic"), str):
            raise BuildError(f"Invalid phonetic value at {entry_id}.")
        for field in ("definitions", "translations"):
            values = entry.get(field)
            if not isinstance(values, list) or not all(isinstance(value, str) and value for value in values):
                raise BuildError(f"Invalid {field} at {entry_id}.")
        relations = entry.get("relations")
        if not isinstance(relations, list):
            raise BuildError(f"Invalid relations at {entry_id}.")
        for relation in relations:
            if not isinstance(relation, dict) or not isinstance(relation.get("kind"), str) or not isinstance(relation.get("word"), str):
                raise BuildError(f"Invalid relation at {entry_id}.")
            target = relation.get("targetEntryId")
            if target is not None and not isinstance(target, str):
                raise BuildError(f"Invalid relation target at {entry_id}.")
            relation_targets.append((entry_id, target))
        inclusion_reasons = metadata.get("inclusionReasons")
        if not isinstance(inclusion_reasons, list) or not all(
            isinstance(reason, str) and reason for reason in inclusion_reasons
        ):
            raise BuildError(f"Invalid inclusion reasons at {entry_id}.")
        ids.add(entry_id)
        keys.add(canonical_key)
        previous_key = canonical_key

    for entry_id, target in relation_targets:
        if target is not None and target not in ids:
            raise BuildError(f"Relation target {target} from {entry_id} is outside the frozen lexicon.")

    browse_views = lexicon.get("browseViews", [])
    if not isinstance(browse_views, list):
        raise BuildError("Lexicon manifest browseViews must be an array.")
    view_ids = set()
    for view in browse_views:
        if not isinstance(view, dict):
            raise BuildError("Lexicon manifest contains an invalid browse view.")
        view_id = view.get("id")
        label = view.get("label")
        total = view.get("totalEntries")
        if not isinstance(view_id, str) or not view_id or view_id in view_ids:
            raise BuildError("Lexicon manifest contains a duplicate or invalid browse view id.")
        if not isinstance(label, str) or not label:
            raise BuildError(f"Browse view {view_id} has an invalid label.")
        actual_total = sum(view_id in entry["metadata"]["tags"] for entry in entries)
        if total != actual_total:
            raise BuildError(f"Browse view {view_id} expected {total} entries, found {actual_total}.")
        view_ids.add(view_id)
    return lexicon, entries


def personal_path(entry: dict, personal_dir: Path = PERSONAL_DIR) -> Path:
    key = entry["canonicalKey"]
    prefix = quote(key[:2] or "_", safe="-")
    filename = quote(key, safe="-") + ".json"
    path = (personal_dir / prefix / filename).resolve()
    root = personal_dir.resolve()
    if root != path and root not in path.parents:
        raise BuildError("Personal entry path escapes the personal directory.")
    return path


def validate_personal_record(value: object, expected_entry_id: str | None = None) -> dict:
    if not isinstance(value, dict):
        raise BuildError("Personal entry must be a JSON object.")
    if value.get("schemaVersion") != 1:
        raise BuildError("Personal entry schemaVersion must be 1.")
    entry_id = value.get("entryId")
    if not isinstance(entry_id, str) or not entry_id:
        raise BuildError("Personal entry has an invalid entryId.")
    if expected_entry_id is not None and entry_id != expected_entry_id:
        raise BuildError(f"Personal entry id mismatch: expected {expected_entry_id}.")

    result = {"schemaVersion": 1, "entryId": entry_id}
    for field in ("summary", "usageNotes", "confusionNotes", "createdAt", "updatedAt"):
        item = value.get(field, "")
        if not isinstance(item, str):
            raise BuildError(f"Personal entry field {field} must be text.")
        result[field] = item

    examples = value.get("examples", [])
    if not isinstance(examples, list) or len(examples) > 200:
        raise BuildError("Personal entry examples must be an array of at most 200 items.")
    example_ids = set()
    normalized_examples = []
    for example in examples:
        if not isinstance(example, dict):
            raise BuildError("Each personal example must be an object.")
        normalized = {}
        for field in ("id", "sentence", "translation", "source", "comment", "createdAt", "updatedAt"):
            item = example.get(field, "")
            if not isinstance(item, str):
                raise BuildError(f"Personal example field {field} must be text.")
            normalized[field] = item
        if not normalized["id"] or normalized["id"] in example_ids:
            raise BuildError("Personal example ids must be non-empty and unique.")
        if not normalized["sentence"].strip():
            raise BuildError("Personal example sentence is required.")
        example_ids.add(normalized["id"])
        normalized_examples.append(normalized)
    result["examples"] = normalized_examples
    return result


def load_personal(entries: list[dict], personal_dir: Path = PERSONAL_DIR) -> dict[str, dict]:
    by_id = {entry["entryId"]: entry for entry in entries}
    records = {}
    if not personal_dir.exists():
        return records
    for path in sorted(personal_dir.rglob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise BuildError(f"Invalid personal JSON: {path}") from error
        record = validate_personal_record(value)
        entry_id = record["entryId"]
        if entry_id not in by_id:
            raise BuildError(f"Personal entry is outside the frozen lexicon: {entry_id}")
        if entry_id in records:
            raise BuildError(f"Duplicate personal entry: {entry_id}")
        if path.resolve() != personal_path(by_id[entry_id], personal_dir):
            raise BuildError(f"Personal entry is stored at a non-canonical path: {path}")
        records[entry_id] = record
    return records


def build_payload(lexicon: dict, entries: list[dict], personal: dict[str, dict]) -> dict[str, bytes]:
    shard_size = lexicon["payloadShardSize"]
    shard_count = (len(entries) + shard_size - 1) // shard_size
    outputs: dict[str, bytes] = {}
    keys = [
        {
            "entryId": entry["entryId"],
            "canonicalKey": entry["canonicalKey"],
            "word": entry["word"],
            "rank": entry["rank"],
            "block": entry["block"],
            "slot": entry["slot"],
            "shard": entry["shard"],
            "tags": entry["metadata"]["tags"],
        }
        for entry in entries
    ]
    outputs["keys.json"] = json_bytes(keys)

    personal_shards = []
    for shard in range(shard_count):
        start = shard * shard_size
        block_entries = entries[start:start + shard_size]
        filename = f"{shard:04d}.json"
        outputs[f"blocks/{filename}"] = json_bytes(block_entries)
        overlay = [personal[entry["entryId"]] for entry in block_entries if entry["entryId"] in personal]
        if overlay:
            outputs[f"personal/{filename}"] = json_bytes(overlay)
            personal_shards.append(shard)

    digest = hashlib.sha256()
    for path in sorted(outputs):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(outputs[path])
    manifest = {
        "schemaVersion": 1,
        "name": lexicon["name"],
        "version": lexicon["version"],
        "totalEntries": len(entries),
        "cognitiveBlockSize": lexicon["cognitiveBlockSize"],
        "payloadShardSize": shard_size,
        "payloadShardCount": shard_count,
        "personalEntryCount": len(personal),
        "personalShards": personal_shards,
        "dataVersion": digest.hexdigest(),
        "source": lexicon["source"],
        "browseViews": lexicon.get("browseViews", []),
    }
    outputs["manifest.json"] = json_bytes(manifest, pretty=True)
    return outputs


def write_output_atomic(outputs: dict[str, bytes], output_dir: Path) -> None:
    output_dir = output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    temporary_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.", dir=output_dir.parent))
    backup_dir = output_dir.with_name(f".{output_dir.name}.old")
    try:
        for relative, content in outputs.items():
            destination = temporary_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
        if output_dir.exists():
            os.replace(output_dir, backup_dir)
        os.replace(temporary_dir, output_dir)
        if backup_dir.exists():
            shutil.rmtree(backup_dir)
    except Exception:
        if not output_dir.exists() and backup_dir.exists():
            os.replace(backup_dir, output_dir)
        shutil.rmtree(temporary_dir, ignore_errors=True)
        raise


def build_site(
    output_dir: Path = GENERATED_DIR,
    personal_dir: Path = PERSONAL_DIR,
    lexicon_path: Path = LEXICON_PATH,
    entries_path: Path = ENTRIES_PATH,
) -> dict:
    lexicon, entries = load_lexicon(lexicon_path, entries_path)
    personal = load_personal(entries, personal_dir)
    outputs = build_payload(lexicon, entries, personal)
    write_output_atomic(outputs, output_dir)
    return json.loads(outputs["manifest.json"])


def export_sqlite(
    destination: Path,
    personal_dir: Path = PERSONAL_DIR,
    lexicon_path: Path = LEXICON_PATH,
    entries_path: Path = ENTRIES_PATH,
) -> None:
    lexicon, entries = load_lexicon(lexicon_path, entries_path)
    personal = load_personal(entries, personal_dir)
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with closing(sqlite3.connect(temporary)) as connection:
            with connection:
                connection.executescript("""
                PRAGMA foreign_keys=ON;
                PRAGMA journal_mode=DELETE;
                CREATE TABLE entry (
                    entry_id TEXT PRIMARY KEY,
                    canonical_key TEXT NOT NULL UNIQUE,
                    word TEXT NOT NULL,
                    phonetic TEXT,
                    definitions_json TEXT NOT NULL,
                    translations_json TEXT NOT NULL,
                    relations_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                );
                CREATE TABLE lexicon_entry (
                    lexicon_name TEXT NOT NULL,
                    lexicon_version TEXT NOT NULL,
                    entry_id TEXT NOT NULL REFERENCES entry(entry_id),
                    rank INTEGER NOT NULL,
                    block INTEGER NOT NULL,
                    slot INTEGER NOT NULL,
                    PRIMARY KEY (lexicon_name, lexicon_version, entry_id),
                    UNIQUE (lexicon_name, lexicon_version, rank)
                );
                CREATE TABLE personal_entry (
                    entry_id TEXT PRIMARY KEY REFERENCES entry(entry_id),
                    summary TEXT NOT NULL,
                    usage_notes TEXT NOT NULL,
                    confusion_notes TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE personal_example (
                    id TEXT PRIMARY KEY,
                    entry_id TEXT NOT NULL REFERENCES personal_entry(entry_id),
                    sentence TEXT NOT NULL,
                    translation TEXT NOT NULL,
                    source TEXT NOT NULL,
                    comment TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)
                for entry in entries:
                    connection.execute(
                        "INSERT INTO entry VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            entry["entryId"], entry["canonicalKey"], entry["word"], entry["phonetic"],
                            json.dumps(entry["definitions"], ensure_ascii=False),
                            json.dumps(entry["translations"], ensure_ascii=False),
                            json.dumps(entry["relations"], ensure_ascii=False),
                            json.dumps(entry["metadata"], ensure_ascii=False),
                        ),
                    )
                    connection.execute(
                        "INSERT INTO lexicon_entry VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            lexicon["name"], lexicon["version"], entry["entryId"],
                            entry["rank"], entry["block"], entry["slot"],
                        ),
                    )
                for record in personal.values():
                    connection.execute(
                        "INSERT INTO personal_entry VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            record["entryId"], record["summary"], record["usageNotes"], record["confusionNotes"],
                            record["createdAt"], record["updatedAt"],
                        ),
                    )
                    for example in record["examples"]:
                        connection.execute(
                            "INSERT INTO personal_example VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            (
                                example["id"], record["entryId"], example["sentence"], example["translation"],
                                example["source"], example["comment"], example["createdAt"], example["updatedAt"],
                            ),
                        )
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Build and export the XEL-General static dictionary.")
    subparsers = parser.add_subparsers(dest="command")
    build_parser = subparsers.add_parser("build", help="Build browser JSON payloads.")
    build_parser.add_argument("--output", type=Path, default=GENERATED_DIR)
    export_parser = subparsers.add_parser("export-sqlite", help="Export a merged single-file SQLite backup.")
    export_parser.add_argument("destination", type=Path)
    arguments = parser.parse_args()
    command = arguments.command or "build"
    if command == "build":
        manifest = build_site(getattr(arguments, "output", GENERATED_DIR))
        print(f"Built {manifest['totalEntries']} entries in {manifest['payloadShardCount']} shards.")
        print(f"Data version: {manifest['dataVersion']}")
    else:
        export_sqlite(arguments.destination)
        print(f"Exported SQLite backup: {arguments.destination.resolve()}")


if __name__ == "__main__":
    main()
