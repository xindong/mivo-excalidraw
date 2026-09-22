import {
  getCommonFrameId,
  getFrameChildrenInsertionIndex,
  isElementInViewport,
} from "@excalidraw/element";

import { arrayToMap, memoize, toBrandedType } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  ExcalidrawNonSelectionElement,
  NonDeleted,
  NonDeletedElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { renderStaticSceneThrottled } from "../renderer/staticScene";

import type { RenderableElementsMap } from "./types";

import type { AppState } from "../types";

type ViewportProjection = {
  elementsMap: RenderableElementsMap;
  visibleElements: readonly NonDeletedExcalidrawElement[];
  staticElementsMap: RenderableElementsMap;
  staticVisibleElements: readonly NonDeletedExcalidrawElement[];
  draggedElements: readonly NonDeletedExcalidrawElement[];
  selectedDragElements: readonly NonDeletedExcalidrawElement[];
  newElementCanvasElement: NonDeleted<ExcalidrawNonSelectionElement> | null;
  canvasNonce: string;
  staticCanvasNonce: string;
};

type GetRenderableElementsOpts = {
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  height: AppState["height"];
  width: AppState["width"];
  editingTextElement: AppState["editingTextElement"];
  newElement: AppState["newElement"];
  selectedElements: readonly NonDeletedExcalidrawElement[];
  selectedElementsAreBeingDragged: AppState["selectedElementsAreBeingDragged"];
  frameToHighlight: AppState["frameToHighlight"];
};

export class Renderer {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private getVisibleCanvasElements({
    elementsMap,
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
    height,
    width,
  }: {
    elementsMap: NonDeletedElementsMap;
    zoom: AppState["zoom"];
    offsetLeft: AppState["offsetLeft"];
    offsetTop: AppState["offsetTop"];
    scrollX: AppState["scrollX"];
    scrollY: AppState["scrollY"];
    height: AppState["height"];
    width: AppState["width"];
  }): readonly NonDeletedExcalidrawElement[] {
    const visibleElements: NonDeletedExcalidrawElement[] = [];
    for (const element of elementsMap.values()) {
      if (
        isElementInViewport(
          element,
          width,
          height,
          {
            zoom,
            offsetLeft,
            offsetTop,
            scrollX,
            scrollY,
          },
          elementsMap,
        )
      ) {
        visibleElements.push(element);
      }
    }
    return visibleElements;
  }

  private getRenderableElementsMap({
    elements,
    editingTextElement,
    newElement,
  }: {
    elements: readonly NonDeletedExcalidrawElement[];
    editingTextElement: AppState["editingTextElement"];
    newElement: AppState["newElement"];
  }) {
    const elementsMap = toBrandedType<RenderableElementsMap>(new Map());
    const newElementCanvasElement = newElement?.frameId ? null : newElement;

    for (const element of elements) {
      if (newElementCanvasElement?.id === element.id) {
        continue;
      }

      // we don't want to render text element that's being currently edited
      // (it's rendered on remote only)
      if (
        !editingTextElement ||
        editingTextElement.type !== "text" ||
        element.id !== editingTextElement.id
      ) {
        elementsMap.set(element.id, element);
      }
    }
    return { elementsMap, newElementCanvasElement };
  }

  private sortSelectedElementsIntoHighlightedFrame<
    T extends ExcalidrawElement,
  >({
    visibleElements,
    selectedElements,
    frameToHighlight,
  }: {
    selectedElements: readonly NonDeletedExcalidrawElement[];
    visibleElements: readonly T[];
    frameToHighlight: NonDeleted<ExcalidrawFrameLikeElement>;
  }): readonly T[] {
    if (!selectedElements.length) {
      return visibleElements;
    }

    // we assume all selected elements are eligible frame children if
    // frameToHighlight is defined
    const selectedElementsMap = arrayToMap(selectedElements);

    // thus, all deselected elements are the ones we won't reorder
    const deselectedElements = visibleElements.filter(
      (element) => !selectedElementsMap.has(element.id),
    );

    const insertionIndex = getFrameChildrenInsertionIndex(
      deselectedElements,
      frameToHighlight.id,
    );

    if (insertionIndex === null) {
      return visibleElements;
    }

    return [
      ...deselectedElements.slice(0, insertionIndex),
      ...selectedElements,
      ...deselectedElements.slice(insertionIndex),
    ] as readonly T[];
  }

  private _getRenderableElements = memoize(
    ({
      canvasNonce,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
      editingTextElement,
      newElement,
    }: Omit<
      GetRenderableElementsOpts,
      | "selectedElements"
      | "selectedElementsAreBeingDragged"
      | "frameToHighlight"
    > & {
      canvasNonce: string;
    }) => {
      const elements = this.scene.getNonDeletedElements();

      const { elementsMap, newElementCanvasElement } =
        this.getRenderableElementsMap({
          elements,
          editingTextElement,
          newElement,
        });

      const visibleElements = this.getVisibleCanvasElements({
        elementsMap,
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
      });

      return {
        elementsMap,
        visibleElements,
        newElementCanvasElement,
        canvasNonce,
      };
    },
  );

  // During a drag, Excalidraw mutates the selected element and bumps the
  // scene nonce on every pointermove. Rebuilding the viewport list then scans
  // every scene element each frame although all non-selected nodes are stable.
  // Keep the latest viewport projection for the duration of a drag; elements
  // are mutable, so the dragged node's cached reference follows its position.
  private dragViewportProjection: {
    zoom: AppState["zoom"];
    offsetLeft: number;
    offsetTop: number;
    scrollX: number;
    scrollY: number;
    height: number;
    width: number;
    editingTextElement: AppState["editingTextElement"];
    newElement: AppState["newElement"];
    frameToHighlight: AppState["frameToHighlight"];
    ret: ViewportProjection;
  } | null = null;

  public getRenderableElements = (opts: GetRenderableElementsOpts) => {
    const { newElement } = opts;
    const projection = this.dragViewportProjection;
    const canvasNonce = `${this.scene.getSceneNonce()}${
      newElement?.frameId ? `:${newElement.versionNonce}` : ""
    }`;

    if (
      opts.selectedElementsAreBeingDragged &&
      projection &&
      projection.zoom === opts.zoom &&
      projection.offsetLeft === opts.offsetLeft &&
      projection.offsetTop === opts.offsetTop &&
      projection.scrollX === opts.scrollX &&
      projection.scrollY === opts.scrollY &&
      projection.height === opts.height &&
      projection.width === opts.width &&
      projection.editingTextElement === opts.editingTextElement &&
      projection.newElement === opts.newElement &&
      projection.frameToHighlight === opts.frameToHighlight &&
      sameElementIds(projection.ret.selectedDragElements, opts.selectedElements)
    ) {
      const nextProjection = projection.ret.draggedElements.length
        ? {
            ...projection.ret,
            canvasNonce,
            selectedDragElements: opts.selectedElements,
            draggedElements: replaceSelectedDragElements(
              projection.ret.draggedElements,
              opts.selectedElements,
            ),
          }
        : this.withDragLayers(projection.ret, opts, canvasNonce);
      this.dragViewportProjection = {
        ...projection,
        ret: nextProjection,
      };
      return nextProjection;
    }

    const ret = this.withDragLayers(
      this._getRenderableElements({
        canvasNonce,

        // don't spread `opts` because we don't want to memoize on some props

        zoom: opts.zoom,
        offsetLeft: opts.offsetLeft,
        offsetTop: opts.offsetTop,
        scrollX: opts.scrollX,
        scrollY: opts.scrollY,
        height: opts.height,
        width: opts.width,
        editingTextElement: opts.editingTextElement,
        newElement: opts.newElement,
      }),
      opts,
      canvasNonce,
    );

    this.dragViewportProjection = {
      zoom: opts.zoom,
      offsetLeft: opts.offsetLeft,
      offsetTop: opts.offsetTop,
      scrollX: opts.scrollX,
      scrollY: opts.scrollY,
      height: opts.height,
      width: opts.width,
      editingTextElement: opts.editingTextElement,
      newElement: opts.newElement,
      frameToHighlight: opts.frameToHighlight,
      ret,
    };

    // if we're dragging elements over a frame, reorder the selected elements
    // inside the frame during render (we don't set the `element.frameId` until
    // pointerup else we'd have to painstainly restore the orig index if user
    // didn't end up adding elements to the frame)
    if (
      opts.frameToHighlight &&
      opts.selectedElementsAreBeingDragged &&
      // if all dragged elements are already in the frame, don't reorder
      getCommonFrameId(opts.selectedElements) !== opts.frameToHighlight.id
    ) {
      const reorderedVisibleElements =
        this.sortSelectedElementsIntoHighlightedFrame({
          visibleElements: ret.visibleElements,
          selectedElements: opts.selectedElements,
          frameToHighlight: opts.frameToHighlight,
        });

      return {
        ...ret,
        visibleElements: reorderedVisibleElements,
      };
    }

    return ret;
  };

  private withDragLayers = (
    ret: Pick<
      ViewportProjection,
      "elementsMap" | "visibleElements" | "newElementCanvasElement" | "canvasNonce"
    >,
    opts: GetRenderableElementsOpts,
    canvasNonce: string,
  ): ViewportProjection => {
    if (!opts.selectedElementsAreBeingDragged || !opts.selectedElements.length) {
      return {
        ...ret,
        staticElementsMap: ret.elementsMap,
        staticVisibleElements: ret.visibleElements,
        draggedElements: [],
        selectedDragElements: [],
        staticCanvasNonce: canvasNonce,
      };
    }

    const selectedIds = new Set(opts.selectedElements.map((element) => element.id));
    const staticVisibleElements: NonDeletedExcalidrawElement[] = [];
    const draggedConnectors: NonDeletedExcalidrawElement[] = [];

    for (const element of ret.visibleElements) {
      if (selectedIds.has(element.id)) {
        continue;
      }
      if (isBoundToAny(element, selectedIds)) {
        draggedConnectors.push(element);
        continue;
      }
      staticVisibleElements.push(element);
    }

    return {
      ...ret,
      staticElementsMap: ret.elementsMap,
      staticVisibleElements,
      draggedElements: [...draggedConnectors, ...opts.selectedElements],
      selectedDragElements: opts.selectedElements,
      staticCanvasNonce: `${canvasNonce}:drag-static:${[...selectedIds].join(",")}`,
    };
  };

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderStaticSceneThrottled.cancel();
    this._getRenderableElements.clear();
    this.dragViewportProjection = null;
  }
}

const sameElementIds = (
  left: readonly NonDeletedExcalidrawElement[],
  right: readonly NonDeletedExcalidrawElement[],
) =>
  left.length === right.length &&
  left.every((element, index) => element.id === right[index]?.id);

const isBoundToAny = (
  element: NonDeletedExcalidrawElement,
  elementIds: ReadonlySet<string>,
) => {
  if (
    "startBinding" in element &&
    element.startBinding &&
    elementIds.has(element.startBinding.elementId)
  ) {
    return true;
  }
  if (
    "endBinding" in element &&
    element.endBinding &&
    elementIds.has(element.endBinding.elementId)
  ) {
    return true;
  }
  return false;
};

const replaceSelectedDragElements = (
  draggedElements: readonly NonDeletedExcalidrawElement[],
  selectedElements: readonly NonDeletedExcalidrawElement[],
) => {
  const selectedIds = new Set(selectedElements.map((element) => element.id));
  const dynamicDependencies = draggedElements.filter(
    (element) => !selectedIds.has(element.id),
  );
  return [...dynamicDependencies, ...selectedElements];
};
