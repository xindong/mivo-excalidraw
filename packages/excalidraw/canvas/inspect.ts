import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { CanvasError, invalidCanvasOperation } from "./errors";
import { CanvasSceneIndex } from "./sceneIndex";

import type {
  CanvasBounds,
  CanvasElementProjection,
  CanvasInspectQuery,
  CanvasInspectResult,
} from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_SEARCH_FIELDS = ["id", "name", "text"] as const;

export const inspectCanvasScene = (
  index: CanvasSceneIndex,
  selectedIds: ReadonlySet<string>,
  query: CanvasInspectQuery = {},
): CanvasInspectResult => {
  try {
    return inspectCanvasSceneUnsafe(index, selectedIds, query);
  } catch (error) {
    if (error instanceof CanvasError) {
      throw error;
    }
    throw invalidCanvasOperation(
      error instanceof Error ? error.message : "Canvas inspect failed",
      error,
    );
  }
};

const inspectCanvasSceneUnsafe = (
  index: CanvasSceneIndex,
  selectedIds: ReadonlySet<string>,
  query: CanvasInspectQuery,
): CanvasInspectResult => {
  const filter = query.filter ?? {};
  const fields = new Set(query.fields ?? []);
  const keyword = filter.keyword?.trim().toLocaleLowerCase() ?? "";
  const searchIn = filter.searchIn?.length
    ? filter.searchIn
    : DEFAULT_SEARCH_FIELDS;
  const offset = parseCursor(query.cursor);
  const limit = parseLimit(query.limit);
  validateBounds(filter.intersects, "Canvas intersects bounds");
  validateBounds(filter.inside, "Canvas inside bounds");

  const matched = index
    .candidates(filter)
    .filter(
      (element) =>
        typeof filter.selected !== "boolean" ||
        selectedIds.has(element.id) === filter.selected,
    )
    .filter(
      (element) =>
        typeof filter.locked !== "boolean" || element.locked === filter.locked,
    )
    .filter(
      (element) =>
        !filter.intersects ||
        boundsIntersect(index.getBounds(element), filter.intersects),
    )
    .filter(
      (element) =>
        !filter.inside || boundsInside(index.getBounds(element), filter.inside),
    )
    .filter(
      (element) =>
        !keyword || matchesKeyword(index, element, keyword, new Set(searchIn)),
    );

  const page = matched.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    revision: index.revision,
    selectedIds: [...selectedIds],
    total: matched.length,
    count: page.length,
    nextCursor: nextOffset < matched.length ? String(nextOffset) : null,
    sceneBounds: getSceneBounds(index, matched),
    elements: page.map((element) => projectElement(index, element, fields)),
  };
};

const projectElement = (
  index: CanvasSceneIndex,
  element: OrderedExcalidrawElement,
  fields: ReadonlySet<string>,
): CanvasElementProjection => {
  const result: Record<string, unknown> = {
    id: element.id,
    type: element.type,
  };
  const name = index.getName(element);
  if (name) {
    result.name = name;
  }
  if (fields.has("position")) {
    result.position = { x: element.x, y: element.y };
  }
  if (fields.has("size")) {
    result.size = { width: element.width, height: element.height };
  }
  if (fields.has("text")) {
    result.text = element.type === "text" ? element.text : null;
  }
  if (fields.has("state")) {
    result.state = {
      isDeleted: element.isDeleted,
      locked: element.locked,
      index: element.index,
    };
  }
  if (fields.has("style")) {
    result.style = {
      angle: element.angle,
      opacity: element.opacity,
      strokeColor: element.strokeColor,
      backgroundColor: element.backgroundColor,
      ...(element.type === "text" ? { fontSize: element.fontSize } : {}),
    };
  }
  if (fields.has("groups")) {
    result.groups = {
      groupIds: element.groupIds,
      frameId: element.frameId,
    };
  }
  if (fields.has("bindings")) {
    result.bindings = {
      boundElementIds: (element.boundElements ?? []).map((item) => item.id),
      startBindingId:
        "startBinding" in element && element.startBinding
          ? element.startBinding.elementId
          : null,
      endBindingId:
        "endBinding" in element && element.endBinding
          ? element.endBinding.elementId
          : null,
    };
  }
  if (fields.has("custom")) {
    result.custom =
      element.type === "custom"
        ? {
            customType: element.customType,
            rendererId: element.rendererId,
            schemaVersion: element.schemaVersion,
            rendererVersion: element.rendererVersion,
            status: element.status,
            resource: element.resource,
            previewFileId: element.previewFileId,
            data: element.data,
          }
        : null;
  }
  if (fields.has("raw")) {
    result.raw = element;
  }
  return result as CanvasElementProjection;
};

const matchesKeyword = (
  index: CanvasSceneIndex,
  element: OrderedExcalidrawElement,
  keyword: string,
  fields: ReadonlySet<string>,
) => {
  if (fields.has("id") && element.id.toLocaleLowerCase().includes(keyword)) {
    return true;
  }
  if (
    fields.has("name") &&
    index.getName(element)?.toLocaleLowerCase().includes(keyword)
  ) {
    return true;
  }
  return (
    fields.has("text") &&
    element.type === "text" &&
    element.text.toLocaleLowerCase().includes(keyword)
  );
};

const getSceneBounds = (
  index: CanvasSceneIndex,
  elements: readonly OrderedExcalidrawElement[],
): CanvasBounds | null => {
  if (!elements.length) {
    return null;
  }
  const bounds = elements.map((element) => index.getBounds(element));
  const x = Math.min(...bounds.map((item) => item.x));
  const y = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.width));
  const maxY = Math.max(...bounds.map((item) => item.y + item.height));
  return { x, y, width: maxX - x, height: maxY - y };
};

const boundsIntersect = (a: CanvasBounds, b: CanvasBounds) =>
  a.x + a.width >= b.x &&
  a.x <= b.x + b.width &&
  a.y + a.height >= b.y &&
  a.y <= b.y + b.height;

const boundsInside = (inner: CanvasBounds, outer: CanvasBounds) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^(0|[1-9]\d*)$/.test(cursor)) {
    throw invalidCanvasOperation(
      "Canvas inspect cursor must be a non-negative integer string",
    );
  }
  const value = Number(cursor);
  if (!Number.isSafeInteger(value)) {
    throw invalidCanvasOperation("Canvas inspect cursor is out of range");
  }
  return value;
};

const parseLimit = (limit: number | undefined) => {
  if (limit === undefined) {
    return DEFAULT_LIMIT;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalidCanvasOperation(
      `Canvas inspect limit must be between 1 and ${MAX_LIMIT}`,
    );
  }
  return limit;
};

const validateBounds = (bounds: CanvasBounds | undefined, label: string) => {
  if (!bounds) {
    return;
  }
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
  ) {
    throw invalidCanvasOperation(`${label} must contain finite numbers`);
  }
  if (bounds.width < 0 || bounds.height < 0) {
    throw invalidCanvasOperation(
      `${label} width and height cannot be negative`,
    );
  }
};
