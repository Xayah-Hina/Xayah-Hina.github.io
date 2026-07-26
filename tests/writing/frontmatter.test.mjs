import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWritingSource,
  referencedAssets,
  serializeWritingSource,
  writingSourceHash,
} from "../../scripts/writing-frontmatter.mjs";

const metadata = {
  id: "20260715-090945",
  title: "A title",
  summary: "A summary",
  createdAt: "2026-07-15T09:09:45+08:00",
  updatedAt: "2026-07-17T00:00:00+08:00",
  lang: "zh-CN",
  status: "incomplete",
};

test("strict Front matter round-trips deterministically", () => {
  const source = serializeWritingSource(metadata, "## Section\n\nBody.");
  const parsed = parseWritingSource(source, metadata.id);
  assert.deepEqual(parsed.metadata, metadata);
  assert.equal(parsed.body, "## Section\n\nBody.\n");
  assert.equal(parsed.source, source);
  assert.match(writingSourceHash(source), /^[a-f0-9]{64}$/);
  assert.deepEqual(source.split("\n").slice(1, 8).map((line) => line.split(":")[0]), [
    "id",
    "title",
    "summary",
    "createdAt",
    "updatedAt",
    "lang",
    "status",
  ]);
});

test("Front matter rejects missing, reordered, and invalid fields", () => {
  const valid = serializeWritingSource(metadata, "## Section\n\nBody.");
  assert.throws(() => parseWritingSource(valid.replace('summary: "A summary"\n', ""), metadata.id), /front matter/i);
  assert.throws(
    () => parseWritingSource(valid.replace('title: "A title"\nsummary: "A summary"', 'summary: "A summary"\ntitle: "A title"'), metadata.id),
    /out of order/i,
  );
  assert.throws(() => parseWritingSource(valid, "20260717-034749"), /does not match/i);
  assert.throws(() => parseWritingSource(valid.replace('"zh-CN"', '"not_a_lang"'), metadata.id), /language/i);
  assert.throws(() => parseWritingSource(valid.replace('"incomplete"', '"draft"'), metadata.id), /status/i);
  assert.throws(() => parseWritingSource(valid.replace(metadata.createdAt, "2026-07-15T09:09:44+08:00"), metadata.id), /createdAt/i);
});

test("Writing body rejects H1 and canonicalizes content-addressed image references", () => {
  assert.throws(() => serializeWritingSource(metadata, "# Forbidden"), /H1/i);
  const hash = "a".repeat(64);
  assert.deepEqual(
    referencedAssets(`![Alt](./${hash}.PNG "Caption")\n\n![Again](./${hash}.png)`),
    [`${hash}.png`],
  );
  assert.throws(() => referencedAssets("![Alt](./photo.png)"), /not content-addressed/i);
  assert.throws(() => referencedAssets("![Alt](https://example.com/photo.png)"), /not content-addressed/i);
});
