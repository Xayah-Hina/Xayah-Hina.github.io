import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/common";
import GithubSlugger from "github-slugger";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeUrl(value) {
  const source = String(value || "").trim();
  if (/^(?:https:\/\/|mailto:|#|\/(?!\/)|\.\/)/i.test(source)) return source;
  return "";
}

export function renderMarkdown(source, options = {}) {
  const slugger = new GithubSlugger();
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    highlight(code, language) {
      if (language && hljs.getLanguage(language)) {
        return `<pre class="hljs"><code>${hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`;
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
    },
  });
  md.use(anchor, {
    level: [2, 3],
    slugify: (value) => slugger.slug(value),
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "after",
      class: "heading-anchor",
      ariaHidden: true,
    }),
  });
  md.use(footnote);
  md.use(taskLists, { enabled: false, label: true, labelAfter: true });
  md.use(texmath, { engine: katex, delimiters: "dollars", katexOptions: { throwOnError: false, strict: "warn" } });

  const defaultLinkOpen = md.renderer.rules.link_open
    || ((tokens, index, renderOptions, env, self) => self.renderToken(tokens, index, renderOptions));
  md.renderer.rules.link_open = (tokens, index, renderOptions, env, self) => {
    const hrefIndex = tokens[index].attrIndex("href");
    if (hrefIndex >= 0) {
      const href = safeUrl(tokens[index].attrs[hrefIndex][1]);
      tokens[index].attrs[hrefIndex][1] = href || "#";
      if (/^https:\/\//i.test(href)) {
        tokens[index].attrSet("rel", "noopener noreferrer");
      }
    }
    return defaultLinkOpen(tokens, index, renderOptions, env, self);
  };

  const defaultImage = md.renderer.rules.image
    || ((tokens, index, renderOptions, env, self) => self.renderToken(tokens, index, renderOptions));
  md.renderer.rules.image = (tokens, index, renderOptions, env, self) => {
    const token = tokens[index];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0) {
      let src = token.attrs[srcIndex][1];
      if (src.startsWith("./") && options.assetBase) {
        src = `${String(options.assetBase).replace(/\/$/, "")}/${src.slice(2)}`;
      }
      token.attrs[srcIndex][1] = safeUrl(src) || "";
      token.attrSet("loading", "lazy");
      token.attrSet("decoding", "async");
    }
    return defaultImage(tokens, index, renderOptions, env, self);
  };

  const defaultParagraphOpen = md.renderer.rules.paragraph_open
    || ((tokens, index, renderOptions, env, self) => self.renderToken(tokens, index, renderOptions));
  const defaultParagraphClose = md.renderer.rules.paragraph_close
    || ((tokens, index, renderOptions, env, self) => self.renderToken(tokens, index, renderOptions));
  md.renderer.rules.paragraph_open = (tokens, index, renderOptions, env, self) => {
    const inline = tokens[index + 1];
    const children = inline?.type === "inline" ? inline.children || [] : [];
    if (children.length === 1 && children[0].type === "image") {
      env.__writingFigureCaption = children[0].attrGet("title") || "";
      return "<figure class=\"writing-figure\">";
    }
    return defaultParagraphOpen(tokens, index, renderOptions, env, self);
  };
  md.renderer.rules.paragraph_close = (tokens, index, renderOptions, env, self) => {
    if (env.__writingFigureCaption !== undefined) {
      const caption = env.__writingFigureCaption;
      delete env.__writingFigureCaption;
      return `${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
    }
    return defaultParagraphClose(tokens, index, renderOptions, env, self);
  };

  const env = {};
  const tokens = md.parse(String(source), env);
  const headings = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open" || !["h2", "h3"].includes(token.tag)) continue;
    const inline = tokens[index + 1];
    headings.push({
      level: Number(token.tag.slice(1)),
      id: token.attrGet("id") || "",
      text: inline?.content || "",
    });
  }
  return { html: md.renderer.render(tokens, md.options, env), headings };
}
