import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Excalidraw } from "@excalidraw/excalidraw";

import {
  createCustomElementDevElements,
  customElementDevFiles,
  registerCustomElementDevRenderers,
} from "./customElements";

registerCustomElementDevRenderers();

const CustomElementsDevApp = () => (
  <div style={{ width: "100vw", height: "100vh" }}>
    <Excalidraw
      initialData={{
        elements: createCustomElementDevElements(),
        files: customElementDevFiles,
        appState: {
          viewBackgroundColor: "#f7f7fb",
        },
      }}
      onMount={({ excalidrawAPI }) => {
        excalidrawAPI.setToast({
          message:
            "独立 Custom Element 测试页：试试缩放、旋转、复制和 SVG 导出",
        });
      }}
    />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomElementsDevApp />
  </StrictMode>,
);
