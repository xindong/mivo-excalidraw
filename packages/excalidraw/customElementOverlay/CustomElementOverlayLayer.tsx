import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { isCustomElement } from "@excalidraw/element";

import type {
  CustomElementAssetStore,
  TypedExcalidrawCustomElement,
} from "@excalidraw/element";
import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import {
  getCustomElementOverlayCoordinateSpace,
  getElementSpaceOverlayStyle,
  getScreenSpaceOverlayStyle,
} from "./geometry";
import {
  getCustomElementOverlayRevision,
  getCustomElementOverlays,
  subscribeCustomElementOverlays,
} from "./registry";

import type { CustomElementOverlayRuntime } from "./runtime";
import type {
  CustomElementOverlayDefinition,
  CustomElementOverlayRenderContext,
  CustomElementOverlayVisibility,
  CustomElementOverlayVisibilityContext,
} from "./types";
import type { AppState, ExcalidrawImperativeAPI } from "../types";

import "./CustomElementOverlayLayer.scss";

type OverlaySize = Readonly<{ width: number; height: number }>;

export const CUSTOM_ELEMENT_OVERLAY_ITEM_CLASS = "custom-element-overlay__item";

const useExternalRevision = (
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => number,
) => {
  const [revision, setRevision] = useState(getSnapshot);
  useEffect(() => {
    const update = () => setRevision(getSnapshot());
    const unsubscribe = subscribe(update);
    update();
    return unsubscribe;
  }, [getSnapshot, subscribe]);
  return revision;
};

const useOverlaySizes = () => {
  const [sizes, setSizes] = useState<ReadonlyMap<string, OverlaySize>>(
    () => new Map(),
  );
  const nodes = useRef(new Map<string, HTMLElement>());
  const keys = useRef(new WeakMap<HTMLElement, string>());
  const observer = useRef<ResizeObserver | null>(null);
  const pendingSizes = useRef(new Map<string, OverlaySize>());
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    if (!pendingSizes.current.size) {
      return;
    }
    setSizes((previous) => {
      const next = new Map(previous);
      pendingSizes.current.forEach((size, key) => next.set(key, size));
      pendingSizes.current.clear();
      return next;
    });
  }, []);

  const queueSize = useCallback(
    (key: string, size: OverlaySize) => {
      pendingSizes.current.set(key, size);
      if (frame.current === null) {
        frame.current = window.requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      nodes.current.forEach((node, key) => {
        const rect = node.getBoundingClientRect();
        queueSize(key, { width: rect.width, height: rect.height });
      });
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement;
        const key = keys.current.get(node);
        if (!key) {
          continue;
        }
        queueSize(key, {
          width:
            entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width,
          height:
            entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
        });
      }
    });
    observer.current = resizeObserver;
    nodes.current.forEach((node) => resizeObserver.observe(node));
    return () => {
      resizeObserver.disconnect();
      observer.current = null;
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
      }
    };
  }, [queueSize]);

  const registerNode = useCallback(
    (key: string, node: HTMLElement | null) => {
      const previous = nodes.current.get(key);
      if (previous && previous !== node) {
        observer.current?.unobserve(previous);
        keys.current.delete(previous);
        nodes.current.delete(key);
      }
      if (!node) {
        setSizes((previousSizes) => {
          if (!previousSizes.has(key)) {
            return previousSizes;
          }
          const next = new Map(previousSizes);
          next.delete(key);
          return next;
        });
        return;
      }
      if (previous === node) {
        return;
      }
      nodes.current.set(key, node);
      keys.current.set(node, key);
      observer.current?.observe(node);
      if (!observer.current) {
        const rect = node.getBoundingClientRect();
        queueSize(key, { width: rect.width, height: rect.height });
      }
    },
    [queueSize],
  );

  return { sizes, registerNode };
};

const getDefaultVisibility = (
  overlay: CustomElementOverlayDefinition<any, any>,
): CustomElementOverlayVisibility<any, any> =>
  overlay.kind === "panel" ? "selected" : "active";

const isOverlayVisible = (
  visibility: CustomElementOverlayVisibility<any, any>,
  context: CustomElementOverlayVisibilityContext<any, any>,
) => {
  if (typeof visibility === "function") {
    try {
      return visibility(context);
    } catch (error) {
      console.error("Custom element overlay visibility failed", error);
      return false;
    }
  }
  switch (visibility) {
    case "always":
      return true;
    case "selected":
      return context.isSelected;
    case "hovered":
      return context.isHovered;
    case "active":
      return context.isActive;
    case "never":
      return false;
  }
};

class OverlayErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    overlayKey: string;
    resetToken: CustomElementOverlayDefinition<any, any>;
  },
  { failed: boolean }
> {
  public state = { failed: false };

  public static getDerivedStateFromError() {
    return { failed: true };
  }

  public componentDidCatch(error: unknown) {
    console.error(
      `Custom element overlay \"${this.props.overlayKey}\" failed`,
      error,
    );
  }

  public componentDidUpdate(
    previous: Readonly<{
      overlayKey: string;
      resetToken: CustomElementOverlayDefinition<any, any>;
    }>,
  ) {
    if (
      (previous.overlayKey !== this.props.overlayKey ||
        previous.resetToken !== this.props.resetToken) &&
      this.state.failed
    ) {
      this.setState({ failed: false });
    }
  }

  public render() {
    return this.state.failed ? null : this.props.children;
  }
}

const OverlayContent = ({
  overlay,
  context,
}: {
  overlay: CustomElementOverlayDefinition<any, any>;
  context: CustomElementOverlayRenderContext<any, any>;
}) => overlay.render(context);

const OverlayItem = ({
  overlayKey,
  overlay,
  context,
  size,
  registerNode,
}: {
  overlayKey: string;
  overlay: CustomElementOverlayDefinition<any, any>;
  context: CustomElementOverlayRenderContext<any, any>;
  size: OverlaySize | undefined;
  registerNode: (key: string, node: HTMLElement | null) => void;
}) => {
  const coordinateSpace = getCustomElementOverlayCoordinateSpace(overlay);
  const latestContext = useRef(context);
  latestContext.current = context;

  useEffect(() => {
    try {
      overlay.onMount?.(latestContext.current);
    } catch (error) {
      console.error(
        `Custom element overlay \"${overlayKey}\" mount failed`,
        error,
      );
    }
    return () => {
      try {
        overlay.onUnmount?.(latestContext.current);
      } catch (error) {
        console.error(
          `Custom element overlay \"${overlayKey}\" unmount failed`,
          error,
        );
      }
    };
  }, [overlay, overlayKey]);

  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (coordinateSpace === "screen") {
        registerNode(overlayKey, node);
      }
    },
    [coordinateSpace, overlayKey, registerNode],
  );

  let positionStyle: React.CSSProperties;
  try {
    const bounds =
      coordinateSpace === "element"
        ? overlay.bounds?.(context) ?? {
            x: 0,
            y: 0,
            width: context.element.width,
            height: context.element.height,
          }
        : null;
    positionStyle = bounds
      ? getElementSpaceOverlayStyle(context, bounds)
      : getScreenSpaceOverlayStyle(
          context,
          overlay,
          size ?? { width: 0, height: 0 },
        );
  } catch (error) {
    console.error(
      `Custom element overlay \"${overlayKey}\" layout failed`,
      error,
    );
    return null;
  }
  const waitingForMeasurement = coordinateSpace === "screen" && !size;

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={setNode}
      className={`${CUSTOM_ELEMENT_OVERLAY_ITEM_CLASS} ${
        overlay.className ?? ""
      }`}
      data-custom-element-overlay={overlay.id}
      data-custom-element-id={context.element.id}
      style={{
        ...overlay.style,
        ...positionStyle,
        boxSizing: "border-box",
        overflow: overlay.clip ? "hidden" : overlay.style?.overflow,
        opacity:
          coordinateSpace === "element" &&
          overlay.inheritElementOpacity !== false &&
          overlay.style?.opacity === undefined
            ? context.element.opacity / 100
            : overlay.style?.opacity,
        pointerEvents: overlay.pointerEvents ?? "auto",
        visibility: waitingForMeasurement ? "hidden" : undefined,
        display: context.isInViewport ? overlay.style?.display : "none",
      }}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onContextMenu={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <OverlayErrorBoundary overlayKey={overlayKey} resetToken={overlay}>
        <OverlayContent overlay={overlay} context={context} />
      </OverlayErrorBoundary>
    </div>
  );
};

export const CustomElementOverlayLayer = ({
  elements,
  elementsMap,
  visibleElements,
  appState,
  api,
  assets,
  runtime,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  elementsMap: NonDeletedSceneElementsMap;
  visibleElements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  runtime: CustomElementOverlayRuntime;
}) => {
  const registryRevision = useExternalRevision(
    subscribeCustomElementOverlays,
    getCustomElementOverlayRevision,
  );
  const runtimeRevision = useExternalRevision(
    runtime.subscribe,
    runtime.getSnapshot,
  );
  const { sizes, registerNode } = useOverlaySizes();
  const initializedOverlays = useRef(new Set<string>());
  const visibleElementIds = useMemo(
    () => new Set(visibleElements.map((element) => element.id)),
    [visibleElements],
  );

  useEffect(() => {
    const elementIds = new Set(elements.map((element) => element.id));
    runtime.prune(elementIds);
    for (const key of initializedOverlays.current) {
      const separator = key.indexOf("\u0000");
      if (!elementIds.has(key.slice(0, separator))) {
        initializedOverlays.current.delete(key);
      }
    }
  }, [elements, runtime]);

  useEffect(() => {
    const isRegisteredOverlay = (elementId: string, overlayId: string) => {
      const element = elementsMap.get(elementId);
      return (
        !!element &&
        isCustomElement(element) &&
        getCustomElementOverlays(element.customType).some(
          (overlay) => overlay.id === overlayId,
        )
      );
    };
    runtime.pruneOverlays(isRegisteredOverlay);
    for (const key of initializedOverlays.current) {
      const separator = key.indexOf("\u0000");
      if (
        !isRegisteredOverlay(key.slice(0, separator), key.slice(separator + 1))
      ) {
        initializedOverlays.current.delete(key);
      }
    }
  }, [elementsMap, registryRevision, runtime]);

  const items = useMemo(() => {
    const next: Array<{
      key: string;
      overlay: CustomElementOverlayDefinition<any, any>;
      context: CustomElementOverlayRenderContext<any, any>;
    }> = [];
    const candidateElements = [...visibleElements];
    const candidateIds = new Set(visibleElements.map((element) => element.id));
    for (const key of initializedOverlays.current) {
      const separator = key.indexOf("\u0000");
      const elementId = key.slice(0, separator);
      if (!candidateIds.has(elementId)) {
        const element = elementsMap.get(elementId);
        if (element) {
          candidateElements.push(element);
          candidateIds.add(elementId);
        }
      }
    }

    for (const element of candidateElements) {
      if (!isCustomElement(element)) {
        continue;
      }
      const overlays = getCustomElementOverlays(element.customType);
      for (const overlay of overlays) {
        const key = `${element.id}\u0000${overlay.id}`;
        const isInViewport = visibleElementIds.has(element.id);
        if (
          !isInViewport &&
          (overlay.viewport !== "keep-mounted" ||
            !initializedOverlays.current.has(key))
        ) {
          continue;
        }
        const state = runtime.getState(element.id, overlay.id);
        const visibilityContext: CustomElementOverlayVisibilityContext<
          any,
          any
        > = {
          element: element as TypedExcalidrawCustomElement<any>,
          appState,
          api,
          assets,
          runtime,
          state,
          isSelected: !!appState.selectedElementIds[element.id],
          isHovered: !!appState.hoveredElementIds[element.id],
          isActive: runtime.isOpen(element.id, overlay.id),
          isInViewport,
        };
        const visible = isOverlayVisible(
          overlay.visibility ?? getDefaultVisibility(overlay),
          visibilityContext,
        );
        if (!visible) {
          continue;
        }
        if (isInViewport && overlay.viewport === "keep-mounted") {
          initializedOverlays.current.add(key);
        }
        const context: CustomElementOverlayRenderContext<any, any> = {
          ...visibilityContext,
          overlayId: overlay.id,
          coordinateSpace: getCustomElementOverlayCoordinateSpace(overlay),
          open: (nextState) => runtime.open(element.id, overlay.id, nextState),
          close: () => runtime.close(element.id, overlay.id),
          toggle: (nextState) =>
            runtime.toggle(element.id, overlay.id, nextState),
          setState: (updater) =>
            runtime.setState(element.id, overlay.id, updater),
        };
        next.push({
          key,
          overlay,
          context,
        });
      }
    }
    return next;
  }, [
    api,
    appState,
    assets,
    registryRevision,
    runtime,
    runtimeRevision,
    elementsMap,
    visibleElements,
    visibleElementIds,
  ]);

  if (!items.length) {
    return null;
  }

  return (
    <div
      className="custom-element-overlay"
      aria-label="Custom element overlays"
    >
      {(["surface", "panel", "popover"] as const).map((kind) => (
        <div
          className={`custom-element-overlay__layer custom-element-overlay__layer--${kind}`}
          key={kind}
        >
          {items
            .filter((item) => item.overlay.kind === kind)
            .map((item) => (
              <OverlayItem
                key={item.key}
                overlayKey={item.key}
                overlay={item.overlay}
                context={item.context}
                size={sizes.get(item.key)}
                registerNode={registerNode}
              />
            ))}
        </div>
      ))}
    </div>
  );
};
