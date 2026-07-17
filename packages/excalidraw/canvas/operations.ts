import {
  addToGroup,
  convertToExcalidrawElements,
  deepCopyElement,
  duplicateElements,
  fixBindingsAfterDeletion,
  getContainerElement,
  newElementWith,
  handleBindTextResize,
  isArrowElement,
  isNonDeletedElement,
  redrawTextBoundingBox,
  Scene,
  syncInvalidIndicesImmutable,
  updateBoundElements,
  type ExcalidrawElementSkeleton,
} from "@excalidraw/element";
import { randomId } from "@excalidraw/common";
import { pointFrom, type Radians } from "@excalidraw/math";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { CanvasError, invalidCanvasOperation } from "./errors";
import { layoutCanvasElements } from "./layout";

import type {
  CanvasCreateItem,
  CanvasElementPatch,
  CanvasOperation,
  CanvasSceneOperationResult,
  CanvasSceneSnapshot,
} from "./types";

type AppliedSceneOperation = Readonly<{
  elements: readonly OrderedExcalidrawElement[];
  created: readonly string[];
  touched: readonly string[];
}>;

export const applyCanvasSceneOperations = (
  snapshot: CanvasSceneSnapshot,
  operations: readonly CanvasOperation[],
): CanvasSceneOperationResult => {
  try {
    return applyCanvasSceneOperationsUnsafe(snapshot, operations);
  } catch (error) {
    if (error instanceof CanvasError) {
      throw error;
    }
    throw invalidCanvasOperation(
      error instanceof Error ? error.message : "Canvas operation failed",
      error,
    );
  }
};

const applyCanvasSceneOperationsUnsafe = (
  snapshot: CanvasSceneSnapshot,
  operations: readonly CanvasOperation[],
): CanvasSceneOperationResult => {
  if (!operations.length) {
    throw invalidCanvasOperation(
      "Canvas apply requires at least one operation",
    );
  }

  let elements: readonly OrderedExcalidrawElement[] = snapshot.elements;
  let selectedElementIds: Readonly<Record<string, true>> | undefined;
  let focusElementIds: readonly string[] | undefined;
  const createdElementIds = new Set<string>();
  const touchedElementIds = new Set<string>();

  for (const operation of operations) {
    if (operation.type === "extension") {
      throw invalidCanvasOperation(
        "Canvas extension operations must be executed by a live controller",
      );
    }
    if (operation.type === "viewport") {
      const select = operation.select ?? [];
      const focus = operation.focus ?? [];
      if (operation.center && focus.length) {
        throw invalidCanvasOperation(
          "Canvas viewport cannot use center and focus together",
        );
      }
      if (operation.center) {
        finiteRequired(operation.center.x, "Canvas viewport center.x");
        finiteRequired(operation.center.y, "Canvas viewport center.y");
      }
      if (select.length || focus.length) {
        ensureElements(elements, [...select, ...focus]);
      }
      if (operation.select) {
        selectedElementIds = toSelectedElementIds(select);
      }
      if (operation.focus) {
        focusElementIds = focus;
      }
      continue;
    }

    const result = applySceneOperation(elements, snapshot, operation);
    elements = result.elements;
    result.created.forEach((id) => createdElementIds.add(id));
    result.touched.forEach((id) => touchedElementIds.add(id));
  }

  const indexed = syncInvalidIndicesImmutable(elements);
  if (indexed) {
    elements = Array.from(indexed.values());
  }

  return {
    elements,
    selectedElementIds,
    focusElementIds,
    createdElementIds: [...createdElementIds],
    touchedElementIds: [...touchedElementIds],
  };
};

const applySceneOperation = (
  elements: readonly OrderedExcalidrawElement[],
  snapshot: CanvasSceneSnapshot,
  operation: Exclude<CanvasOperation, { type: "viewport" | "extension" }>,
): AppliedSceneOperation => {
  if (operation.type === "create") {
    const created = createElements(operation.items);
    const ids = new Set(elements.map((element) => element.id));
    for (const element of created) {
      if (ids.has(element.id)) {
        throw invalidCanvasOperation(
          `Canvas element id already exists: ${element.id}`,
        );
      }
      ids.add(element.id);
    }
    return {
      elements: [...elements, ...created],
      created: created.map((element) => element.id),
      touched: created.map((element) => element.id),
    };
  }

  if (operation.type === "patch") {
    ensureElements(elements, [operation.elementId]);
    return {
      elements: patchElement(
        elements,
        operation.elementId,
        operation.patch,
        operation.preserveCenter,
      ),
      created: [],
      touched: [operation.elementId],
    };
  }

  if (operation.type === "transform") {
    ensureElements(elements, operation.elementIds);
    return {
      elements: transformElements(elements, operation),
      created: [],
      touched: [...operation.elementIds],
    };
  }

  if (operation.type === "duplicate") {
    ensureElements(elements, operation.elementIds);
    const ids = new Map(
      elements
        .filter((element) => operation.elementIds.includes(element.id))
        .map((element) => [element.id, element]),
    );
    const duplicated = duplicateElements({
      type: "in-place",
      elements,
      idsOfElementsToDuplicate: ids,
      appState: {
        editingGroupId: snapshot.appState.editingGroupId,
        selectedGroupIds: snapshot.appState.selectedGroupIds,
      },
    });
    const duplicateIds = new Set(
      duplicated.duplicatedElements.map((element) => element.id),
    );
    const offsetX = finite(operation.offsetX, 24);
    const offsetY = finite(operation.offsetY, 24);
    const next = duplicated.elementsWithDuplicates.map((element) =>
      duplicateIds.has(element.id)
        ? newElementWith(element, {
            x: element.x + offsetX,
            y: element.y + offsetY,
          })
        : element,
    ) as OrderedExcalidrawElement[];
    return {
      elements: next,
      created: [...duplicateIds],
      touched: [...duplicateIds],
    };
  }

  if (operation.type === "delete") {
    ensureElements(elements, operation.elementIds);
    const ids = collectBoundTextElementIds(elements, operation.elementIds);
    const affectedIds = new Set(ids);
    for (const element of elements) {
      if (
        element.boundElements?.some((binding) => ids.has(binding.id)) ||
        ("containerId" in element &&
          element.containerId &&
          ids.has(element.containerId)) ||
        ("startBinding" in element &&
          element.startBinding &&
          ids.has(element.startBinding.elementId)) ||
        ("endBinding" in element &&
          element.endBinding &&
          ids.has(element.endBinding.elementId)) ||
        (element.frameId && ids.has(element.frameId))
      ) {
        affectedIds.add(element.id);
      }
    }
    const next = elements
      .map((element) =>
        affectedIds.has(element.id)
          ? (deepCopyElement(element) as OrderedExcalidrawElement)
          : element,
      )
      .map((element) =>
        ids.has(element.id)
          ? newElementWith(element, { isDeleted: true })
          : element.frameId && ids.has(element.frameId)
          ? newElementWith(element, { frameId: null })
          : element,
      );
    fixBindingsAfterDeletion(
      next,
      next.filter((element) => ids.has(element.id)),
    );
    return {
      elements: next,
      created: [],
      touched: [...ids],
    };
  }

  if (operation.type === "group") {
    ensureElements(elements, operation.elementIds);
    if (operation.elementIds.length < 2) {
      throw invalidCanvasOperation(
        "Canvas group requires at least two elements",
      );
    }
    const ids = collectBoundTextElementIds(elements, operation.elementIds);
    const groupId = operation.groupId ?? randomId();
    if (!groupId) {
      throw invalidCanvasOperation("Canvas groupId cannot be empty");
    }
    const grouped = elements
      .filter((element) => ids.has(element.id))
      .map((element) =>
        newElementWith(element, {
          groupIds: addToGroup(
            element.groupIds,
            groupId,
            snapshot.appState.editingGroupId,
          ),
        }),
      );
    const insertionIndex = Math.max(
      ...elements.map((element, index) => (ids.has(element.id) ? index : -1)),
    );
    const before = elements
      .slice(0, insertionIndex + 1)
      .filter((element) => !ids.has(element.id));
    const after = elements
      .slice(insertionIndex + 1)
      .filter((element) => !ids.has(element.id));
    return {
      elements: [...before, ...grouped, ...after],
      created: [],
      touched: [...ids],
    };
  }

  if (operation.type === "ungroup") {
    ensureElements(elements, operation.elementIds);
    const ids = collectBoundTextElementIds(elements, operation.elementIds);
    return {
      elements: elements.map((element) => {
        if (!ids.has(element.id) || !element.groupIds.length) {
          return element;
        }
        const groupIds = operation.groupId
          ? element.groupIds.filter((id) => id !== operation.groupId)
          : element.groupIds.slice(0, -1);
        return newElementWith(element, { groupIds });
      }),
      created: [],
      touched: [...ids],
    };
  }

  if (operation.type === "connect") {
    const connected = connectElements(elements, operation);
    return {
      elements: connected.elements,
      created: connected.createdIds,
      touched: [operation.from, operation.to, ...connected.createdIds],
    };
  }

  if (operation.type === "layout") {
    return {
      elements: layoutCanvasElements(elements, operation),
      created: [],
      touched: [...operation.elementIds],
    };
  }

  ensureElements(elements, operation.elementIds);
  const arrangedIds = collectBoundTextElementIds(
    elements,
    operation.elementIds,
  );
  return {
    elements: arrangeElements(elements, [...arrangedIds], operation.mode),
    created: [],
    touched: [...arrangedIds],
  };
};

const createElements = (items: readonly CanvasCreateItem[]) => {
  if (!items.length) {
    throw invalidCanvasOperation("Canvas create requires items");
  }
  const elements: OrderedExcalidrawElement[] = [];
  for (const item of items) {
    validateCreateItem(item);
    if (item.kind === "custom") {
      const skeleton: ExcalidrawElementSkeleton = {
        type: "custom",
        id: item.id,
        x: item.x,
        y: item.y,
        width: finite(item.width, 320),
        height: finite(item.height, 200),
        angle: finite(item.angle, 0) as Radians,
        opacity: finite(item.opacity, 100),
        locked: item.locked,
        customData: item.customData,
        customType: item.customType,
        rendererId: item.rendererId,
        schemaVersion: item.schemaVersion,
        rendererVersion: item.rendererVersion,
        resource: item.resource,
        status: item.status,
        data: item.data,
        previewFileId: item.previewFileId,
      };
      elements.push(
        ...(convertToExcalidrawElements([skeleton], {
          regenerateIds: item.id === undefined,
        }) as OrderedExcalidrawElement[]),
      );
      continue;
    }
    const skeleton: ExcalidrawElementSkeleton =
      item.kind === "text"
        ? {
            type: "text",
            id: item.id,
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            angle: item.angle as Radians | undefined,
            opacity: item.opacity,
            locked: item.locked,
            customData: item.customData,
            text: item.text,
            fontSize: item.fontSize,
            strokeColor: item.color,
            textAlign: item.textAlign,
          }
        : {
            type: item.shape,
            id: item.id,
            x: item.x,
            y: item.y,
            width: finite(item.width, 160),
            height: finite(item.height, 100),
            angle: item.angle as Radians | undefined,
            opacity: item.opacity,
            locked: item.locked,
            customData: item.customData,
            strokeColor: item.strokeColor,
            backgroundColor:
              item.shape === "line" || item.shape === "arrow"
                ? undefined
                : item.backgroundColor,
            strokeWidth: item.strokeWidth,
          };
    elements.push(
      ...(convertToExcalidrawElements([skeleton], {
        regenerateIds: item.id === undefined,
      }) as OrderedExcalidrawElement[]),
    );
  }
  return elements;
};

const patchElement = (
  elements: readonly OrderedExcalidrawElement[],
  id: string,
  patch: CanvasElementPatch,
  preserveCenter = false,
) => {
  if (patch.width !== undefined && patch.width <= 0) {
    throw invalidCanvasOperation("Canvas patch width must be greater than 0");
  }
  if (patch.height !== undefined && patch.height <= 0) {
    throw invalidCanvasOperation("Canvas patch height must be greater than 0");
  }
  if (patch.fontSize !== undefined && patch.fontSize <= 0) {
    throw invalidCanvasOperation(
      "Canvas patch fontSize must be greater than 0",
    );
  }
  if (
    patch.opacity !== undefined &&
    (patch.opacity < 0 || patch.opacity > 100)
  ) {
    throw invalidCanvasOperation(
      "Canvas patch opacity must be between 0 and 100",
    );
  }
  for (const [key, value] of [
    ["schemaVersion", patch.schemaVersion],
    ["rendererVersion", patch.rendererVersion],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw invalidCanvasOperation(
        `Canvas patch ${key} must be a non-negative integer`,
      );
    }
  }
  for (const [key, value] of [
    ["name", patch.name],
    ["customType", patch.customType],
    ["rendererId", patch.rendererId],
  ] as const) {
    if (value !== undefined && !value.trim()) {
      throw invalidCanvasOperation(`Canvas patch ${key} cannot be empty`);
    }
  }
  const relatedIds = collectRelatedElementIds(elements, new Set([id]));
  const workingElements = elements.map((element) =>
    relatedIds.has(element.id)
      ? (deepCopyElement(element) as OrderedExcalidrawElement)
      : element,
  );
  const nextElements = workingElements.map((element) => {
    if (element.id !== id) {
      return element;
    }
    if (
      element.type !== "custom" &&
      (patch.name !== undefined ||
        patch.customType !== undefined ||
        patch.rendererId !== undefined ||
        patch.schemaVersion !== undefined ||
        patch.rendererVersion !== undefined)
    ) {
      throw invalidCanvasOperation(
        "Canvas custom fields can only patch custom elements",
      );
    }
    const updates: Record<string, unknown> = {};
    for (const key of [
      "x",
      "y",
      "width",
      "height",
      "angle",
      "opacity",
      "fontSize",
    ] as const) {
      if (patch[key] !== undefined) {
        updates[key] = finiteRequired(patch[key], `Canvas patch ${key}`);
      }
    }
    for (const key of ["locked", "strokeColor", "backgroundColor"] as const) {
      if (patch[key] !== undefined) {
        updates[key] = patch[key];
      }
    }
    if (patch.customData !== undefined) {
      updates.customData = patch.customData;
    }
    if (element.type === "custom") {
      for (const key of [
        "customType",
        "rendererId",
        "schemaVersion",
        "rendererVersion",
        "data",
        "resource",
        "previewFileId",
        "status",
      ] as const) {
        if (patch[key] !== undefined) {
          updates[key] = patch[key];
        }
      }
      if (patch.name !== undefined) {
        updates.data = {
          ...(patch.data ?? element.data),
          name: patch.name,
        };
      }
    }
    if (preserveCenter) {
      if (patch.width !== undefined && patch.x === undefined) {
        updates.x = element.x + (element.width - patch.width) / 2;
      }
      if (patch.height !== undefined && patch.y === undefined) {
        updates.y = element.y + (element.height - patch.height) / 2;
      }
    }
    if (element.type === "text" && patch.text !== undefined) {
      updates.originalText = patch.text;
      updates.text = patch.text;
    }
    return newElementWith(
      element,
      updates as never,
    ) as OrderedExcalidrawElement;
  });
  const scene = new Scene(nextElements);
  const target = scene.getElementsMapIncludingDeleted().get(id);
  if (target && isNonDeletedElement(target)) {
    if (
      target.type === "text" &&
      (patch.text !== undefined || patch.fontSize !== undefined)
    ) {
      redrawTextBoundingBox(
        target,
        getContainerElement(target, scene.getNonDeletedElementsMap()),
        scene,
      );
    } else {
      updateBoundElements(target, scene);
      handleBindTextResize(target, scene, false);
    }
  }
  return scene.getElementsIncludingDeleted() as readonly OrderedExcalidrawElement[];
};

const transformElements = (
  elements: readonly OrderedExcalidrawElement[],
  operation: Extract<CanvasOperation, { type: "transform" }>,
) => {
  const ids = new Set(operation.elementIds);
  const affectedIds = collectRelatedElementIds(elements, ids);
  const workingElements = elements.map((element) =>
    affectedIds.has(element.id)
      ? (deepCopyElement(element) as OrderedExcalidrawElement)
      : element,
  );
  const selected = workingElements
    .filter(isNonDeletedElement)
    .filter((element) => ids.has(element.id));
  const minX = Math.min(...selected.map((element) => element.x));
  const minY = Math.min(...selected.map((element) => element.y));
  const maxX = Math.max(
    ...selected.map((element) => element.x + element.width),
  );
  const maxY = Math.max(
    ...selected.map((element) => element.y + element.height),
  );
  const anchor = operation.anchor ?? {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
  finiteRequired(anchor.x, "Canvas transform anchor.x");
  finiteRequired(anchor.y, "Canvas transform anchor.y");
  const scaleX = finite(operation.scaleX ?? operation.scale, 1);
  const scaleY = finite(operation.scaleY ?? operation.scale, 1);
  if (scaleX <= 0 || scaleY <= 0) {
    throw invalidCanvasOperation(
      "Canvas transform scale must be greater than 0",
    );
  }
  const dx = finite(operation.dx, 0);
  const dy = finite(operation.dy, 0);
  const angleDelta = finite(operation.angleDelta, 0);
  const cos = Math.cos(angleDelta);
  const sin = Math.sin(angleDelta);

  const transformed = workingElements.map((element) => {
    if (!ids.has(element.id)) {
      return element;
    }
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const scaledX = anchor.x + (centerX - anchor.x) * scaleX;
    const scaledY = anchor.y + (centerY - anchor.y) * scaleY;
    const offsetX = scaledX - anchor.x;
    const offsetY = scaledY - anchor.y;
    const rotatedX = anchor.x + offsetX * cos - offsetY * sin;
    const rotatedY = anchor.y + offsetX * sin + offsetY * cos;
    const width = element.width * scaleX;
    const height = element.height * scaleY;
    return newElementWith(element, {
      x: rotatedX - width / 2 + dx,
      y: rotatedY - height / 2 + dy,
      width,
      height,
      angle: (element.angle + angleDelta) as Radians,
      ...(element.type === "line" || element.type === "arrow"
        ? {
            points: element.points.map(([x, y]) =>
              pointFrom(x * scaleX, y * scaleY),
            ),
          }
        : {}),
    }) as OrderedExcalidrawElement;
  });
  const scene = new Scene(transformed);
  const transformedSelected = transformed
    .filter(isNonDeletedElement)
    .filter((element) => ids.has(element.id));
  for (const element of transformedSelected) {
    updateBoundElements(element, scene, {
      simultaneouslyUpdated: transformedSelected,
    });
    handleBindTextResize(element, scene, false);
  }
  return scene.getElementsIncludingDeleted() as readonly OrderedExcalidrawElement[];
};

const connectElements = (
  elements: readonly OrderedExcalidrawElement[],
  operation: Extract<CanvasOperation, { type: "connect" }>,
) => {
  ensureElements(elements, [operation.from, operation.to]);
  if (operation.from === operation.to) {
    throw invalidCanvasOperation(
      "Canvas connector endpoints must be different",
    );
  }
  if (operation.strokeWidth !== undefined) {
    finiteRequired(operation.strokeWidth, "Canvas connector strokeWidth");
    if (operation.strokeWidth <= 0) {
      throw invalidCanvasOperation(
        "Canvas connector strokeWidth must be greater than 0",
      );
    }
  }
  const from = elements.find((element) => element.id === operation.from)!;
  const to = elements.find((element) => element.id === operation.to)!;
  if (
    from.type === "line" ||
    from.type === "arrow" ||
    to.type === "line" ||
    to.type === "arrow"
  ) {
    throw invalidCanvasOperation("Canvas connector endpoints must be bindable");
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;
  const connectorSkeleton: ExcalidrawElementSkeleton = {
    type: "arrow",
    x: startX,
    y: startY,
    points: [pointFrom(0, 0), pointFrom(endX - startX, endY - startY)],
    endArrowhead: operation.endArrowhead ?? "arrow",
    strokeColor: operation.strokeColor,
    strokeWidth: operation.strokeWidth,
    ...(operation.label ? { label: { text: operation.label } } : {}),
  };
  const created = convertToExcalidrawElements([
    connectorSkeleton,
  ]) as OrderedExcalidrawElement[];
  const arrow = created.find(isArrowElement);
  if (!arrow) {
    throw invalidCanvasOperation("Canvas connector could not be created");
  }
  const boundArrow = newElementWith(arrow, {
    startBinding: {
      elementId: from.id,
      fixedPoint: [0.5, 0.5],
      mode: "orbit",
    },
    endBinding: {
      elementId: to.id,
      fixedPoint: [0.5, 0.5],
      mode: "orbit",
    },
  });
  const connectedElements = created.map((element) =>
    element.id === arrow.id ? boundArrow : element,
  );
  const boundRef = { id: boundArrow.id, type: "arrow" as const };
  const next = elements.map((element) =>
    element.id === from.id || element.id === to.id
      ? newElementWith(element, {
          boundElements: [
            ...(element.boundElements ?? []).filter(
              (binding) => binding.id !== arrow.id,
            ),
            boundRef,
          ],
        })
      : element,
  );
  return {
    elements: [...next, ...connectedElements],
    createdIds: connectedElements.map((element) => element.id),
  };
};

const arrangeElements = (
  elements: readonly OrderedExcalidrawElement[],
  elementIds: readonly string[],
  mode: "front" | "back" | "forward" | "backward",
) => {
  if (!(["front", "back", "forward", "backward"] as const).includes(mode)) {
    throw invalidCanvasOperation(
      "Canvas arrange mode must be front, back, forward, or backward",
    );
  }
  const ids = new Set(elementIds);
  if (mode === "front" || mode === "back") {
    const selected = elements.filter((element) => ids.has(element.id));
    const rest = elements.filter((element) => !ids.has(element.id));
    return mode === "front" ? [...rest, ...selected] : [...selected, ...rest];
  }
  const next = [...elements];
  if (mode === "forward") {
    for (let index = next.length - 2; index >= 0; index--) {
      if (ids.has(next[index].id) && !ids.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
      }
    }
  } else {
    for (let index = 1; index < next.length; index++) {
      if (ids.has(next[index].id) && !ids.has(next[index - 1].id)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]];
      }
    }
  }
  return next;
};

const ensureElements = (
  elements: readonly OrderedExcalidrawElement[],
  ids: readonly string[],
) => {
  if (!ids.length) {
    throw invalidCanvasOperation("Canvas operation requires elementIds");
  }
  const visibleIds = new Set(
    elements
      .filter((element) => !element.isDeleted)
      .map((element) => element.id),
  );
  const missing = ids.filter((id) => !visibleIds.has(id));
  if (missing.length) {
    throw invalidCanvasOperation(
      `Canvas element not found: ${missing.join(", ")}`,
    );
  }
};

const collectRelatedElementIds = (
  elements: readonly OrderedExcalidrawElement[],
  initialIds: ReadonlySet<string>,
) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const ids = new Set(initialIds);
  const queue = [...ids];
  for (let index = 0; index < queue.length; index++) {
    const element = byId.get(queue[index]);
    for (const binding of element?.boundElements ?? []) {
      if (!ids.has(binding.id)) {
        ids.add(binding.id);
        queue.push(binding.id);
      }
    }
    for (const relatedId of [
      element && "containerId" in element ? element.containerId : null,
      element && "startBinding" in element
        ? element.startBinding?.elementId
        : null,
      element && "endBinding" in element ? element.endBinding?.elementId : null,
    ]) {
      if (relatedId && !ids.has(relatedId)) {
        ids.add(relatedId);
        queue.push(relatedId);
      }
    }
  }
  return ids;
};

const collectBoundTextElementIds = (
  elements: readonly OrderedExcalidrawElement[],
  initialIds: readonly string[],
) => {
  const ids = new Set(initialIds);
  for (const element of elements) {
    if (!ids.has(element.id)) {
      continue;
    }
    element.boundElements
      ?.filter((binding) => binding.type === "text")
      .forEach((binding) => ids.add(binding.id));
  }
  return ids;
};

const validateCreateItem = (item: CanvasCreateItem) => {
  finiteRequired(item.x, "Canvas create x");
  finiteRequired(item.y, "Canvas create y");
  for (const [key, value] of [
    ["width", item.width],
    ["height", item.height],
    ["angle", item.angle],
    ["opacity", item.opacity],
  ] as const) {
    if (value !== undefined) {
      finiteRequired(value, `Canvas create ${key}`);
    }
  }
  if (item.width !== undefined && item.width <= 0) {
    throw invalidCanvasOperation("Canvas create width must be greater than 0");
  }
  if (item.height !== undefined && item.height <= 0) {
    throw invalidCanvasOperation("Canvas create height must be greater than 0");
  }
  if (item.opacity !== undefined && (item.opacity < 0 || item.opacity > 100)) {
    throw invalidCanvasOperation(
      "Canvas create opacity must be between 0 and 100",
    );
  }
  if (item.kind === "text" && item.fontSize !== undefined) {
    finiteRequired(item.fontSize, "Canvas create fontSize");
    if (item.fontSize <= 0) {
      throw invalidCanvasOperation(
        "Canvas create fontSize must be greater than 0",
      );
    }
  }
  if (item.kind === "shape" && item.strokeWidth !== undefined) {
    finiteRequired(item.strokeWidth, "Canvas create strokeWidth");
    if (item.strokeWidth <= 0) {
      throw invalidCanvasOperation(
        "Canvas create strokeWidth must be greater than 0",
      );
    }
  }
  if (item.kind === "text" && !item.text.trim()) {
    throw invalidCanvasOperation("Canvas text cannot be empty");
  }
  if (item.kind === "custom" && (!item.customType || !item.rendererId)) {
    throw invalidCanvasOperation(
      "Canvas custom element requires customType and rendererId",
    );
  }
};

const finite = (value: number | undefined, fallback: number) =>
  value === undefined ? fallback : finiteRequired(value, "Canvas number");

const finiteRequired = (value: number, label: string) => {
  if (!Number.isFinite(value)) {
    throw invalidCanvasOperation(`${label} must be finite`);
  }
  return value;
};

const toSelectedElementIds = (ids: readonly string[]) =>
  Object.fromEntries(ids.map((id) => [id, true] as const)) as Record<
    string,
    true
  >;
