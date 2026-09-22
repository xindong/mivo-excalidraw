import { useEffect, useRef } from "react";

import { renderElement } from "@excalidraw/element";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "../../renderer/helpers";

import type { DragElementsSceneRenderConfig } from "../../scene/types";

const renderDragElements = (config: DragElementsSceneRenderConfig) => {
  if (!config.canvas) {
    return;
  }
  const [width, height] = getNormalizedCanvasDimensions(config.canvas, config.scale);
  const context = bootstrapCanvas({
    canvas: config.canvas,
    scale: config.scale,
    normalizedWidth: width,
    normalizedHeight: height,
  });
  context.scale(config.appState.zoom.value, config.appState.zoom.value);

  for (const element of config.draggedElements) {
    renderElement(
      element,
      config.elementsMap,
      config.allElementsMap,
      config.rc,
      context,
      config.renderConfig,
      config.appState,
    );
  }
};

const DragElementsCanvas = (props: DragElementsSceneRenderConfig) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    renderDragElements({ ...props, canvas: canvasRef.current });
  });

  return (
    <canvas
      className="excalidraw__canvas drag-elements"
      style={{ width: props.appState.width, height: props.appState.height }}
      width={props.appState.width * props.scale}
      height={props.appState.height * props.scale}
      ref={canvasRef}
    />
  );
};

export default DragElementsCanvas;
