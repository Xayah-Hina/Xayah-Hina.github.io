import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import { $view, insert, replaceAll } from "@milkdown/kit/utils";
import { canonicalWritingAssetName } from "../worker/src/writing-assets.mjs";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

function imageLabel(file) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Image";
}

function displayImageUrl(source, assetBase) {
  const name = canonicalWritingAssetName(source);
  return name ? `${assetBase.replace(/\/$/, "")}/${name}` : source;
}

function imageView(assetBase) {
  return $view(imageSchema.node, () => (node) => {
    const dom = document.createElement("span");
    const image = document.createElement("img");
    const caption = document.createElement("span");
    dom.className = "writing-composer-image";
    dom.contentEditable = "false";
    image.draggable = false;
    caption.className = "writing-composer-image-caption";
    dom.append(image, caption);

    const render = (nextNode) => {
      image.src = displayImageUrl(nextNode.attrs.src, assetBase);
      image.alt = nextNode.attrs.alt || "";
      image.title = nextNode.attrs.title || "";
      caption.textContent = nextNode.attrs.title || nextNode.attrs.alt || "";
      caption.hidden = !caption.textContent;
    };
    render(node);

    return {
      dom,
      update(nextNode) {
        if (nextNode.type !== node.type) return false;
        node = nextNode;
        render(nextNode);
        return true;
      },
      ignoreMutation() {
        return true;
      },
      selectNode() {
        dom.dataset.selected = "true";
      },
      deselectNode() {
        delete dom.dataset.selected;
      },
    };
  });
}

export async function createWritingComposer({
  root,
  markdown,
  assetBase,
  onChange,
  onUpload,
  onUploadState,
}) {
  let ready = false;
  let notifiedDoc = null;
  let destroyed = false;
  let readonly = false;
  let destroyPromise = null;
  const crepe = new Crepe({
    root,
    defaultValue: markdown,
    features: {
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.TopBar]: false,
      [Crepe.Feature.AI]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: "Start writing… Type / for commands.",
        mode: "doc",
      },
      [Crepe.Feature.Latex]: {
        katexOptions: {
          throwOnError: false,
          strict: "ignore",
        },
      },
    },
  });

  crepe.editor
    .config((ctx) => {
      ctx.update(uploadConfig.key, (previous) => ({
        ...previous,
        enableHtmlFileUploader: true,
        uploader: async (files, schema) => {
          if (destroyed || readonly) throw new Error("The Writing editor is no longer editable.");
          const imageType = schema.nodes.image;
          if (!imageType) throw new Error("The Markdown image node is unavailable.");
          const images = [...files].filter((file) => IMAGE_TYPES.has(file.type));
          if (images.length !== files.length) {
            throw new Error("Only JPEG, PNG, WebP, GIF, and AVIF images are supported.");
          }
          onUploadState?.(`Uploading ${images.length} image${images.length === 1 ? "" : "s"}…`);
          try {
            const nodes = [];
            for (const file of images) {
              const source = await onUpload(file);
              if (destroyed || readonly) throw new Error("The Writing editor changed before the upload finished.");
              const alt = imageLabel(file);
              nodes.push(imageType.createAndFill({ src: source, alt, title: alt }));
            }
            return nodes;
          } finally {
            if (!destroyed) onUploadState?.("");
          }
        },
      }));
    })
    .use(imageView(assetBase));

  const currentDoc = () => crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
  const flushChanges = () => {
    if (destroyed || !ready) return false;
    const doc = currentDoc();
    if (notifiedDoc?.eq(doc)) return false;
    // Milkdown's markdownUpdated listener is debounced. Read the current doc
    // synchronously at save/close boundaries, but never serialize an unchanged
    // doc: doing so would normalize untouched source Markdown unnecessarily.
    const value = crepe.getMarkdown();
    notifiedDoc = doc;
    onChange(value);
    return true;
  };

  crepe.on((listener) => {
    listener.markdownUpdated(() => flushChanges());
  });

  await crepe.create();
  notifiedDoc = currentDoc();
  ready = true;

  return {
    flushChanges,
    getMarkdown() {
      return crepe.getMarkdown();
    },
    insertMarkdown(value) {
      if (destroyed || readonly) return;
      crepe.editor.action(insert(value));
    },
    replaceMarkdown(value) {
      if (destroyed) return;
      ready = false;
      try {
        crepe.editor.action(replaceAll(value, true));
        notifiedDoc = currentDoc();
      } finally {
        ready = true;
      }
    },
    focus() {
      if (destroyed) return;
      crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    },
    setReadonly(value) {
      readonly = value;
      crepe.setReadonly(value);
    },
    async destroy() {
      if (!destroyPromise) {
        destroyed = true;
        destroyPromise = (async () => {
          try {
            await crepe.destroy();
          } finally {
            root.replaceChildren();
          }
        })();
      }
      await destroyPromise;
    },
  };
}
