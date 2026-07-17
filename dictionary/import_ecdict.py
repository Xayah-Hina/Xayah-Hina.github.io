from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import tempfile
import unicodedata
import urllib.request
from pathlib import Path


REVISION = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
SOURCE_URL = f"https://raw.githubusercontent.com/skywind3000/ECDICT/{REVISION}/ecdict.csv"
EXPECTED_SOURCE_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"
EXAM_TAGS = frozenset({"zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts", "gre"})
BROWSE_VIEWS = ("toefl", "ielts", "gre")
FREQUENCY_CUTOFF = 30_000
EXPECTED_ENTRIES = 34_137
EXPECTED_EXPRESSIONS = 1_272
EXPECTED_DISTINCT_LEMMA_LINKS = 3_566
COGNITIVE_BLOCK_SIZE = 32
PAYLOAD_SHARD_SIZE = 256
ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "source"
LEXICON_PATH = SOURCE_DIR / "lexicon.json"
ENTRIES_PATH = SOURCE_DIR / "xel-general-1.0.jsonl"


class ImportError(ValueError):
    pass


def canonical_key(word: str) -> str:
    return unicodedata.normalize("NFKC", word).casefold()


def normalized_lines(value: str) -> list[str]:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\r", "\n")
    return [line.strip() for line in value.split("\n") if line.strip()]


def optional_positive_int(value: str) -> int | None:
    value = value.strip()
    if not value or value == "0":
        return None
    try:
        parsed = int(value)
    except ValueError as error:
        raise ImportError(f"Invalid positive integer: {value}") from error
    return parsed if parsed > 0 else None


def parse_exchange(value: str, known_keys: set[str]) -> list[dict]:
    labels = {
        "0": "lemma",
        "p": "past",
        "d": "pastParticiple",
        "i": "presentParticiple",
        "3": "thirdPersonSingular",
        "r": "comparative",
        "t": "superlative",
        "s": "plural",
    }
    relations = []
    seen = set()
    for item in value.split("/"):
        if ":" not in item:
            continue
        code, related_word = item.split(":", 1)
        related_word = related_word.strip()
        kind = labels.get(code)
        if not kind or not related_word:
            continue
        related_key = canonical_key(related_word)
        marker = (kind, related_key)
        if marker in seen:
            continue
        seen.add(marker)
        relations.append({
            "kind": kind,
            "word": related_word,
            "targetEntryId": f"en:{related_key}" if related_key in known_keys else None,
        })
    return relations


def acquire_source(source: str | None) -> tuple[Path, str, bool]:
    if source:
        path = Path(source).resolve()
        if not path.is_file():
            raise ImportError(f"ECDICT source does not exist: {path}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return path, digest, False

    temporary = tempfile.NamedTemporaryFile(prefix="ecdict-", suffix=".csv", delete=False)
    temporary_path = Path(temporary.name)
    digest = hashlib.sha256()
    try:
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "XEL-General-Importer/1.0"})
        with temporary, urllib.request.urlopen(request, timeout=180) as response:
            while chunk := response.read(1024 * 1024):
                temporary.write(chunk)
                digest.update(chunk)
        return temporary_path, digest.hexdigest(), True
    except Exception:
        temporary.close()
        temporary_path.unlink(missing_ok=True)
        raise


def general_inclusion(row: dict, word: str) -> tuple[bool, list[str]]:
    tags = set((row.get("tag") or "").split())
    reasons = [f"tag:{tag}" for tag in sorted(tags.intersection(EXAM_TAGS))]
    collins = optional_positive_int(row.get("collins") or "")
    bnc_rank = optional_positive_int(row.get("bnc") or "")
    frq_rank = optional_positive_int(row.get("frq") or "")
    if collins:
        reasons.append("collins")
    if (row.get("oxford") or "").strip() == "1":
        reasons.append("oxford3000")
    if bnc_rank and bnc_rank <= FREQUENCY_CUTOFF:
        reasons.append(f"bnc-top-{FREQUENCY_CUTOFF}")
    if frq_rank and frq_rank <= FREQUENCY_CUTOFF:
        reasons.append(f"frq-top-{FREQUENCY_CUTOFF}")
    curated = any(
        reason.startswith("tag:") or reason in {"collins", "oxford3000"}
        for reason in reasons
    )
    frequency_ranked = any(reason.startswith(("bnc-top-", "frq-top-")) for reason in reasons)
    normalized_word = unicodedata.normalize("NFKC", word)
    return curated or (frequency_ranked and normalized_word == normalized_word.lower()), reasons


def include_general_row(row: dict, word: str) -> bool:
    return general_inclusion(row, word)[0]


def read_general_rows(path: Path) -> list[dict]:
    csv.field_size_limit(sys.maxsize)
    rows = []
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"word", "phonetic", "definition", "translation", "tag", "exchange"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ImportError(f"ECDICT CSV is missing fields: {', '.join(sorted(missing))}")
        for row in reader:
            word = (row.get("word") or "").strip()
            included, reasons = general_inclusion(row, word)
            if not word or not included:
                continue
            rows.append(row | {"word": word, "_inclusionReasons": reasons})
    return rows


def build_entries(rows: list[dict]) -> list[dict]:
    keys = [canonical_key(row["word"]) for row in rows]
    if len(keys) != len(set(keys)):
        raise ImportError("XEL-General entries contain duplicate canonical keys.")
    known_keys = set(keys)
    rows.sort(key=lambda row: (canonical_key(row["word"]), row["word"]))

    entries = []
    for rank, row in enumerate(rows, start=1):
        key = canonical_key(row["word"])
        collins = optional_positive_int(row.get("collins") or "")
        inclusion_reasons = row.get("_inclusionReasons")
        if inclusion_reasons is None:
            _, inclusion_reasons = general_inclusion(row, row["word"])
        entry = {
            "schemaVersion": 1,
            "entryId": f"en:{key}",
            "canonicalKey": key,
            "word": row["word"],
            "rank": rank,
            "block": (rank - 1) // COGNITIVE_BLOCK_SIZE + 1,
            "slot": (rank - 1) % COGNITIVE_BLOCK_SIZE + 1,
            "shard": (rank - 1) // PAYLOAD_SHARD_SIZE,
            "phonetic": (row.get("phonetic") or "").strip(),
            "definitions": normalized_lines(row.get("definition") or ""),
            "translations": normalized_lines(row.get("translation") or ""),
            "relations": parse_exchange(row.get("exchange") or "", known_keys),
            "metadata": {
                "tags": (row.get("tag") or "").split(),
                "collins": collins,
                "oxford3000": (row.get("oxford") or "").strip() == "1",
                "bncRank": optional_positive_int(row.get("bnc") or ""),
                "frqRank": optional_positive_int(row.get("frq") or ""),
                "exchange": (row.get("exchange") or "").strip(),
                "inclusionReasons": inclusion_reasons,
            },
        }
        entries.append(entry)
    return entries


def encode_json(value: object, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def import_ecdict(source: str | None = None) -> dict:
    source_path, source_sha256, temporary = acquire_source(source)
    try:
        if source_sha256 != EXPECTED_SOURCE_SHA256:
            raise ImportError(
                f"ECDICT source SHA-256 mismatch: expected {EXPECTED_SOURCE_SHA256}, found {source_sha256}."
            )
        entries = build_entries(read_general_rows(source_path))
    finally:
        if temporary:
            source_path.unlink(missing_ok=True)

    expression_count = sum(1 for entry in entries if " " in entry["word"] or "-" in entry["word"])
    lemma_links = sum(
        1
        for entry in entries
        for relation in entry["relations"]
        if relation["kind"] == "lemma" and canonical_key(relation["word"]) != entry["canonicalKey"]
    )
    if len(entries) != EXPECTED_ENTRIES:
        raise ImportError(f"Expected {EXPECTED_ENTRIES} XEL-General entries, found {len(entries)}.")
    if expression_count != EXPECTED_EXPRESSIONS:
        raise ImportError(f"Expected {EXPECTED_EXPRESSIONS} expressions, found {expression_count}.")
    if lemma_links != EXPECTED_DISTINCT_LEMMA_LINKS:
        raise ImportError(f"Expected {EXPECTED_DISTINCT_LEMMA_LINKS} lemma links, found {lemma_links}.")

    jsonl = b"".join(encode_json(entry) for entry in entries)
    content_sha256 = hashlib.sha256(jsonl).hexdigest()
    lexicon = {
        "schemaVersion": 1,
        "name": "XEL-General",
        "version": "1.0",
        "frozen": True,
        "frozenAt": "2026-07-17",
        "totalEntries": len(entries),
        "cognitiveBlockSize": COGNITIVE_BLOCK_SIZE,
        "payloadShardSize": PAYLOAD_SHARD_SIZE,
        "contentSha256": content_sha256,
        "normalization": "Unicode NFKC followed by casefold; sorted by canonical key and original word",
        "inclusionPolicy": (
            "ECDICT rows with any exact zk/gk/cet4/cet6/ky/toefl/ielts/gre tag, "
            "Collins rank, or Oxford 3000 marker; plus lowercase-only frequency fallback rows "
            "whose BNC or FRQ rank is at most 30000"
        ),
        "browseViews": [
            {
                "id": tag,
                "label": tag.upper(),
                "totalEntries": sum(tag in entry["metadata"]["tags"] for entry in entries),
            }
            for tag in BROWSE_VIEWS
        ],
        "source": {
            "name": "ECDICT",
            "repository": "https://github.com/skywind3000/ECDICT",
            "revision": REVISION,
            "csvUrl": SOURCE_URL,
            "csvSha256": source_sha256,
            "license": "MIT",
        },
    }
    atomic_write(ENTRIES_PATH, jsonl)
    atomic_write(LEXICON_PATH, encode_json(lexicon, pretty=True))
    return lexicon


def main() -> None:
    parser = argparse.ArgumentParser(description="Freeze the ECDICT-derived XEL-General 1.0 lexicon.")
    parser.add_argument("--source", help="Optional local ecdict.csv. The pinned upstream file is downloaded otherwise.")
    arguments = parser.parse_args()
    lexicon = import_ecdict(arguments.source)
    print(f"Imported {lexicon['totalEntries']} entries into {ENTRIES_PATH}")
    print(f"Content SHA-256: {lexicon['contentSha256']}")


if __name__ == "__main__":
    main()
