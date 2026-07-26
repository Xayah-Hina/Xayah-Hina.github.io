import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { imageSchema } from "@milkdown/kit/preset/commonmark";
import { $view, insert, replaceAll } from "@milkdown/kit/utils";

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
  const local = source.match(/^\.\/([a-f0-9]{64}\.(?:jpg|jpeg|png|webp|gif|avif))$/i);
  return local ? `${assetBase.replace(/\/$/, "")}/${local[1]}` : source;
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
  let silent = true;
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
              const alt = imageLabel(file);
              nodes.push(imageType.createAndFill({ src: source, alt, title: alt }));
            }
            return nodes;
          } finally {
            onUploadState?.("");
          }
        },
      }));
    })
    .use(imageView(assetBase));

  crepe.on((listener) => {
    listener.markdownUpdated((_ctx, value) => {
      if (!silent) onChange(value);
    });
  });

  await crepe.create();
  window.setTimeout(() => {
    silent = false;
  }, 0);

  return {
    getMarkdown() {
      return crepe.getMarkdown();
    },
    insertMarkdown(value) {
      crepe.editor.action(insert(value));
    },
    replaceMarkdown(value) {
      silent = true;
      crepe.editor.action(replaceAll(value, true));
      window.setTimeout(() => {
        silent = false;
      }, 0);
    },
    focus() {
      crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    },
    setReadonly(value) {
      crepe.setReadonly(value);
    },
    destroy() {
      crepe.destroy();
      root.replaceChildren();
    },
  };
}
