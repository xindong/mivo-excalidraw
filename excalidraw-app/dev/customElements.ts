import {
  defineCustomElement,
  defineCustomElementAssetStore,
  defineCustomElementExtension,
  newCustomElement,
  registerCustomElementExtension,
} from "@excalidraw/excalidraw";
import { MIME_TYPES, THEME } from "@excalidraw/common";

import type { DataURL } from "@excalidraw/excalidraw/types";
import type { CustomElementValue, FileId } from "@excalidraw/element/types";

import {
  mediaCustomElementOverlays,
  videoCustomElementLifecycle,
  videoCustomElementOverlays,
} from "./customElementOverlays";
import {
  customNodeConnectionOverlay,
  WORKFLOW_CUSTOM_TYPE,
  WORKFLOW_PREVIEW_FILE_ID,
  WORKFLOW_RENDERER_ID,
} from "./customElementConnections";
import {
  getMediaLayout,
  MEDIA_FOOTER_HEIGHT,
  MEDIA_TITLE_FONT_SIZE,
} from "./customElementLayout";

const MEDIA_RENDERER_ID = "mivo.dev.media-card";
const VIDEO_RENDERER_ID = "mivo.dev.video-card";
const STATUS_RENDERER_ID = "mivo.dev.status-card";
const PREVIEW_FILE_ID = "mivo-custom-element-preview" as FileId;
const originalFiles = new Map<string, File | Blob>();

const getImageDimensions = async (file: File, signal: AbortSignal) => {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  try {
    signal.throwIfAborted();
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
};

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

export type DevMediaData = Readonly<
  Record<string, CustomElementValue> & {
    name: string;
    duration: number;
    devFixture: boolean;
    sourceWidth?: number;
    sourceHeight?: number;
  }
>;

export type DevVideoData = DevMediaData;

export type DevWorkflowData = Readonly<
  Record<string, CustomElementValue> & {
    name: string;
    workflowKind: "image" | "video";
    devFixture: boolean;
  }
>;

const getVideoPreview = async (
  file: Blob,
  signal: AbortSignal,
  currentTime = 0,
) => {
  signal.throwIfAborted();
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
      };
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            `无法读取视频“${file instanceof File ? file.name : "resource"}”`,
          ),
        );
      };
      const onAbort = () => {
        cleanup();
        reject(signal.reason);
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      video.addEventListener("error", onError, { once: true });
      signal.addEventListener("abort", onAbort, { once: true });
    });
    signal.throwIfAborted();
    const targetTime = Math.min(
      Math.max(0, currentTime),
      Number.isFinite(video.duration) ? video.duration : 0,
    );
    if (targetTime > 0.01) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
          signal.removeEventListener("abort", onAbort);
        };
        const onSeeked = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("无法定位视频预览帧"));
        };
        const onAbort = () => {
          cleanup();
          reject(signal.reason);
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        signal.addEventListener("abort", onAbort, { once: true });
        video.currentTime = targetTime;
      });
      signal.throwIfAborted();
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const preview = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("无法生成视频首帧预览")),
        "image/png",
      );
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      preview,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
};

const formatDuration = (duration: unknown) =>
  `${Math.max(0, Math.round(typeof duration === "number" ? duration : 0))}s`;

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

const workflowPreviewSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="workflow-bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#f4f2ff"/>
        <stop offset="1" stop-color="#e7e3ff"/>
      </linearGradient>
      <linearGradient id="workflow-glow" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#8b7bff"/>
        <stop offset="1" stop-color="#5e4ae8"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill="url(#workflow-bg)"/>
    <path d="M0 430C170 330 280 500 465 390S760 250 960 350V540H0Z" fill="#fff" opacity=".5"/>
    <circle cx="480" cy="248" r="106" fill="#fff" opacity=".72"/>
    <rect x="397" y="165" width="166" height="166" rx="42" fill="url(#workflow-glow)"/>
    <path d="M446 219h68m-68 34h68m-68 34h42" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity=".92"/>
    <circle cx="357" cy="248" r="15" fill="#8b7bff"/>
    <circle cx="603" cy="248" r="15" fill="#8b7bff"/>
    <path d="M372 248h25m166 0h25" stroke="#8b7bff" stroke-width="8" stroke-linecap="round"/>
  </svg>
`;

const workflowPreviewDataURL = `data:image/svg+xml;base64,${window.btoa(
  workflowPreviewSvg,
)}` as DataURL;

export const registerCustomElementDevRenderers = () => {
  const unregisterMedia = registerCustomElementExtension(
    defineCustomElementExtension({
      definition: defineCustomElement<DevMediaData>({
        type: "dev.media",
        schemaVersion: 1,
        file: {
          accept: ["image/*"],
          async import({ file, assets, signal }) {
            if (!assets) {
              throw new Error("This custom element requires an AssetStore");
            }
            const { width, height } = await getImageDimensions(file, signal);
            const resource = await assets.put(file, {
              customType: "dev.media",
              signal,
            });
            return {
              resource,
              width,
              height: height + MEDIA_FOOTER_HEIGHT,
              data: {
                name: file.name,
                duration: 8,
                devFixture: true,
                sourceWidth: width,
                sourceHeight: height,
              },
            };
          },
          async createPreview({ resource, assets, signal, file }) {
            if (!resource || !assets) {
              return null;
            }
            const original =
              file ?? (await assets.resolve(resource, { signal }));
            return original instanceof Blob ? original : null;
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
          cache: { mode: "source", maxScale: 4 },
          viewBox: ({ element }) =>
            getMediaLayout({
              width: element.width,
              height: element.height,
              sourceWidth: element.data.sourceWidth,
              sourceHeight: element.data.sourceHeight,
            }).viewBox,
          render: ({ element, painter, theme, viewBox }) => {
            const dark = theme === THEME.DARK;
            const width = viewBox.width;
            const height = viewBox.height;
            const footerHeight = MEDIA_FOOTER_HEIGHT;
            const previewHeight = height - footerHeight;

            painter.rect(0, 0, width, height, {
              radius: 0,
              fill: dark ? "#202027" : "#ffffff",
            });
            if (element.previewFileId) {
              painter.image(element.previewFileId, 0, 0, width, previewHeight, {
                fit: "contain",
                radius: 0,
              });
            }
            painter.rect(0, previewHeight, width, footerHeight, {
              fill: dark ? "#202027" : "#ffffff",
            });
            painter.line(16, previewHeight, width - 16, previewHeight, {
              stroke: dark ? "#35353e" : "#eeeeF3",
            });
            painter.text(
              String(element.data.name ?? "Mivo video card"),
              18,
              previewHeight + footerHeight / 2,
              {
                color: dark ? "#f6f6f8" : "#202027",
                fontSize: MEDIA_TITLE_FONT_SIZE,
                fontWeight: 650,
                baseline: "middle",
                maxWidth: width - 100,
              },
            );
            painter.rect(
              width - 62,
              previewHeight + footerHeight / 2 - 14,
              44,
              28,
              { radius: 8, fill: "#111118cc" },
            );
            painter.text("8s", width - 40, previewHeight + footerHeight / 2, {
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 700,
              align: "center",
              baseline: "middle",
            });
          },
        },
      }),
      overlays: [...mediaCustomElementOverlays, customNodeConnectionOverlay],
    }),
  );

  const unregisterVideo = registerCustomElementExtension(
    defineCustomElementExtension({
      definition: defineCustomElement<
        DevVideoData,
        Readonly<{ currentTime: number }>
      >({
        type: "dev.video",
        schemaVersion: 1,
        file: {
          accept: ["video/*"],
          async import({ file, assets, signal }) {
            if (!assets) {
              throw new Error("This custom element requires an AssetStore");
            }
            const { width, height, duration, preview } = await getVideoPreview(
              file,
              signal,
            );
            const resource = await assets.put(file, {
              customType: "dev.video",
              signal,
            });
            return {
              resource,
              preview,
              width,
              height: height + MEDIA_FOOTER_HEIGHT,
              data: {
                name: file.name,
                duration,
                devFixture: true,
                sourceWidth: width,
                sourceHeight: height,
              },
            };
          },
          async createPreview({ resource, assets, signal, file, request }) {
            const original =
              file ??
              (resource && assets
                ? await assets.resolve(resource, { signal })
                : null);
            if (!(original instanceof Blob)) {
              return null;
            }
            const requestData = request?.data;
            const currentTime =
              requestData &&
              typeof requestData === "object" &&
              "currentTime" in requestData &&
              typeof requestData.currentTime === "number"
                ? requestData.currentTime
                : 0;
            const { preview } = await getVideoPreview(
              original,
              signal,
              currentTime,
            );
            return preview;
          },
        },
        renderer: {
          id: VIDEO_RENDERER_ID,
          cache: { mode: "source", maxScale: 4 },
          viewBox: ({ element }) =>
            getMediaLayout({
              width: element.width,
              height: element.height,
              sourceWidth: element.data.sourceWidth,
              sourceHeight: element.data.sourceHeight,
            }).viewBox,
          render: ({ element, painter, theme, viewBox }) => {
            const dark = theme === THEME.DARK;
            const previewHeight = viewBox.height - MEDIA_FOOTER_HEIGHT;
            painter.rect(0, 0, viewBox.width, viewBox.height, {
              fill: dark ? "#202027" : "#ffffff",
            });
            if (element.previewFileId) {
              painter.image(
                element.previewFileId,
                0,
                0,
                viewBox.width,
                previewHeight,
                { fit: "contain" },
              );
            }
            painter.rect(0, previewHeight, viewBox.width, MEDIA_FOOTER_HEIGHT, {
              fill: dark ? "#202027" : "#ffffff",
            });
            painter.line(16, previewHeight, viewBox.width - 16, previewHeight, {
              stroke: dark ? "#35353e" : "#eeeeF3",
            });
            painter.text(
              String(element.data.name ?? "Video"),
              18,
              previewHeight + MEDIA_FOOTER_HEIGHT / 2,
              {
                color: dark ? "#f6f6f8" : "#202027",
                fontSize: MEDIA_TITLE_FONT_SIZE,
                fontWeight: 650,
                baseline: "middle",
                maxWidth: viewBox.width - 100,
              },
            );
            painter.text(
              formatDuration(element.data.duration),
              viewBox.width - 18,
              previewHeight + MEDIA_FOOTER_HEIGHT / 2,
              {
                color: dark ? "#f6f6f8" : "#202027",
                fontSize: 14,
                fontWeight: 700,
                align: "right",
                baseline: "middle",
              },
            );
          },
        },
      }),
      overlays: [...videoCustomElementOverlays, customNodeConnectionOverlay],
      lifecycle: videoCustomElementLifecycle,
    }),
  );

  const unregisterWorkflow = registerCustomElementExtension(
    defineCustomElementExtension({
      definition: defineCustomElement<DevWorkflowData>({
        type: WORKFLOW_CUSTOM_TYPE,
        schemaVersion: 1,
        renderer: {
          id: WORKFLOW_RENDERER_ID,
          cache: { mode: "fixed", scale: 2 },
          render: ({ element, painter, foregroundPainter, theme, viewBox }) => {
            const dark = theme === THEME.DARK;
            const footerHeight = 64;
            const previewHeight = viewBox.height - footerHeight;
            const workflowKind =
              element.data.workflowKind === "video" ? "video" : "image";

            painter.rect(0, 0, viewBox.width, viewBox.height, {
              radius: 18,
              fill: dark ? "#202027" : "#ffffff",
              stroke: dark ? "#3b3948" : "#ddd9ef",
              strokeWidth: 1.5,
            });
            if (element.previewFileId) {
              painter.image(
                element.previewFileId,
                0,
                0,
                viewBox.width,
                previewHeight,
                { fit: "cover", radius: 18 },
              );
            }
            painter.rect(0, previewHeight - 18, viewBox.width, 18, {
              fill: dark ? "#202027" : "#ffffff",
            });
            painter.rect(0, previewHeight, viewBox.width, footerHeight, {
              fill: dark ? "#202027" : "#ffffff",
            });
            painter.rect(18, previewHeight + 20, 8, 24, {
              radius: 4,
              fill: workflowKind === "video" ? "#ef6a86" : "#6f5bf6",
            });
            foregroundPainter.text(
              String(element.data.name ?? "Workflow 节点"),
              38,
              previewHeight + 26,
              {
                color: dark ? "#f7f6fb" : "#24212f",
                fontSize: 16,
                fontWeight: 700,
                baseline: "middle",
                maxWidth: viewBox.width - 132,
              },
            );
            foregroundPainter.text(
              workflowKind === "video" ? "VIDEO WORKFLOW" : "IMAGE WORKFLOW",
              38,
              previewHeight + 46,
              {
                color: dark ? "#aaa4b8" : "#928ca2",
                fontSize: 10,
                fontWeight: 650,
                baseline: "middle",
                maxWidth: viewBox.width - 132,
              },
            );
            painter.rect(
              viewBox.width - 80,
              previewHeight + footerHeight / 2 - 13,
              60,
              26,
              {
                radius: 8,
                fill: dark ? "#302d3d" : "#f1eff8",
              },
            );
            foregroundPainter.text(
              "READY",
              viewBox.width - 50,
              previewHeight + footerHeight / 2,
              {
                color: dark ? "#bcb5ff" : "#6955e9",
                fontSize: 10,
                fontWeight: 750,
                align: "center",
                baseline: "middle",
              },
            );
          },
        },
      }),
      overlays: [customNodeConnectionOverlay],
    }),
  );

  const unregisterStatus = registerCustomElementExtension(
    defineCustomElementExtension({
      definition: defineCustomElement({
        type: "mivo.status",
        schemaVersion: 1,
        renderer: {
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
        },
      }),
      overlays: [customNodeConnectionOverlay],
    }),
  );

  return () => {
    unregisterMedia();
    unregisterVideo();
    unregisterWorkflow();
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
  [WORKFLOW_PREVIEW_FILE_ID]: {
    id: WORKFLOW_PREVIEW_FILE_ID,
    mimeType: MIME_TYPES.svg,
    dataURL: workflowPreviewDataURL,
    created: Date.now(),
  },
};

export const createCustomElementDevElements = () => {
  const mediaCard = newCustomElement({
    x: 80,
    y: 100,
    width: 480,
    height: 270 + MEDIA_FOOTER_HEIGHT,
    customType: "dev.media",
    schemaVersion: 1,
    rendererId: MEDIA_RENDERER_ID,
    previewFileId: PREVIEW_FILE_ID,
    data: {
      name: "机器人与动力装甲 · 视频节点",
      duration: 8,
      devFixture: true,
      sourceWidth: 480,
      sourceHeight: 270,
    },
  });
  const statusCard = newCustomElement({
    x: 600,
    y: 175,
    width: 320,
    height: 150,
    customType: "mivo.status",
    schemaVersion: 1,
    rendererId: STATUS_RENDERER_ID,
    data: { devFixture: true },
  });
  return [mediaCard, statusCard];
};
