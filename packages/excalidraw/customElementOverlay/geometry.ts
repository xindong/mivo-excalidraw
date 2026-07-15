import type { CSSProperties } from "react";

import type { CustomElementData } from "@excalidraw/element";

import type {
  CustomElementOverlayCoordinateSpace,
  CustomElementOverlayDefinition,
  CustomElementOverlayPlacement,
  CustomElementOverlayPoint,
  CustomElementOverlayRect,
  CustomElementOverlayVisibilityContext,
} from "./types";

export const getCustomElementOverlayCoordinateSpace = (
  overlay: CustomElementOverlayDefinition<any, any>,
): CustomElementOverlayCoordinateSpace =>
  overlay.coordinateSpace ??
  (overlay.kind === "surface" ? "element" : "screen");

const rotatePoint = (
  point: CustomElementOverlayPoint,
  center: CustomElementOverlayPoint,
  angle: number,
) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos,
  };
};

export const elementLocalPointToViewport = <TData extends CustomElementData>(
  context: CustomElementOverlayVisibilityContext<TData, any>,
  point: CustomElementOverlayPoint,
) => {
  const { element, appState } = context;
  const scenePoint = rotatePoint(
    { x: element.x + point.x, y: element.y + point.y },
    {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    },
    element.angle,
  );
  return {
    x: (scenePoint.x + appState.scrollX) * appState.zoom.value,
    y: (scenePoint.y + appState.scrollY) * appState.zoom.value,
  };
};

const getDefaultAnchor = (
  placement: CustomElementOverlayPlacement,
  width: number,
  height: number,
): CustomElementOverlayPoint => {
  switch (placement) {
    case "top-start":
      return { x: 0, y: 0 };
    case "top-end":
      return { x: width, y: 0 };
    case "top":
      return { x: width / 2, y: 0 };
    case "bottom-start":
      return { x: 0, y: height };
    case "bottom-end":
      return { x: width, y: height };
    case "bottom":
      return { x: width / 2, y: height };
    case "left":
      return { x: 0, y: height / 2 };
    case "right":
      return { x: width, y: height / 2 };
    case "center":
      return { x: width / 2, y: height / 2 };
  }
};

const getPanelTopLeft = (
  placement: CustomElementOverlayPlacement,
  anchor: CustomElementOverlayPoint,
  size: Readonly<{ width: number; height: number }>,
  gap: number,
) => {
  switch (placement) {
    case "top":
      return {
        x: anchor.x - size.width / 2,
        y: anchor.y - size.height - gap,
      };
    case "top-start":
      return { x: anchor.x, y: anchor.y - size.height - gap };
    case "top-end":
      return {
        x: anchor.x - size.width,
        y: anchor.y - size.height - gap,
      };
    case "bottom":
      return { x: anchor.x - size.width / 2, y: anchor.y + gap };
    case "bottom-start":
      return { x: anchor.x, y: anchor.y + gap };
    case "bottom-end":
      return { x: anchor.x - size.width, y: anchor.y + gap };
    case "left":
      return {
        x: anchor.x - size.width - gap,
        y: anchor.y - size.height / 2,
      };
    case "right":
      return { x: anchor.x + gap, y: anchor.y - size.height / 2 };
    case "center":
      return {
        x: anchor.x - size.width / 2,
        y: anchor.y - size.height / 2,
      };
  }
};

const flipPlacement = (
  placement: CustomElementOverlayPlacement,
): CustomElementOverlayPlacement => {
  switch (placement) {
    case "top":
      return "bottom";
    case "top-start":
      return "bottom-start";
    case "top-end":
      return "bottom-end";
    case "bottom":
      return "top";
    case "bottom-start":
      return "top-start";
    case "bottom-end":
      return "top-end";
    case "left":
      return "right";
    case "right":
      return "left";
    case "center":
      return "center";
  }
};

const shouldFlip = (
  placement: CustomElementOverlayPlacement,
  position: CustomElementOverlayPoint,
  size: Readonly<{ width: number; height: number }>,
  viewport: Readonly<{ width: number; height: number }>,
  padding: number,
) => {
  if (placement.startsWith("top")) {
    return position.y < padding;
  }
  if (placement.startsWith("bottom")) {
    return position.y + size.height > viewport.height - padding;
  }
  if (placement === "left") {
    return position.x < padding;
  }
  if (placement === "right") {
    return position.x + size.width > viewport.width - padding;
  }
  return false;
};

export const getElementSpaceOverlayStyle = <TData extends CustomElementData>(
  context: CustomElementOverlayVisibilityContext<TData, any>,
  bounds: CustomElementOverlayRect,
): CSSProperties => {
  const { element, appState } = context;
  const origin = elementLocalPointToViewport(context, {
    x: bounds.x,
    y: bounds.y,
  });
  const zoom = appState.zoom.value;
  const cos = Math.cos(element.angle);
  const sin = Math.sin(element.angle);
  return {
    left: 0,
    top: 0,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    transformOrigin: "0 0",
    transform: `matrix(${zoom * cos}, ${zoom * sin}, ${-zoom * sin}, ${
      zoom * cos
    }, ${origin.x}, ${origin.y})`,
  };
};

export const getScreenSpaceOverlayStyle = <TData extends CustomElementData>(
  context: CustomElementOverlayVisibilityContext<TData, any>,
  overlay: CustomElementOverlayDefinition<TData, any>,
  size: Readonly<{ width: number; height: number }>,
): CSSProperties => {
  const { element, appState } = context;
  let placement = overlay.placement ?? "bottom";
  let localAnchor =
    overlay.anchor?.(context) ??
    getDefaultAnchor(placement, element.width, element.height);
  let anchor = elementLocalPointToViewport(context, localAnchor);
  const gap = typeof overlay.offset === "number" ? overlay.offset : 0;
  const offset =
    typeof overlay.offset === "object" ? overlay.offset : { x: 0, y: 0 };
  let position = getPanelTopLeft(placement, anchor, size, gap);
  position = { x: position.x + offset.x, y: position.y + offset.y };

  const collision =
    overlay.collision === false ? null : overlay.collision ?? {};
  const padding = collision?.padding ?? 8;
  if (
    collision?.flip !== false &&
    shouldFlip(
      placement,
      position,
      size,
      { width: appState.width, height: appState.height },
      padding,
    )
  ) {
    placement = flipPlacement(placement);
    if (!overlay.anchor) {
      localAnchor = getDefaultAnchor(placement, element.width, element.height);
      anchor = elementLocalPointToViewport(context, localAnchor);
    }
    position = getPanelTopLeft(placement, anchor, size, gap);
    position = { x: position.x + offset.x, y: position.y + offset.y };
  }

  if (collision?.shift !== false) {
    position = {
      x: Math.min(
        Math.max(position.x, padding),
        Math.max(padding, appState.width - size.width - padding),
      ),
      y: Math.min(
        Math.max(position.y, padding),
        Math.max(padding, appState.height - size.height - padding),
      ),
    };
  }

  const rotateWithElement = overlay.rotation === "element";
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: rotateWithElement ? `rotate(${element.angle}rad)` : undefined,
    transformOrigin: rotateWithElement
      ? `${anchor.x - position.x}px ${anchor.y - position.y}px`
      : undefined,
  };
};
