import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import texmath from "markdown-it-texmath";
import { canonicalWritingAssetName } from "./writing-assets.mjs";

// Authoring validation and the published renderer must agree on which text is
// Markdown syntax. In particular, fenced code and math are not headings or
// images, while reference images and images in footnotes are real assets.
export function createWritingMarkdownParser(options = {}, mathEngine) {
  // texmath caches its first engine at module scope. Validation never renders,
  // and must not leave its placeholder installed when the site loads KaTeX.
  if (mathEngine) texmath.katex = mathEngine;
  return new MarkdownIt({ html: false, linkify: true, typographer: false, ...options })
    .use(footnote)
    .use(texmath, { engine: mathEngine || { renderToString: () => "" }, delimiters: "dollars", katexOptions: { throwOnError: false, strict: "warn" } });
}

const parser = createWritingMarkdownParser();

function comparableHeadingText(value) {
  return String(value).normalize("NFKC").replace(/[ \t]+/g, " ").trim();
}

export function writingBodyHeadingError(body, title) {
  const tokens = parser.parse(String(body), {});
  let firstHeading = true;
  let hasH1 = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    if (token.tag === "h1") hasH1 = true;
    if (!["h1", "h2"].includes(token.tag)) continue;
    if (firstHeading && comparableHeadingText(tokens[index + 1]?.content || "") === comparableHeadingText(title)) {
      return "duplicate-title";
    }
    firstHeading = false;
  }
  return hasH1 ? "h1" : null;
}

export function writingReferencedAssets(body) {
  const assets = new Set();
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === "image") {
        const destination = token.attrGet("src") || "";
        const assetName = canonicalWritingAssetName(destination);
        if (!assetName) throw new Error(`Writing image ${destination} is not content-addressed.`);
        assets.add(assetName);
        continue; // Nested image syntax in an alt label renders as text.
      }
      if (token.children) visit(token.children);
    }
  };
  visit(parser.parse(String(body), {}));
  return [...assets].sort();
}
