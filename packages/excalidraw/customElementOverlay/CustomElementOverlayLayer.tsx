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
  CustomElementOverlayPresence,
  CustomElementOverlayRenderContext,
  CustomElementOverlayVisibility,
  CustomElementOverlayVisibilityContext,
} from "./types";
import type { AppState, ExcalidrawImperativeAPI } from "../types";

import "./CustomElementOverlayLayer.scss";

type OverlaySize = Readonly<{ width: number; height: number }>;

type DesiredOverlayItem = Readonly<{
  key: string;
  overlay: CustomElementOverlayDefinition<any, any>;
  context: CustomElementOverlayRenderContext<any, any>;
}>;

type PresentOverlayItem = DesiredOverlayItem &
  Readonly<{
    presence: CustomElementOverlayPresence;
    transitionMs: number;
  }>;

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

  const queueSize = useCallback((key: string, size: OverlaySize) => {
    setSizes((previous) => {
      const current = previous.get(key);
      if (
        current &&
        current.width === size.width &&
        current.height === size.height
      ) {
        return previous;
      }
      const next = new Map(previous);
      next.set(key, size);
      return next;
    });
  }, []);

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
    nodes.current.forEach((node, key) => {
      resizeObserver.observe(node);
      const rect = node.getBoundingClientRect();
      queueSize(key, { width: rect.width, height: rect.height });
    });
    return () => {
      resizeObserver.disconnect();
      observer.current = null;
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
      nodes.current.set(key, node);
      keys.current.set(node, key);
      observer.current?.observe(node);
      const rect = node.getBoundingClientRect();
      queueSize(key, { width: rect.width, height: rect.height });
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
      `Custom element overlay "${this.props.overlayKey}" failed`,
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
  transitionMs,
}: {
  overlayKey: string;
  overlay: CustomElementOverlayDefinition<any, any>;
  context: CustomElementOverlayRenderContext<any, any>;
  size: OverlaySize | undefined;
  registerNode: (key: string, node: HTMLElement | null) => void;
  transitionMs: number;
}) => {
  const coordinateSpace = getCustomElementOverlayCoordinateSpace(overlay);
  const latestContext = useRef(context);
  const lifecycleGeneration = useRef(0);
  const lifecycleMounted = useRef(false);
  const mountedOverlay = useRef(overlay);
  latestContext.current = context;

  useEffect(() => {
    const generation = ++lifecycleGeneration.current;
    if (lifecycleMounted.current && mountedOverlay.current !== overlay) {
      try {
        mountedOverlay.current.onUnmount?.(latestContext.current);
      } catch (error) {
        console.error(
          `Custom element overlay "${overlayKey}" unmount failed`,
          error,
        );
      }
      lifecycleMounted.current = false;
    }
    if (!lifecycleMounted.current) {
      lifecycleMounted.current = true;
      mountedOverlay.current = overlay;
      try {
        overlay.onMount?.(latestContext.current);
      } catch (error) {
        console.error(
          `Custom element overlay "${overlayKey}" mount failed`,
          error,
        );
      }
    }
    return () => {
      void Promise.resolve().then(() => {
        if (
          lifecycleGeneration.current !== generation ||
          mountedOverlay.current !== overlay
        ) {
          return;
        }
        lifecycleMounted.current = false;
        try {
          overlay.onUnmount?.(latestContext.current);
        } catch (error) {
          console.error(
            `Custom element overlay "${overlayKey}" unmount failed`,
            error,
          );
        }
      });
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
      `Custom element overlay "${overlayKey}" layout failed`,
      error,
    );
    return null;
  }

  const waitingForMeasurement = coordinateSpace === "screen" && !size;
  const pointerTarget =
    overlay.interaction?.pointer ??
    (overlay.kind === "surface" ? "canvas" : "overlay");
  const wheelTarget = overlay.interaction?.wheel ?? "canvas";
  const configuredOpacity = Number(overlay.style?.opacity);
  const baseOpacity = Number.isFinite(configuredOpacity)
    ? configuredOpacity
    : coordinateSpace === "element" && overlay.inheritElementOpacity !== false
    ? context.element.opacity / 100
    : 1;
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
      data-custom-element-wheel={wheelTarget}
      data-presence={context.presence}
      style={{
        ...overlay.style,
        ...positionStyle,
        boxSizing: "border-box",
        overflow: overlay.clip ? "hidden" : overlay.style?.overflow,
        opacity: baseOpacity * (context.presence === "present" ? 1 : 0),
        transition:
          transitionMs > 0
            ? `opacity ${transitionMs}ms ${
                overlay.transition?.easing ?? "ease"
              }`
            : overlay.style?.transition,
        pointerEvents: pointerTarget === "canvas" ? "none" : "auto",
        visibility: waitingForMeasurement ? "hidden" : undefined,
        display: context.isInViewport ? overlay.style?.display : "none",
      }}
      onPointerDown={pointerTarget === "overlay" ? stopPropagation : undefined}
      onPointerUp={pointerTarget === "overlay" ? stopPropagation : undefined}
      onClick={pointerTarget === "overlay" ? stopPropagation : undefined}
      onDoubleClick={pointerTarget === "overlay" ? stopPropagation : undefined}
      onContextMenu={pointerTarget === "overlay" ? stopPropagation : undefined}
      onKeyDown={pointerTarget === "overlay" ? stopPropagation : undefined}
      onWheel={wheelTarget === "overlay" ? stopPropagation : undefined}
    >
      <OverlayErrorBoundary overlayKey={overlayKey} resetToken={overlay}>
        <OverlayContent overlay={overlay} context={context} />
      </OverlayErrorBoundary>
    </div>
  );
};

const getReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
  const [presentItems, setPresentItems] = useState<
    ReadonlyMap<string, PresentOverlayItem>
  >(() => new Map());
  const presentItemsRef = useRef(presentItems);
  const transitionTimers = useRef(new Map<string, number>());
  const enteringTransitionKeys = useRef(new Set<string>());
  const transitionFrame = useRef<number | null>(null);
  const visibleElementIds = useMemo(
    () => new Set(visibleElements.map((element) => element.id)),
    [visibleElements],
  );

  const updatePresentItems = useCallback(
    (
      updater: (
        previous: ReadonlyMap<string, PresentOverlayItem>,
      ) => ReadonlyMap<string, PresentOverlayItem>,
    ) => {
      setPresentItems((previous) => {
        const next = updater(previous);
        presentItemsRef.current = next;
        return next;
      });
    },
    [],
  );

  const createRenderContext = useCallback(
    (
      element: TypedExcalidrawCustomElement<any>,
      overlay: CustomElementOverlayDefinition<any, any>,
      isInViewport: boolean,
      presence: CustomElementOverlayPresence,
    ): CustomElementOverlayRenderContext<any, any> => {
      const stateScope = overlay.stateScope ?? overlay.id;
      return {
        element,
        appState,
        api,
        assets,
        runtime,
        state: runtime.getState(element.id, stateScope),
        isSelected: !!appState.selectedElementIds[element.id],
        isHovered: !!appState.hoveredElementIds[element.id],
        isActive: runtime.isOpen(element.id, overlay.id),
        isInViewport,
        overlayId: overlay.id,
        stateScope,
        coordinateSpace: getCustomElementOverlayCoordinateSpace(overlay),
        presence,
        open: () => runtime.open(element.id, overlay.id),
        close: () => runtime.close(element.id, overlay.id),
        toggle: () => runtime.toggle(element.id, overlay.id),
        closeAfter: (promise, options) =>
          runtime.closeAfter(element.id, overlay.id, promise, options),
        setState: (updater) =>
          runtime.setState(element.id, stateScope, updater),
        patchState: (patch) =>
          runtime.patchState(element.id, stateScope, patch),
      };
    },
    [api, appState, assets, runtime],
  );

  useEffect(() => {
    const elementIds = new Set(elements.map((element) => element.id));
    runtime.prune(elementIds);
    const overlaysByElementId = new Map(
      elements
        .filter(isCustomElement)
        .map((element) => [
          element.id,
          getCustomElementOverlays(element.customType),
        ]),
    );
    runtime.pruneOverlays(
      (elementId, overlayId) =>
        overlaysByElementId
          .get(elementId)
          ?.some((overlay) => overlay.id === overlayId) === true,
      (elementId, stateScope) =>
        overlaysByElementId
          .get(elementId)
          ?.some(
            (overlay) => (overlay.stateScope ?? overlay.id) === stateScope,
          ) === true,
    );
    for (const key of initializedOverlays.current) {
      const separator = key.indexOf("\u0000");
      if (!elementIds.has(key.slice(0, separator))) {
        initializedOverlays.current.delete(key);
      }
    }
  }, [elements, registryRevision, runtime]);

  const desiredItems = useMemo(() => {
    const next: DesiredOverlayItem[] = [];
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
      for (const overlay of getCustomElementOverlays(element.customType)) {
        const key = `${element.id}\u0000${overlay.id}`;
        const inViewport = visibleElementIds.has(element.id);
        if (
          !inViewport &&
          (overlay.viewport !== "keep-mounted" ||
            !initializedOverlays.current.has(key))
        ) {
          continue;
        }
        const context = createRenderContext(
          element as TypedExcalidrawCustomElement<any>,
          overlay,
          inViewport,
          "present",
        );
        if (
          !isOverlayVisible(
            overlay.visibility ?? getDefaultVisibility(overlay),
            context,
          )
        ) {
          continue;
        }
        if (inViewport && overlay.viewport === "keep-mounted") {
          initializedOverlays.current.add(key);
        }
        next.push({ key, overlay, context });
      }
    }
    return next;
  }, [
    createRenderContext,
    elementsMap,
    registryRevision,
    runtimeRevision,
    visibleElementIds,
    visibleElements,
  ]);

  useEffect(() => {
    const desiredByKey = new Map(desiredItems.map((item) => [item.key, item]));
    const next = new Map(presentItemsRef.current);
    const reducedMotion = getReducedMotion();
    const clearExit = (key: string) => {
      const timer = transitionTimers.current.get(key);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        transitionTimers.current.delete(key);
      }
    };
    const clearEnter = (key: string) => {
      enteringTransitionKeys.current.delete(key);
      if (
        !enteringTransitionKeys.current.size &&
        transitionFrame.current !== null
      ) {
        window.cancelAnimationFrame(transitionFrame.current);
        transitionFrame.current = null;
      }
    };
    const scheduleEnter = (key: string) => {
      enteringTransitionKeys.current.add(key);
      if (transitionFrame.current !== null) {
        return;
      }
      transitionFrame.current = window.requestAnimationFrame(() => {
        transitionFrame.current = null;
        const enteringKeys = new Set(enteringTransitionKeys.current);
        enteringTransitionKeys.current.clear();
        updatePresentItems((previous) => {
          let updated: Map<string, PresentOverlayItem> | null = null;
          for (const enteringKey of enteringKeys) {
            const current = previous.get(enteringKey);
            if (!current || current.presence !== "entering") {
              continue;
            }
            updated ??= new Map(previous);
            updated.set(enteringKey, {
              ...current,
              presence: "present",
              context: { ...current.context, presence: "present" },
            });
          }
          return updated ?? previous;
        });
      });
    };

    for (const desired of desiredItems) {
      const existing = next.get(desired.key);
      clearExit(desired.key);
      const enterMs = reducedMotion
        ? 0
        : desired.overlay.transition?.enterMs ?? 0;
      if (!existing) {
        const presence: CustomElementOverlayPresence =
          enterMs > 0 ? "entering" : "present";
        const context = { ...desired.context, presence };
        next.set(desired.key, {
          ...desired,
          context,
          presence,
          transitionMs: enterMs,
        });
        try {
          desired.overlay.onVisibilityChange?.(context, {
            visible: true,
            previousVisible: false,
          });
        } catch (error) {
          console.error("Custom element overlay visibility failed", error);
        }
        if (enterMs > 0) {
          clearEnter(desired.key);
          scheduleEnter(desired.key);
        }
        continue;
      }
      const reopened = existing.presence === "exiting";
      const presence: CustomElementOverlayPresence =
        existing.presence === "entering" ? "entering" : "present";
      if (presence !== "entering") {
        clearEnter(desired.key);
      }
      const context = { ...desired.context, presence };
      next.set(desired.key, {
        ...desired,
        context,
        presence,
        transitionMs: reopened ? enterMs : existing.transitionMs,
      });
      if (reopened) {
        try {
          desired.overlay.onVisibilityChange?.(context, {
            visible: true,
            previousVisible: false,
          });
        } catch (error) {
          console.error("Custom element overlay visibility failed", error);
        }
      }
    }

    for (const [key, existing] of next) {
      if (desiredByKey.has(key) || existing.presence === "exiting") {
        continue;
      }
      clearEnter(key);
      const separator = key.indexOf("\u0000");
      const elementId = key.slice(0, separator);
      const element = elementsMap.get(elementId);
      const stillRegistered =
        !!element &&
        isCustomElement(element) &&
        getCustomElementOverlays(element.customType).some(
          (overlay) => overlay.id === existing.overlay.id,
        );
      const exitMs =
        stillRegistered && visibleElementIds.has(elementId) && !reducedMotion
          ? existing.overlay.transition?.exitMs ?? 0
          : 0;
      const context =
        element && isCustomElement(element)
          ? createRenderContext(
              element as TypedExcalidrawCustomElement<any>,
              existing.overlay,
              visibleElementIds.has(elementId),
              "exiting",
            )
          : { ...existing.context, presence: "exiting" as const };
      try {
        existing.overlay.onVisibilityChange?.(context, {
          visible: false,
          previousVisible: true,
        });
      } catch (error) {
        console.error("Custom element overlay visibility failed", error);
      }
      if (!exitMs) {
        next.delete(key);
        continue;
      }
      next.set(key, {
        ...existing,
        context,
        presence: "exiting",
        transitionMs: exitMs,
      });
      clearExit(key);
      const timer = window.setTimeout(() => {
        transitionTimers.current.delete(key);
        updatePresentItems((previous) => {
          const current = previous.get(key);
          if (!current || current.presence !== "exiting") {
            return previous;
          }
          const updated = new Map(previous);
          updated.delete(key);
          return updated;
        });
      }, exitMs);
      transitionTimers.current.set(key, timer);
    }

    presentItemsRef.current = next;
    setPresentItems(next);
  }, [
    createRenderContext,
    desiredItems,
    elementsMap,
    updatePresentItems,
    visibleElementIds,
  ]);

  useEffect(
    () => () => {
      transitionTimers.current.forEach((timer) => window.clearTimeout(timer));
      if (transitionFrame.current !== null) {
        window.cancelAnimationFrame(transitionFrame.current);
      }
      transitionTimers.current.clear();
      enteringTransitionKeys.current.clear();
      transitionFrame.current = null;
    },
    [],
  );

  const items = Array.from(presentItems.values());
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
                transitionMs={item.transitionMs}
              />
            ))}
        </div>
      ))}
    </div>
  );
};
