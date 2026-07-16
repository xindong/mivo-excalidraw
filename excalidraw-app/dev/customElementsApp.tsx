import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { Excalidraw } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  customElementDevAssetStore,
  registerCustomElementDevRenderers,
} from "./customElements";

registerCustomElementDevRenderers();

const CustomElementsDevApp = () => {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Excalidraw
        ui={false}
        zoomSensitivity={0.2}
        capabilities={{
          transforms: { rotation: false },
          doubleClick: {
            default: false,
            elementTypes: { custom: true },
          },
        }}
        customElementAssets={customElementDevAssetStore}
        initialData={{
          elements: [],
          appState: {
            viewBackgroundColor: "#f7f7fb",
            scrollConstraints: {
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              lockScroll: false,
              lockZoom: true,
              zoom: 0.02,
              overscroll: 0,
            },
          },
        }}
        onMount={({ excalidrawAPI }) => {
          setApi(excalidrawAPI);
        }}
      />
      <label
        style={{
          position: "absolute",
          zIndex: 20,
          top: 16,
          left: 16,
          padding: "10px 14px",
          borderRadius: 10,
          background: "#6d4aff",
          color: "white",
          font: "600 14px Arial, sans-serif",
          cursor: api ? "pointer" : "wait",
          boxShadow: "0 5px 18px #0002",
        }}
      >
        导入图片 / 视频
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={!api}
          style={{ display: "none" }}
          onChange={async (event) => {
            const input = event.currentTarget;
            const files = Array.from(input.files ?? []);
            if (!files.length || !api) {
              return;
            }
            try {
              const imageFiles = files.filter((file) =>
                file.type.startsWith("image/"),
              );
              const videoFiles = files.filter((file) =>
                file.type.startsWith("video/"),
              );
              if (imageFiles.length + videoFiles.length !== files.length) {
                throw new Error("只能导入图片或视频文件");
              }
              const groups = [
                { customType: "dev.media", files: imageFiles, row: "top" },
                { customType: "dev.video", files: videoFiles, row: "bottom" },
              ].filter((group) => group.files.length);
              const useRows = groups.length > 1;
              const insertedElements: Array<
                Awaited<
                  ReturnType<
                    ExcalidrawImperativeAPI["insertCustomElementsFromFiles"]
                  >
                >[number]
              > = [];
              for (const group of groups) {
                const elements = await api.insertCustomElementsFromFiles({
                  customType: group.customType,
                  files: group.files,
                  select: false,
                  layout: useRows
                    ? (items, { viewport }) => {
                        const gap = 24;
                        const totalWidth =
                          items.reduce((sum, item) => sum + item.width, 0) +
                          Math.max(0, items.length - 1) * gap;
                        let x = viewport.x + (viewport.width - totalWidth) / 2;
                        return items.map((item) => {
                          const position = {
                            x,
                            y:
                              group.row === "top"
                                ? viewport.y +
                                  viewport.height / 2 -
                                  gap -
                                  item.height
                                : viewport.y + viewport.height / 2 + gap,
                          };
                          x += item.width + gap;
                          return position;
                        });
                      }
                    : undefined,
                });
                for (const [index, element] of elements.entries()) {
                  if (!element.resource) {
                    throw new Error(
                      `“${group.files[index].name}”导入成功，但没有生成原始文件资源引用`,
                    );
                  }
                }
                insertedElements.push(...elements);
              }
              api.updateScene({
                appState: {
                  selectedElementIds: Object.fromEntries(
                    insertedElements.map((element) => [element.id, true]),
                  ),
                },
              });
            } catch (error) {
              window.alert(
                error instanceof Error
                  ? error.message
                  : "导入 Custom Element 失败",
              );
            } finally {
              input.value = "";
            }
          }}
        />
      </label>
    </div>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomElementsDevApp />
  </StrictMode>,
);
