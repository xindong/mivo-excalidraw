import React, { useEffect, useRef } from "react";

import { isShallowEqual } from "@excalidraw/common";

import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { isRenderThrottlingEnabled } from "../../reactUtils";
import { renderStaticScene } from "../../renderer/staticScene";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../../scene/types";
import type { AppState, StaticCanvasAppState } from "../../types";
import type { RoughCanvas } from "roughjs/bin/canvas";

type StaticCanvasProps = {
  canvas: HTMLCanvasElement;
  rc: RoughCanvas;
  staticElementsMap: RenderableElementsMap;
  allElementsMap: NonDeletedSceneElementsMap;
  staticVisibleElements: readonly NonDeletedExcalidrawElement[];
  staticCanvasNonce: string;
  selectionNonce: number | undefined;
  viewportSnapshotEnabled: boolean;
  scale: number;
  appState: StaticCanvasAppState;
  renderConfig: StaticCanvasRenderConfig;
};

const StaticCanvas = (props: StaticCanvasProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isComponentMounted = useRef(false);

  useEffect(() => {
    props.canvas.style.width = `${props.appState.width}px`;
    props.canvas.style.height = `${props.appState.height}px`;
    props.canvas.width = props.appState.width * props.scale;
    props.canvas.height = props.appState.height * props.scale;
  }, [props.appState.height, props.appState.width, props.canvas, props.scale]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const canvas = props.canvas;

    if (!isComponentMounted.current) {
      isComponentMounted.current = true;

      wrapper.replaceChildren(canvas);
      canvas.classList.add("excalidraw__canvas", "static");
    }

    const selectedElementKey = Object.keys(props.appState.selectedElementIds)
      .filter((id) => props.appState.selectedElementIds[id])
      .join(",");
    renderStaticScene(
      {
        canvas,
        rc: props.rc,
        scale: props.scale,
        elementsMap: props.staticElementsMap,
        allElementsMap: props.allElementsMap,
        visibleElements: props.staticVisibleElements,
        viewportSnapshotKey: props.viewportSnapshotEnabled
          ? `${props.staticCanvasNonce}:${props.selectionNonce ?? ""}:${
              props.appState.frameToHighlight?.id ?? ""
            }:${selectedElementKey}`
          : undefined,
        appState: props.appState,
        renderConfig: props.renderConfig,
      },
      isRenderThrottlingEnabled(),
    );
  });

  return <div className="excalidraw__canvas-wrapper" ref={wrapperRef} />;
};

const EMPTY_HOVERED_ELEMENT_IDS: AppState["hoveredElementIds"] = {};

const getRelevantAppStateProps = (appState: AppState): StaticCanvasAppState => {
  const relevantAppStateProps = {
    zoom: appState.zoom,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    width: appState.width,
    height: appState.height,
    viewModeEnabled: appState.viewModeEnabled,
    openDialog: appState.openDialog,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    theme: appState.theme,
    shouldCacheIgnoreZoom: appState.shouldCacheIgnoreZoom,
    viewBackgroundColor: appState.viewBackgroundColor,
    exportScale: appState.exportScale,
    selectedElementsAreBeingDragged: appState.selectedElementsAreBeingDragged,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    frameRendering: appState.frameRendering,
    selectedElementIds: appState.selectedElementIds,
    frameToHighlight: appState.frameToHighlight,
    editingGroupId: appState.editingGroupId,
    currentHoveredFontFamily: appState.currentHoveredFontFamily,
    hoveredElementIds:
      appState.openDialog?.name === "elementLinkSelector"
        ? appState.hoveredElementIds
        : EMPTY_HOVERED_ELEMENT_IDS,
    croppingElementId: appState.croppingElementId,
    suggestedBinding: appState.suggestedBinding,
  };

  return relevantAppStateProps;
};

const areEqual = (
  prevProps: StaticCanvasProps,
  nextProps: StaticCanvasProps,
) => {
  if (
    prevProps.staticCanvasNonce !== nextProps.staticCanvasNonce ||
    prevProps.viewportSnapshotEnabled !== nextProps.viewportSnapshotEnabled ||
    prevProps.scale !== nextProps.scale ||
    prevProps.staticElementsMap !== nextProps.staticElementsMap ||
    prevProps.staticVisibleElements !== nextProps.staticVisibleElements
  ) {
    return false;
  }

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the StaticCanvas-relevant props
      getRelevantAppStateProps(prevProps.appState as AppState),
      getRelevantAppStateProps(nextProps.appState as AppState),
    ) && isShallowEqual(prevProps.renderConfig, nextProps.renderConfig)
  );
};

export default React.memo(StaticCanvas, areEqual);
