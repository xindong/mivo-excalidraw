import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  createCustomElementDevElements,
  customElementDevAssetStore,
  customElementDevFiles,
  registerCustomElementDevRenderers,
} from "./customElements";

registerCustomElementDevRenderers();

const CustomElementsDevApp = () => {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Excalidraw
        customElementAssets={customElementDevAssetStore}
        initialData={{
          elements: createCustomElementDevElements(),
          files: customElementDevFiles,
          appState: {
            viewBackgroundColor: "#f7f7fb",
          },
        }}
        onMount={({ excalidrawAPI }) => {
          setApi(excalidrawAPI);
          excalidrawAPI.setToast({
            message:
              "独立 Custom Element 测试页：试试缩放、旋转、复制和 SVG 导出",
          });
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
        选择图片测试完整文件生命周期
        <input
          type="file"
          accept="image/*"
          disabled={!api}
          style={{ display: "none" }}
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file || !api) {
              return;
            }
            try {
              const element = await api.insertCustomElementFromFile({
                customType: "dev.media",
                file,
              });
              api.setToast({
                message: `已导入 ${file.name}；双击卡片测试原始文件 resolve：${element.resource?.id}`,
              });
            } catch (error) {
              api.setToast({
                message:
                  error instanceof Error ? error.message : "导入 Custom Element 失败",
              });
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
