import type { CSSProperties, ReactNode } from "react";

import type {
  CustomElementAssetStore,
  CustomElementData,
  CustomElementDefinition,
  TypedExcalidrawCustomElement,
} from "@excalidraw/element";
import type { CustomElementValue } from "@excalidraw/element/types";

import type {
  AppState,
  CustomElementOverlayController,
  ExcalidrawImperativeAPI,
} from "../types";

export type CustomElementOverlayKind = "surface" | "panel" | "popover";
export type CustomElementOverlayPresence = "entering" | "present" | "exiting";
export type CustomElementOverlayCoordinateSpace = "element" | "screen";
export type CustomElementOverlayPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "right"
  | "center";

export type CustomElementOverlayPoint = Readonly<{ x: number; y: number }>;
export type CustomElementOverlayRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type CustomElementOverlayOffset =
  | number
  | Readonly<{ x: number; y: number }>;

export type CustomElementOverlayTransition = Readonly<{
  enterMs?: number;
  exitMs?: number;
  easing?: string;
}>;

export type CustomElementOverlayInteraction = Readonly<{
  pointer?: "canvas" | "overlay";
  wheel?: "canvas" | "overlay";
}>;

export type CustomElementOverlayVisibilityContext<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> = Readonly<{
  element: TypedExcalidrawCustomElement<TData>;
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  runtime: CustomElementOverlayController;
  runtime: CustomElementOverlayController;
  state: TState | undefined;
  isSelected: boolean;
  isHovered: boolean;
  isActive: boolean;
  isInViewport: boolean;
}>;

export type CustomElementOverlayVisibility<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> =
  | "always"
  | "selected"
  | "hovered"
  | "active"
  | "never"
  | ((
      context: CustomElementOverlayVisibilityContext<TData, TState>,
    ) => boolean);

export type CustomElementOverlayRenderContext<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> = CustomElementOverlayVisibilityContext<TData, TState> &
  Readonly<{
    overlayId: string;
    stateScope: string;
    coordinateSpace: CustomElementOverlayCoordinateSpace;
    presence: CustomElementOverlayPresence;
    open: () => void;
    close: () => void;
    toggle: () => void;
    closeAfter: (
      promise: Promise<unknown>,
      options?: Readonly<{ closeOnError?: boolean }>,
    ) => Promise<"closed" | "stale" | "failed">;
    setState: (
      updater: TState | ((previous: TState | undefined) => TState),
    ) => void;
    patchState: <TObjectState extends Readonly<Record<string, unknown>>>(
      patch:
        | Partial<TObjectState>
        | ((previous: TObjectState | undefined) => Partial<TObjectState>),
    ) => void;
  }>;

export type CustomElementOverlayDefinition<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> = Readonly<{
  id: string;
  kind: CustomElementOverlayKind;
  stateScope?: string;
  coordinateSpace?: CustomElementOverlayCoordinateSpace;
  visibility?: CustomElementOverlayVisibility<TData, TState>;
  transition?: CustomElementOverlayTransition;
  interaction?: CustomElementOverlayInteraction;
  /** Keep an initialized DOM subtree alive offscreen (useful for playback). */
  viewport?: "unmount" | "keep-mounted";

  /** Element-local bounds. Used by `element` coordinate-space overlays. */
  bounds?: (
    context: CustomElementOverlayVisibilityContext<TData, TState>,
  ) => CustomElementOverlayRect;

  /** Element-local anchor. Used by `screen` coordinate-space overlays. */
  anchor?: (
    context: CustomElementOverlayVisibilityContext<TData, TState>,
  ) => CustomElementOverlayPoint;
  placement?: CustomElementOverlayPlacement;
  offset?: CustomElementOverlayOffset;
  rotation?: "screen" | "element";
  collision?:
    | false
    | Readonly<{
        flip?: boolean;
        shift?: boolean;
        padding?: number;
      }>;

  clip?: boolean;
  inheritElementOpacity?: boolean;
  className?: string;
  style?: CSSProperties;

  render: (
    context: CustomElementOverlayRenderContext<TData, TState>,
  ) => ReactNode;
  onVisibilityChange?: (
    context: CustomElementOverlayRenderContext<TData, TState>,
    change: Readonly<{ visible: boolean; previousVisible: boolean }>,
  ) => void;
  onMount?: (context: CustomElementOverlayRenderContext<TData, TState>) => void;
  onUnmount?: (
    context: CustomElementOverlayRenderContext<TData, TState>,
  ) => void;
}>;

export type CustomElementLifecycleContext<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  element: TypedExcalidrawCustomElement<TData>;
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  /** Aborted when this editor instance unmounts. */
  signal: AbortSignal;
}>;

export type CustomElementLifecycleUpdate<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  /** Geometry-only mutations do not produce collection lifecycle updates. */
  previous: TypedExcalidrawCustomElement<TData>;
  current: TypedExcalidrawCustomElement<TData>;
}>;

export type CustomElementCollectionLifecycleContext<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  customType: string;
  /** Current non-deleted elements registered under this custom type. */
  elements: readonly TypedExcalidrawCustomElement<TData>[];
  added: readonly TypedExcalidrawCustomElement<TData>[];
  updated: readonly CustomElementLifecycleUpdate<TData>[];
  removed: readonly TypedExcalidrawCustomElement<TData>[];
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  /** Aborted when this editor instance unmounts. */
  signal: AbortSignal;
}>;

export type CustomElementExtension<
  TData extends CustomElementData = CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
> = Readonly<{
  definition: CustomElementDefinition<TData, TPreviewRequest>;
  overlays?: readonly CustomElementOverlayDefinition<TData, any>[];
  lifecycle?: Readonly<{
    /**
     * Receives an editor-instance-scoped, batched semantic view of this
     * custom type. Initial elements are reported as added. Replacing or
     * unregistering the extension reports the previous set as removed.
     */
    onElementsChange?: (
      context: CustomElementCollectionLifecycleContext<TData>,
    ) => void | Promise<void>;
    onSelectionChange?: (
      context: CustomElementLifecycleContext<TData> &
        Readonly<{ isSelected: boolean; previousIsSelected: boolean }>,
    ) => void;
    onViewportChange?: (
      context: CustomElementLifecycleContext<TData> &
        Readonly<{ isInViewport: boolean; previousIsInViewport: boolean }>,
    ) => void;
  }>;
}>;
