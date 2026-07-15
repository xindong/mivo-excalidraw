import { registerCustomElementOverlays } from "@excalidraw/excalidraw";

import type { CSSProperties } from "react";

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  background: "#6d4aff",
  color: "white",
  font: "600 13px Arial, sans-serif",
};

export const registerCustomElementDevOverlays = () =>
  registerCustomElementOverlays("dev.media", [
    {
      id: "player",
      kind: "surface",
      coordinateSpace: "element",
      visibility: "active",
      viewport: "keep-mounted",
      clip: true,
      bounds: ({ element }) => ({
        x: 0,
        y: 0,
        width: element.width,
        height: element.height - Math.max(54, element.height * 0.16),
      }),
      style: {
        background: "rgba(17, 17, 24, 0.92)",
      },
      render: ({ element, runtime }) => (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "white",
            font: "600 16px Arial, sans-serif",
          }}
        >
          <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
            <span>Element-space DOM Surface</span>
            <button
              style={buttonStyle}
              onClick={() => runtime.close(element.id, "player")}
            >
              关闭 Surface
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "controls",
      kind: "panel",
      coordinateSpace: "screen",
      visibility: "selected",
      placement: "bottom",
      offset: 10,
      collision: { flip: true, shift: true, padding: 12 },
      style: {
        display: "flex",
        gap: 8,
        padding: 8,
        borderRadius: 10,
        background: "white",
        boxShadow: "0 6px 24px rgba(20, 20, 40, 0.18)",
      },
      render: ({ element, runtime }) => (
        <button
          style={buttonStyle}
          onClick={() => runtime.toggle(element.id, "player")}
        >
          切换 DOM Surface
        </button>
      ),
    },
  ]);
