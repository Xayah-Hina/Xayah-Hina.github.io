from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import re
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

from dictionary.build import (
    BuildError,
    build_site,
    export_sqlite,
    json_bytes,
    load_lexicon,
    personal_path,
)
from dictionary.import_ecdict import EXPECTED_SOURCE_SHA256, include_general_row, normalized_lines


ROOT = Path(__file__).resolve().parents[1]


def load_local_server_module():
    path = ROOT / "serve-local.py"
    spec = importlib.util.spec_from_file_location("xel_local_server", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FrozenLexiconTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lexicon, cls.entries = load_lexicon()
        cls.by_key = {entry["canonicalKey"]: entry for entry in cls.entries}

    def test_snapshot_invariants(self):
        self.assertEqual(self.lexicon["name"], "XEL-General")
        self.assertEqual(self.lexicon["source"]["revision"], "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b")
        self.assertEqual(self.lexicon["source"]["csvSha256"], EXPECTED_SOURCE_SHA256)
        self.assertEqual(len(self.entries), 34137)
        self.assertEqual(len(self.by_key), 34137)
        self.assertEqual([entry["rank"] for entry in self.entries], list(range(1, 34138)))
        self.assertEqual(sum(1 for entry in self.entries if " " in entry["word"] or "-" in entry["word"]), 1272)
        lemma_links = sum(
            1
            for entry in self.entries
            for relation in entry["relations"]
            if relation["kind"] == "lemma" and relation["word"].casefold() != entry["canonicalKey"]
        )
        self.assertEqual(lemma_links, 3566)
        self.assertEqual(sum("toefl" in entry["metadata"]["tags"] for entry in self.entries), 6974)
        self.assertEqual(
            {view["id"]: view["totalEntries"] for view in self.lexicon["browseViews"]},
            {"toefl": 6974, "ielts": 5040, "gre": 7504},
        )
        self.assertFalse(any(
            "\\n" in value or "\\r" in value
            for entry in self.entries
            for field in ("definitions", "translations")
            for value in entry[field]
        ))

    def test_representative_entries(self):
        prescribe = self.by_key["prescribe"]
        self.assertIn("v. 规定, 指定, 嘱咐, 开处方", prescribe["translations"])
        self.assertEqual(prescribe["slot"], (prescribe["rank"] - 1) % 32 + 1)
        abandoned = self.by_key["abandoned"]
        self.assertTrue(any(relation["kind"] == "lemma" and relation["targetEntryId"] == "en:abandon" for relation in abandoned["relations"]))
        self.assertEqual(self.by_key["account for"]["definitions"], [])
        self.assertIn("antarctica", self.by_key)
        self.assertEqual(self.by_key["antarctica"]["word"], "Antarctica")
        stealth = self.by_key["stealth"]
        self.assertEqual(stealth["metadata"]["tags"], ["gre"])
        self.assertEqual(stealth["metadata"]["bncRank"], 14083)
        self.assertIn("collins", stealth["metadata"]["inclusionReasons"])

    def test_general_inclusion_boundary(self):
        base = {"tag": "", "collins": "", "oxford": "", "bnc": "", "frq": ""}
        self.assertTrue(include_general_row(base | {"tag": "gre"}, "stealth"))
        self.assertTrue(include_general_row(base | {"bnc": "29999"}, "lowercase"))
        self.assertFalse(include_general_row(base | {"bnc": "29999"}, "Abbeville"))
        self.assertTrue(include_general_row(base | {"collins": "1"}, "Antarctica"))
        self.assertFalse(include_general_row(base | {"frq": "30001"}, "longtail"))
        self.assertEqual(normalized_lines(r"first\r\nsecond\nthird\rfourth"), ["first", "second", "third", "fourth"])

    def write_tiny_snapshot(self, root: Path, entries: list[dict], browse_views: list[dict] | None = None):
        frozen_entries = []
        for rank, original in enumerate(entries, start=1):
            entry = copy.deepcopy(original)
            entry["rank"] = rank
            entry["block"] = (rank - 1) // 32 + 1
            entry["slot"] = (rank - 1) % 32 + 1
            entry["shard"] = (rank - 1) // 256
            frozen_entries.append(entry)
        content = b"".join(json_bytes(entry) for entry in frozen_entries)
        lexicon = copy.deepcopy(self.lexicon)
        lexicon["totalEntries"] = len(frozen_entries)
        lexicon["contentSha256"] = hashlib.sha256(content).hexdigest()
        lexicon["browseViews"] = browse_views or []
        lexicon_path = root / "lexicon.json"
        entries_path = root / "entries.jsonl"
        lexicon_path.write_bytes(json_bytes(lexicon, pretty=True))
        entries_path.write_bytes(content)
        return lexicon_path, entries_path

    def test_build_rejects_invalid_address_invariants(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lexicon_path, entries_path = self.write_tiny_snapshot(
                root,
                [self.by_key["abandon"], self.by_key["a"]],
            )
            with self.assertRaisesRegex(BuildError, "strict canonical-key order"):
                load_lexicon(lexicon_path, entries_path)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            entry = copy.deepcopy(self.by_key["a"])
            entry["entryId"] = "en:not-a"
            lexicon_path, entries_path = self.write_tiny_snapshot(root, [entry])
            with self.assertRaisesRegex(BuildError, "permanent id"):
                load_lexicon(lexicon_path, entries_path)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            lexicon_path, entries_path = self.write_tiny_snapshot(
                root,
                [self.by_key["a"]],
                [{"id": "zk", "label": "ZK", "totalEntries": 0}],
            )
            with self.assertRaisesRegex(BuildError, "expected 0 entries, found 1"):
                load_lexicon(lexicon_path, entries_path)

    def test_deterministic_build_and_shards(self):
        with tempfile.TemporaryDirectory() as temporary:
            first = Path(temporary) / "first"
            second = Path(temporary) / "second"
            manifest_a = build_site(first)
            manifest_b = build_site(second)
            self.assertEqual(manifest_a, manifest_b)
            self.assertEqual(manifest_a["payloadShardCount"], 134)
            self.assertEqual(
                {view["id"]: view["totalEntries"] for view in manifest_a["browseViews"]},
                {"toefl": 6974, "ielts": 5040, "gre": 7504},
            )
            keys = json.loads((first / "keys.json").read_text(encoding="utf-8"))
            self.assertEqual(len(keys), 34137)
            self.assertIn("tags", keys[0])
            files_a = {path.relative_to(first): path.read_bytes() for path in first.rglob("*") if path.is_file()}
            files_b = {path.relative_to(second): path.read_bytes() for path in second.rglob("*") if path.is_file()}
            self.assertEqual(files_a, files_b)
            for path in sorted((first / "blocks").glob("*.json")):
                self.assertLessEqual(len(json.loads(path.read_text(encoding="utf-8"))), 256)

    def test_sqlite_export(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = Path(temporary) / "xel.sqlite"
            export_sqlite(destination)
            connection = sqlite3.connect(destination)
            try:
                tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertEqual(tables, {"entry", "lexicon_entry", "personal_entry", "personal_example"})
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM entry").fetchone()[0], 34137)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM lexicon_entry").fetchone()[0], 34137)
            finally:
                connection.close()


class LocalDictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = load_local_server_module()
        cls.lexicon, cls.entries = load_lexicon()
        cls.by_key = {entry["canonicalKey"]: entry for entry in cls.entries}

    def test_personal_save_open_clear_and_generated_overlay(self):
        entry = self.by_key["prescribe"]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            personal = root / "personal"
            generated = root / "generated"
            payload = {
                "entryId": entry["entryId"],
                "personal": {
                    "summary": "在医疗语境中表示开药；在规范中表示明确规定。",
                    "usageNotes": "Technical documents often use prescribe for a normative requirement.",
                    "confusionNotes": "Do not confuse with proscribe.",
                    "examples": [{
                        "id": "",
                        "sentence": "The API prescribes the lifetime of the resource.",
                        "translation": "该 API 规定资源的生命周期。",
                        "source": "self",
                        "comment": "technical usage",
                    }],
                },
            }
            saved = self.server.save_dictionary(payload, personal, generated)
            self.assertEqual(saved["status"], "saved")
            self.assertTrue(saved["personalHasContent"])
            self.assertTrue(personal_path(entry, personal).is_file())
            self.assertTrue((generated / "manifest.json").is_file())
            self.assertIn(entry["shard"], json.loads((generated / "manifest.json").read_text(encoding="utf-8"))["personalShards"])
            opened = self.server.open_dictionary({"entryId": entry["entryId"]}, personal)
            self.assertEqual(opened["personal"]["examples"][0]["sentence"], payload["personal"]["examples"][0]["sentence"])

            current = self.server.personal_content(opened["personal"])
            unchanged = self.server.save_dictionary({"entryId": entry["entryId"], "personal": current}, personal, generated)
            self.assertEqual(unchanged["status"], "unchanged")

            cleared = self.server.save_dictionary({
                "entryId": entry["entryId"],
                "personal": {"summary": "", "usageNotes": "", "confusionNotes": "", "examples": []},
            }, personal, generated)
            self.assertFalse(cleared["personalHasContent"])
            self.assertFalse(personal_path(entry, personal).exists())

    def test_oov_and_invalid_example_are_rejected(self):
        expected = re.escape(f"Not in {self.lexicon['name']} {self.lexicon['version']}.")
        with self.assertRaisesRegex(self.server.DictionaryError, expected):
            self.server.open_dictionary({"entryId": "en:not-a-real-xel-key"})
        entry = self.by_key["prescribe"]
        original = self.server.empty_personal_entry(entry["entryId"])
        with self.assertRaises(self.server.DictionaryError):
            self.server.normalize_personal_entry(entry, {
                "personal": {
                    "summary": "",
                    "usageNotes": "",
                    "confusionNotes": "",
                    "examples": [{"id": "", "sentence": "", "translation": "invalid", "source": "", "comment": ""}],
                },
            }, original)

    def test_origin_policy(self):
        class Request:
            def __init__(self, origin):
                self.headers = {"Origin": origin} if origin is not None else {}

        allowed = self.server.LocalSiteHandler.allowed_origin
        self.assertTrue(allowed(Request("http://localhost:8765")))
        self.assertTrue(allowed(Request("http://127.0.0.1:8765")))
        self.assertTrue(allowed(Request(None)))
        self.assertFalse(allowed(Request("https://xayah.me")))
        self.assertFalse(allowed(Request("http://localhost:9999")))

    def test_pending_status_clears_stale_message(self):
        publisher = self.server.GitPublisher(ROOT, enabled=True)
        publisher.branch = "master"
        publisher.state = "pending"
        publisher.message = "Dictionary changes are saved locally and awaiting Publish."
        publisher._managed_pending = lambda _paths: False
        status = publisher.pending_status()
        self.assertEqual(status["state"], "synced")
        self.assertFalse(status["dictionaryPending"])


class FrontendContractTests(unittest.TestCase):
    def test_search_autocomplete_contract(self):
        html = (ROOT / "dictionary" / "index.html").read_text(encoding="utf-8")
        script = (ROOT / "dictionary" / "app.js").read_text(encoding="utf-8")
        styles = (ROOT / "dictionary" / "styles.css").read_text(encoding="utf-8")
        self.assertIn('role="combobox"', html)
        self.assertIn('id="search-suggestions"', html)
        self.assertIn('role="listbox"', html)
        self.assertIn("function lowerBound(value)", script)
        self.assertIn('event.key === "ArrowDown"', script)
        self.assertIn("selectSuggestion(state.activeSuggestion)", script)
        self.assertIn("SUGGESTION_LIMIT = 16", script)
        self.assertIn(":where(.search-form, .local-authoring, .editor-actions, .examples-editor-heading) > button", styles)
        self.assertNotIn(".search-form button,", styles)
        self.assertIn("button, input, select, textarea", styles)
        self.assertIn('.suggestion-button[aria-selected="true"]', styles)
        self.assertIn("navigationVersion", script)
        self.assertIn("button.tabIndex = -1", script)
        self.assertNotIn('kicker: "32-word cognitive block"', script)

    def test_word_selection_does_not_replace_browse_context(self):
        script = (ROOT / "dictionary" / "app.js").read_text(encoding="utf-8")
        show_word = script[script.index("async function showWord"):script.index("function locatorPrefix")]
        locate_word = script[script.index("function locateWord"):script.index("function applyLocation")]
        self.assertIn("updateWordListSelection()", show_word)
        self.assertIn("renderEntry(entry, personal)", show_word)
        self.assertIn("updateUrl({ prefix: state.prefix, word: entry.word }, push)", show_word)
        self.assertNotIn("renderWordList(", show_word)
        self.assertNotIn("renderPrefixMap(", show_word)
        self.assertIn("state.prefix = locatorPrefix(key)", locate_word)
        self.assertIn("renderBrowseContext()", locate_word)
        self.assertIn("showWord(key, push)", locate_word)
        self.assertIn("locateWord(entry)", script)
        self.assertIn("if (exact) locateWord(exact)", script)
        self.assertNotIn("state.mode", script)
        self.assertNotIn("const blockStart", script)


if __name__ == "__main__":
    unittest.main()
