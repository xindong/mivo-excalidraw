import type { CSSProperties, ReactNode } from "react";

import type {
  CustomElementAssetStore,
  CustomElementData,
  TypedExcalidrawCustomElement,
} from "@excalidraw/element";

import type {
  AppState,
  CustomElementOverlayController,
  ExcalidrawImperativeAPI,
} from "../types";

export type CustomElementOverlayKind = "surface" | "panel" | "popover";
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

export type CustomElementOverlayVisibilityContext<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> = Readonly<{
  element: TypedExcalidrawCustomElement<TData>;
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
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
    coordinateSpace: CustomElementOverlayCoordinateSpace;
    open: <TNextState = TState>(state?: TNextState) => void;
    close: () => void;
    toggle: <TNextState = TState>(state?: TNextState) => void;
    setState: (
      updater: TState | ((previous: TState | undefined) => TState),
    ) => void;
  }>;

export type CustomElementOverlayDefinition<
  TData extends CustomElementData = CustomElementData,
  TState = unknown,
> = Readonly<{
  id: string;
  kind: CustomElementOverlayKind;
  coordinateSpace?: CustomElementOverlayCoordinateSpace;
  visibility?: CustomElementOverlayVisibility<TData, TState>;
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

  pointerEvents?: "auto" | "none";
  clip?: boolean;
  inheritElementOpacity?: boolean;
  className?: string;
  style?: CSSProperties;

  render: (
    context: CustomElementOverlayRenderContext<TData, TState>,
  ) => ReactNode;
  onMount?: (context: CustomElementOverlayRenderContext<TData, TState>) => void;
  onUnmount?: (
    context: CustomElementOverlayRenderContext<TData, TState>,
  ) => void;
}>;

export type CustomElementWithOverlays<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  definition: import("@excalidraw/element").CustomElementDefinition<TData>;
  overlays?: readonly CustomElementOverlayDefinition<TData, any>[];
}>;
