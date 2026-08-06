import {
  applyDarkModeFilter,
  COLOR_WHITE,
  FRAME_STYLE,
  THEME,
  throttleRAF,
} from "@excalidraw/common";
import { isElementLink } from "@excalidraw/element";
import { createPlaceholderEmbeddableLabel } from "@excalidraw/element";
import { getBoundTextElement } from "@excalidraw/element";
import {
  isEmbeddableElement,
  isIframeLikeElement,
  isTextElement,
} from "@excalidraw/element";
import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import { renderElement } from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";
import { forEachElementInManagedConnectorRenderOrder } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState, Zoom } from "../types";

const GridLineColor = {
  [THEME.LIGHT]: {
    bold: "#dddddd",
    regular: "#e5e5e5",
  },
  [THEME.DARK]: {
    bold: applyDarkModeFilter("#dddddd"),
    regular: applyDarkModeFilter("#e5e5e5"),
  },
} as const;

type StaticViewportSnapshotState = {
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  snapshotKey: string;
  zoom: number;
  scrollX: number;
  scrollY: number;
  theme: StaticCanvasAppState["theme"];
  viewBackgroundColor: StaticCanvasAppState["viewBackgroundColor"];
  gridSize: StaticCanvasAppState["gridSize"];
  gridStep: StaticCanvasAppState["gridStep"];
  renderGrid: boolean;
};

type StaticViewportSnapshotCache = {
  lastFullRender: StaticViewportSnapshotState | null;
  snapshot: {
    canvas: HTMLCanvasElement;
    state: StaticViewportSnapshotState;
  } | null;
};

const staticViewportSnapshots = new WeakMap<
  HTMLCanvasElement,
  StaticViewportSnapshotCache
>();

const getStaticViewportSnapshotState = ({
  canvas,
  scale,
  viewportSnapshotKey,
  appState,
  renderConfig,
}: StaticSceneRenderConfig): StaticViewportSnapshotState | null => {
  if (!viewportSnapshotKey || renderConfig.isExporting) {
    return null;
  }
  return {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    scale,
    snapshotKey: viewportSnapshotKey,
    zoom: appState.zoom.value,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    theme: appState.theme,
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    renderGrid: renderConfig.renderGrid,
  };
};

const isCompatibleStaticViewportSnapshot = (
  previous: StaticViewportSnapshotState,
  next: StaticViewportSnapshotState,
) =>
  previous.canvasWidth === next.canvasWidth &&
  previous.canvasHeight === next.canvasHeight &&
  previous.scale === next.scale &&
  previous.snapshotKey === next.snapshotKey &&
  previous.theme === next.theme &&
  previous.viewBackgroundColor === next.viewBackgroundColor &&
  previous.gridSize === next.gridSize &&
  previous.gridStep === next.gridStep &&
  previous.renderGrid === next.renderGrid;

export const getStaticViewportSnapshotTransform = (
  previous: Pick<StaticViewportSnapshotState, "zoom" | "scrollX" | "scrollY">,
  next: Pick<StaticViewportSnapshotState, "zoom" | "scrollX" | "scrollY">,
) => ({
  scale: next.zoom / previous.zoom,
  translateX: next.zoom * (next.scrollX - previous.scrollX),
  translateY: next.zoom * (next.scrollY - previous.scrollY),
});

const renderStaticViewportSnapshot = (
  config: StaticSceneRenderConfig,
  normalizedWidth: number,
  normalizedHeight: number,
  nextState: StaticViewportSnapshotState,
) => {
  if (!config.appState.shouldCacheIgnoreZoom) {
    return false;
  }

  const cache = staticViewportSnapshots.get(config.canvas);
  if (
    !cache?.lastFullRender ||
    !isCompatibleStaticViewportSnapshot(cache.lastFullRender, nextState)
  ) {
    return false;
  }

  let snapshot = cache.snapshot;
  if (
    !snapshot ||
    !isCompatibleStaticViewportSnapshot(snapshot.state, nextState)
  ) {
    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = config.canvas.width;
    snapshotCanvas.height = config.canvas.height;
    snapshotCanvas.getContext("2d")?.drawImage(config.canvas, 0, 0);
    snapshot = {
      canvas: snapshotCanvas,
      state: cache.lastFullRender,
    };
    cache.snapshot = snapshot;
  }

  const context = bootstrapCanvas({
    canvas: config.canvas,
    scale: config.scale,
    normalizedWidth,
    normalizedHeight,
    theme: config.appState.theme,
    isExporting: config.renderConfig.isExporting,
    viewBackgroundColor: config.appState.viewBackgroundColor,
  });
  const transform = getStaticViewportSnapshotTransform(
    snapshot.state,
    nextState,
  );
  context.drawImage(
    snapshot.canvas,
    transform.translateX,
    transform.translateY,
    normalizedWidth * transform.scale,
    normalizedHeight * transform.scale,
  );
  return true;
};

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
) => {
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;

  const spaceWidth = 1 / zoom.value;

  context.save();

  // Offset rendering by 0.5 to ensure that 1px wide lines are crisp.
  // We only do this when zoomed to 100% because otherwise the offset is
  // fractional, and also visibly offsets the elements.
  // We also do this per-axis, as each axis may already be offset by 0.5.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // vertical lines
  for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(x - scrollX) % (gridStep * gridSize) === 0;
    // don't render regular lines when zoomed out and they're barely visible
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    context.moveTo(x, offsetY - gridSize);
    context.lineTo(x, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(y - scrollY) % (gridStep * gridSize) === 0;
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
    context.stroke();
  }
  context.restore();
};

export const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  if (element.link && !appState.selectedElementIds[element.id]) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [x1, y1, x2, y2],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );

      // Seed a sane default so a corrupted color (silently rejected by the
      // canvas) falls back to white instead of a stale fillStyle.
      linkCanvasCacheContext.fillStyle = COLOR_WHITE;
      linkCanvasCacheContext.fillStyle =
        appState.viewBackgroundColor || COLOR_WHITE;

      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.globalAlpha = element.opacity / 100;
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};
const _renderStaticScene = (config: StaticSceneRenderConfig) => {
  const {
    canvas,
    rc,
    elementsMap,
    allElementsMap,
    visibleElements,
    scale,
    appState,
    renderConfig,
  } = config;
  if (canvas === null) {
    return;
  }

  const { renderGrid = true, isExporting } = renderConfig;

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );
  const viewportSnapshotState = getStaticViewportSnapshotState(config);
  if (
    viewportSnapshotState &&
    renderStaticViewportSnapshot(
      config,
      normalizedWidth,
      normalizedHeight,
      viewportSnapshotState,
    )
  ) {
    return;
  }

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
    );
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  // Paint visible elements
  forEachElementInManagedConnectorRenderOrder(visibleElements, (element) => {
    if (isIframeLikeElement(element)) {
      return;
    }
    try {
      const frameId = element.frameId || appState.frameToHighlight?.id;

      if (
        isTextElement(element) &&
        element.containerId &&
        elementsMap.has(element.containerId)
      ) {
        // will be rendered with the container
        return;
      }

      context.save();

      if (
        frameId &&
        appState.frameRendering.enabled &&
        appState.frameRendering.clip
      ) {
        const frame = getTargetFrame(element, elementsMap, appState);
        if (
          frame &&
          shouldApplyFrameClip(
            element,
            frame,
            appState,
            elementsMap,
            inFrameGroupsMap,
          )
        ) {
          frameClip(frame, context, renderConfig, appState);
        }
        renderElement(
          element,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
        );
      } else {
        renderElement(
          element,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
        );
      }

      const boundTextElement = getBoundTextElement(element, elementsMap);
      if (boundTextElement) {
        renderElement(
          boundTextElement,
          elementsMap,
          allElementsMap,
          rc,
          context,
          renderConfig,
          appState,
        );
      }

      context.restore();

      if (!isExporting && renderConfig.renderLinks !== false) {
        renderLinkIcon(element, context, appState, elementsMap);
      }
    } catch (error: any) {
      console.error(
        error,
        element.id,
        element.x,
        element.y,
        element.width,
        element.height,
      );
    }
  });

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const render = () => {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );

          if (
            isIframeLikeElement(element) &&
            (isExporting ||
              (isEmbeddableElement(element) &&
                renderConfig.embedsValidationStatus.get(element.id) !==
                  true)) &&
            element.width &&
            element.height
          ) {
            const label = createPlaceholderEmbeddableLabel(element);
            renderElement(
              label,
              elementsMap,
              allElementsMap,
              rc,
              context,
              renderConfig,
              appState,
            );
          }
          if (!isExporting && renderConfig.renderLinks !== false) {
            renderLinkIcon(element, context, appState, elementsMap);
          }
        };
        // - when exporting the whole canvas, we DO NOT apply clipping
        // - when we are exporting a particular frame, apply clipping
        //   if the containing frame is not selected, apply clipping
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          context.save();

          const frame = getTargetFrame(element, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          render();
          context.restore();
        } else {
          render();
        }
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });

  if (viewportSnapshotState) {
    staticViewportSnapshots.set(canvas, {
      lastFullRender: viewportSnapshotState,
      snapshot: null,
    });
  } else {
    staticViewportSnapshots.delete(canvas);
  }
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    _renderStaticScene(config);
  },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  _renderStaticScene(renderConfig);
};
