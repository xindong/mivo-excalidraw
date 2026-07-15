import { getElementBounds, newElementWith } from "@excalidraw/element";

import type {
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";

import { invalidCanvasOperation } from "./errors";

import type { CanvasLayoutOperation } from "./types";

type LayoutItem = Readonly<{
  element: OrderedExcalidrawElement;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const layoutCanvasElements = (
  elements: readonly OrderedExcalidrawElement[],
  operation: CanvasLayoutOperation,
) => {
  const ids = new Set(operation.elementIds);
  const elementsMap = new Map(
    elements.map((element) => [element.id, element]),
  ) as SceneElementsMap;
  const items = operation.elementIds.map((id) => {
    const element = elementsMap.get(id);
    if (!element || element.isDeleted) {
      throw invalidCanvasOperation(`Canvas element not found: ${id}`);
    }
    const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
    return {
      element,
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  });
  if (!items.length) {
    throw invalidCanvasOperation("Canvas layout requires elementIds");
  }

  const positions =
    operation.mode === "align"
      ? align(items, operation.align)
      : operation.mode === "distribute"
      ? distribute(items, operation.direction)
      : operation.mode === "horizontalStack" ||
        operation.mode === "verticalStack"
      ? stack(
          items,
          operation.mode === "horizontalStack" ? "horizontal" : "vertical",
          finite(operation.gap, 24),
        )
      : grid(
          items,
          positiveInteger(operation.columns, 3),
          finite(operation.gapX ?? operation.gap, 24),
          finite(operation.gapY ?? operation.gap, 24),
        );

  return elements.map((element) => {
    if (!ids.has(element.id)) {
      return element;
    }
    const nextBounds = positions.get(element.id);
    const item = items.find((candidate) => candidate.element.id === element.id);
    if (!nextBounds || !item) {
      return element;
    }
    return newElementWith(element, {
      x: element.x + nextBounds.x - item.x,
      y: element.y + nextBounds.y - item.y,
    });
  });
};

const align = (
  items: readonly LayoutItem[],
  alignment: CanvasLayoutOperation["align"],
) => {
  if (!alignment) {
    throw invalidCanvasOperation("Canvas align layout requires align");
  }
  const bounds = commonBounds(items);
  const positions = new Map<string, { x: number; y: number }>();
  for (const item of items) {
    positions.set(item.element.id, {
      x:
        alignment === "left"
          ? bounds.x
          : alignment === "center"
          ? bounds.x + (bounds.width - item.width) / 2
          : alignment === "right"
          ? bounds.x + bounds.width - item.width
          : item.x,
      y:
        alignment === "top"
          ? bounds.y
          : alignment === "middle"
          ? bounds.y + (bounds.height - item.height) / 2
          : alignment === "bottom"
          ? bounds.y + bounds.height - item.height
          : item.y,
    });
  }
  return positions;
};

const distribute = (
  items: readonly LayoutItem[],
  direction: CanvasLayoutOperation["direction"],
) => {
  if (direction !== "horizontal" && direction !== "vertical") {
    throw invalidCanvasOperation(
      "Canvas distribute layout requires horizontal or vertical direction",
    );
  }
  if (items.length < 3) {
    throw invalidCanvasOperation(
      "Canvas distribute layout requires at least three elements",
    );
  }
  const axis = direction === "horizontal" ? "x" : "y";
  const extent = direction === "horizontal" ? "width" : "height";
  const ordered = [...items].sort((a, b) => a[axis] - b[axis]);
  const start = ordered[0][axis];
  const end = ordered.at(-1)!;
  const span = end[axis] + end[extent] - start;
  const occupied = ordered.reduce((sum, item) => sum + item[extent], 0);
  const gap = (span - occupied) / (ordered.length - 1);
  let cursor = start;
  const positions = new Map<string, { x: number; y: number }>();
  for (const item of ordered) {
    positions.set(item.element.id, {
      x: direction === "horizontal" ? cursor : item.x,
      y: direction === "vertical" ? cursor : item.y,
    });
    cursor += item[extent] + gap;
  }
  return positions;
};

const stack = (
  items: readonly LayoutItem[],
  direction: "horizontal" | "vertical",
  gap: number,
) => {
  const ordered = [...items].sort((a, b) =>
    direction === "horizontal" ? a.x - b.x : a.y - b.y,
  );
  let cursor = direction === "horizontal" ? ordered[0].x : ordered[0].y;
  const positions = new Map<string, { x: number; y: number }>();
  for (const item of ordered) {
    positions.set(item.element.id, {
      x: direction === "horizontal" ? cursor : item.x,
      y: direction === "vertical" ? cursor : item.y,
    });
    cursor += (direction === "horizontal" ? item.width : item.height) + gap;
  }
  return positions;
};

const grid = (
  items: readonly LayoutItem[],
  columns: number,
  gapX: number,
  gapY: number,
) => {
  const origin = commonBounds(items);
  const rows = Math.ceil(items.length / columns);
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(
      0,
      ...items
        .filter((_, index) => index % columns === column)
        .map((item) => item.width),
    ),
  );
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(
      0,
      ...items
        .slice(row * columns, row * columns + columns)
        .map((item) => item.height),
    ),
  );
  const positions = new Map<string, { x: number; y: number }>();
  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(item.element.id, {
      x:
        origin.x +
        columnWidths
          .slice(0, column)
          .reduce((sum, width) => sum + width + gapX, 0),
      y:
        origin.y +
        rowHeights
          .slice(0, row)
          .reduce((sum, height) => sum + height + gapY, 0),
    });
  });
  return positions;
};

const commonBounds = (items: readonly LayoutItem[]) => {
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return { x, y, width: maxX - x, height: maxY - y };
};

const finite = (value: number | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    throw invalidCanvasOperation("Canvas layout number must be finite");
  }
  return value;
};

const positiveInteger = (value: number | undefined, fallback: number) => {
  const resolved = finite(value, fallback);
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw invalidCanvasOperation(
      "Canvas grid columns must be a positive integer",
    );
  }
  return resolved;
};
