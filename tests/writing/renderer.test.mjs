import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../../scripts/writing-markdown.mjs";

test("shared renderer supports the agreed Markdown features", () => {
  const hash = "b".repeat(64);
  const source = `## Repeat

- parent
  - child
- [x] task

| A | B |
| - | - |
| 1 | 2 |

\`\`\`js
const answer = 42;
\`\`\`

Inline $x^2$ and:

$$
E = mc^2
$$

A footnote.[^note]

![Alt](./${hash}.png "Caption")

## Repeat

[^note]: Footnote text.
`;
  const rendered = renderMarkdown(source, { assetBase: "https://media.example/writing/id" });
  assert.match(rendered.html, /task-list-item/);
  assert.match(rendered.html, /<table>/);
  assert.match(rendered.html, /class="hljs"/);
  assert.match(rendered.html, /class="katex"/);
  assert.match(rendered.html, /class="footnotes"/);
  assert.match(rendered.html, /<figure class="writing-figure">/);
  assert.match(rendered.html, /<figcaption>Caption<\/figcaption>/);
  assert.match(rendered.html, new RegExp(`https://media\\.example/writing/id/${hash}\\.png`));
  assert.deepEqual(rendered.headings.map(({ id }) => id), ["repeat", "repeat-1"]);
});

test("raw HTML and unsafe protocols never become executable markup", () => {
  const rendered = renderMarkdown(`<script>alert(1)</script>

[unsafe](javascript:alert(1))

[safe](https://example.com)

![remote](https://example.com/tracker.png)
`);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /&lt;script&gt;/);
  assert.doesNotMatch(rendered.html, /href="javascript:/i);
  assert.match(rendered.html, /href="https:\/\/example\.com"/);
  assert.match(rendered.html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(rendered.html, /tracker\.png/);
});
