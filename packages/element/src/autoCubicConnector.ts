import type { LocalPoint } from "@excalidraw/math";

import type {
  ConnectorConfig,
  ExcalidrawElement,
  ExcalidrawLinearElement,
} from "./types";

export type { ConnectorConfig } from "./types";

export type AutoCubicPoint = Readonly<{ x: number; y: number }>;

export const normalizeConnectorConfig = (
  connector: unknown,
): ConnectorConfig | null => {
  if (
    connector &&
    typeof connector === "object" &&
    "routing" in connector &&
    connector.routing === "auto-cubic" &&
    "interaction" in connector &&
    connector.interaction === "managed" &&
    "deletePolicy" in connector &&
    connector.deletePolicy === "cascade"
  ) {
    return {
      routing: "auto-cubic",
      interaction: "managed",
      deletePolicy: "cascade",
    };
  }

  return null;
};

export const isAutoCubicConnector = (
  element: ExcalidrawElement,
): element is ExcalidrawLinearElement =>
  (element.type === "line" || element.type === "arrow") &&
  element.connector?.routing === "auto-cubic";

export const isManagedConnector = (
  element: ExcalidrawElement,
): element is ExcalidrawLinearElement =>
  (element.type === "line" || element.type === "arrow") &&
  element.connector?.interaction === "managed";

export const isElementHitTestable = (element: ExcalidrawElement) =>
  !isManagedConnector(element);

export const isElementSelectable = (element: ExcalidrawElement) =>
  !isManagedConnector(element);

export const isElementDirectlyMutable = (element: ExcalidrawElement) =>
  !isManagedConnector(element);

export const shouldCascadeDeleteWithEndpoint = (
  element: ExcalidrawElement,
): element is ExcalidrawLinearElement =>
  (element.type === "line" || element.type === "arrow") &&
  element.connector?.deletePolicy === "cascade";

export const getAutoCubicGeometry = (
  start: AutoCubicPoint,
  end: AutoCubicPoint,
) => {
  const deltaX = end.x - start.x;
  const direction = deltaX >= 0 ? 1 : -1;
  const bend = Math.min(260, Math.max(80, Math.abs(deltaX) * 0.42));
  const control1 = { x: start.x + direction * bend, y: start.y };
  const control2 = { x: end.x - direction * bend, y: end.y };

  return {
    start,
    control1,
    control2,
    end,
    path: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
  } as const;
};

export const getAutoCubicConnectorPath = (
  element: ExcalidrawLinearElement,
  points: readonly LocalPoint[] = element.points,
) => {
  if (!isAutoCubicConnector(element) || points.length < 2) {
    return null;
  }
  const start = points[0];
  const end = points[points.length - 1];

  return getAutoCubicGeometry(
    { x: start[0], y: start[1] },
    { x: end[0], y: end[1] },
  ).path;
};
