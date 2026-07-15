import {
  defineCustomElement,
  defineCustomElementAssetStore,
  newCustomElement,
  registerCustomElement,
  registerCustomElementRenderer,
} from "@excalidraw/excalidraw";
import { MIME_TYPES, THEME } from "@excalidraw/common";

import type { DataURL } from "@excalidraw/excalidraw/types";
import type { CustomElementValue, FileId } from "@excalidraw/element/types";

const MEDIA_RENDERER_ID = "mivo.dev.media-card";
const STATUS_RENDERER_ID = "mivo.dev.status-card";
const PREVIEW_FILE_ID = "mivo-custom-element-preview" as FileId;
const originalFiles = new Map<string, File | Blob>();

export const customElementDevAssetStore = defineCustomElementAssetStore({
  async put(file, { customType }) {
    const id = `${customType}/${crypto.randomUUID()}-${
      file instanceof File ? file.name : "resource"
    }`;
    originalFiles.set(id, file);
    return {
      provider: "dev-memory",
      id,
      mimeType: file.type,
      name: file instanceof File ? file.name : undefined,
      size: file.size,
    };
  },
  async resolve(resource) {
    return originalFiles.get(resource.id) ?? null;
  },
  async exists(resource) {
    return originalFiles.has(resource.id);
  },
  async remove(resource) {
    originalFiles.delete(resource.id);
  },
});

type DevMediaData = Readonly<
  Record<string, CustomElementValue> & {
    name: string;
    duration: number;
    devFixture: boolean;
  }
>;

const previewSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#251b52"/>
        <stop offset="0.55" stop-color="#7c3aed"/>
        <stop offset="1" stop-color="#22d3ee"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#bg)"/>
    <circle cx="730" cy="130" r="170" fill="#ffffff" opacity=".12"/>
    <circle cx="170" cy="470" r="230" fill="#ffffff" opacity=".08"/>
    <path d="M395 178L620 270 395 362Z" fill="#fff" opacity=".94"/>
    <text x="48" y="72" fill="#fff" font-family="Arial" font-size="28" font-weight="700">MIVO CUSTOM ELEMENT</text>
  </svg>
`;

const previewDataURL = `data:image/svg+xml;base64,${window.btoa(
  previewSvg,
)}` as DataURL;

export const registerCustomElementDevRenderers = () => {
  const unregisterMedia = registerCustomElement(
    defineCustomElement<DevMediaData>({
      type: "dev.media",
      schemaVersion: 1,
      file: {
        accept: ["image/*"],
        async import({ file, assets, signal }) {
          if (!assets) {
            throw new Error("This custom element requires an AssetStore");
          }
          const resource = await assets.put(file, {
            customType: "dev.media",
            signal,
          });
          return {
            resource,
            width: 480,
            height: 300,
            data: {
              name: file.name,
              duration: 8,
              devFixture: true,
            },
          };
        },
        async createPreview({ resource, assets, previews, signal, file }) {
          if (!resource || !assets) {
            return null;
          }
          const original = file ?? (await assets.resolve(resource, { signal }));
          return original instanceof Blob
            ? previews.put(original, { name: resource.name })
            : null;
        },
      },
      async activate({ element, assets, signal, activation }) {
        const original =
          element.resource && assets
            ? await assets.resolve(element.resource, { signal })
            : null;
        const point = activation.point
          ? `；局部坐标 (${Math.round(activation.point.x)}, ${Math.round(
              activation.point.y,
            )})`
          : "";
        window.alert(
          original
            ? `已通过 AssetStore 找到原始文件：${element.resource?.id}${point}`
            : "该静态测试卡片没有绑定原始文件",
        );
      },
      renderer: {
        id: MEDIA_RENDERER_ID,
        render: ({ element, painter, theme }) => {
          const dark = theme === THEME.DARK;
          const footerHeight = Math.max(54, element.height * 0.16);
          const previewHeight = element.height - footerHeight;

          painter.rect(0, 0, element.width, element.height, {
            radius: 18,
            fill: dark ? "#202027" : "#ffffff",
            stroke: dark ? "#4b4b57" : "#d9d9e3",
            strokeWidth: 1.5,
          });
          if (element.previewFileId) {
            painter.image(
              element.previewFileId,
              1.5,
              1.5,
              element.width - 3,
              previewHeight,
              { fit: "cover", radius: 17 },
            );
          }
          painter.rect(0, previewHeight, element.width, footerHeight, {
            fill: dark ? "#202027" : "#ffffff",
          });
          painter.line(16, previewHeight, element.width - 16, previewHeight, {
            stroke: dark ? "#35353e" : "#eeeeF3",
          });
          painter.text(
            String(element.data.name ?? "Mivo video card"),
            18,
            previewHeight + footerHeight / 2,
            {
              color: dark ? "#f6f6f8" : "#202027",
              fontSize: Math.max(14, footerHeight * 0.28),
              fontWeight: 650,
              baseline: "middle",
              maxWidth: element.width - 100,
            },
          );
          painter.rect(
            element.width - 62,
            previewHeight + footerHeight / 2 - 14,
            44,
            28,
            { radius: 8, fill: "#111118cc" },
          );
          painter.text(
            "8s",
            element.width - 40,
            previewHeight + footerHeight / 2,
            {
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              align: "center",
              baseline: "middle",
            },
          );
        },
      },
    }),
  );

  const unregisterStatus = registerCustomElementRenderer({
    id: STATUS_RENDERER_ID,
    render: ({ element, painter, theme }) => {
      const dark = theme === THEME.DARK;
      painter.rect(0, 0, element.width, element.height, {
        radius: 24,
        fill: dark ? "#17171c" : "#fbfbfe",
        stroke: dark ? "#474752" : "#ddddE8",
        strokeWidth: 1.5,
      });
      painter.circle(34, 36, 10, { fill: "#22c55e" });
      painter.text("Canvas renderer online", 56, 36, {
        color: dark ? "#ffffff" : "#202027",
        fontSize: 17,
        fontWeight: 700,
        baseline: "middle",
      });
      painter.text("Resize or zoom the canvas", 24, 78, {
        color: dark ? "#aaaab5" : "#686875",
        fontSize: 14,
        baseline: "middle",
      });
      painter.rect(24, 108, element.width - 48, 12, {
        radius: 6,
        fill: dark ? "#303039" : "#e9e9f1",
      });
      painter.rect(24, 108, (element.width - 48) * 0.72, 12, {
        radius: 6,
        fill: "#7c3aed",
      });
      painter.path(
        `M ${element.width - 49} 28 L ${element.width - 25} 40 L ${
          element.width - 49
        } 52 Z`,
        { fill: "#a78bfa" },
      );
    },
  });

  return () => {
    unregisterMedia();
    unregisterStatus();
  };
};

export const customElementDevFiles = {
  [PREVIEW_FILE_ID]: {
    id: PREVIEW_FILE_ID,
    mimeType: MIME_TYPES.svg,
    dataURL: previewDataURL,
    created: Date.now(),
  },
};

export const createCustomElementDevElements = () => {
  const mediaCard = newCustomElement({
    x: 80,
    y: 100,
    width: 480,
    height: 300,
    customType: "dev.media",
    schemaVersion: 1,
    rendererId: MEDIA_RENDERER_ID,
    previewFileId: PREVIEW_FILE_ID,
    data: {
      name: "机器人与动力装甲 · 视频节点",
      duration: 8,
      devFixture: true,
    },
  });
  const statusCard = newCustomElement({
    x: 600,
    y: 175,
    width: 320,
    height: 150,
    customType: "mivo.status",
    rendererId: STATUS_RENDERER_ID,
    data: { devFixture: true },
  });
  return [mediaCard, statusCard];
};
