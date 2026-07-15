import { getElementBounds, hashElementsVersion } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";

import { invalidCanvasOperation } from "./errors";

import type {
  CanvasBounds,
  CanvasElementNameResolver,
  CanvasInspectFilter,
} from "./types";

const defaultNameResolver: CanvasElementNameResolver = (element) => {
  const customData = asRecord(element.customData);
  const customDataName = customData?.name;
  if (typeof customDataName === "string" && customDataName.trim()) {
    return customDataName.trim();
  }
  if (element.type === "custom") {
    const name = asRecord(element.data)?.name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }
  return null;
};

export const getCanvasRevision = (
  elements: readonly OrderedExcalidrawElement[],
) =>
  `${elements.length.toString(36)}:${hashElementsVersion(elements).toString(
    36,
  )}`;

export class CanvasSceneIndex {
  public readonly revision: string;
  public readonly elementsMap: SceneElementsMap;
  public readonly visibleElements: readonly OrderedExcalidrawElement[];

  private readonly typeIndex = new Map<string, Set<string>>();
  private readonly groupIndex = new Map<string, Set<string>>();
  private readonly frameIndex = new Map<string, Set<string>>();
  private readonly orderById = new Map<string, number>();
  private readonly bounds = new Map<string, CanvasBounds>();
  private readonly names = new Map<string, string | null>();

  constructor(
    public readonly elements: readonly OrderedExcalidrawElement[],
    private readonly resolveName: CanvasElementNameResolver = defaultNameResolver,
  ) {
    this.revision = getCanvasRevision(elements);
    this.elementsMap = new Map() as SceneElementsMap;
    for (const element of elements) {
      if (this.elementsMap.has(element.id)) {
        throw invalidCanvasOperation(
          `Duplicate canvas element id: ${element.id}`,
        );
      }
      this.elementsMap.set(element.id, element);
    }
    this.visibleElements = elements.filter((element) => !element.isDeleted);

    elements.forEach((element, order) => {
      this.orderById.set(element.id, order);
      this.addToIndex(this.typeIndex, element.type, element.id, true);
      if (element.type === "custom") {
        this.addToIndex(
          this.typeIndex,
          `custom:${element.customType}`,
          element.id,
          true,
        );
      }
      for (const groupId of element.groupIds) {
        this.addToIndex(this.groupIndex, groupId, element.id);
      }
      if (element.frameId) {
        this.addToIndex(this.frameIndex, element.frameId, element.id);
      }
    });
  }

  public getElement = (id: string) => this.elementsMap.get(id);

  public getName = (element: ExcalidrawElement) => {
    if (!this.names.has(element.id)) {
      this.names.set(element.id, this.resolveName(element));
    }
    return this.names.get(element.id) ?? null;
  };

  public getBounds = (element: ExcalidrawElement): CanvasBounds => {
    const cached = this.bounds.get(element.id);
    if (cached) {
      return cached;
    }
    const [x1, y1, x2, y2] = getElementBounds(element, this.elementsMap);
    const bounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    this.bounds.set(element.id, bounds);
    return bounds;
  };

  public candidates = (
    filter: CanvasInspectFilter,
  ): readonly OrderedExcalidrawElement[] => {
    const indexedSets: Set<string>[] = [];
    if (filter.ids?.length) {
      indexedSets.push(new Set(filter.ids));
    }
    if (filter.types?.length) {
      const ids = new Set<string>();
      for (const type of filter.types) {
        this.typeIndex.get(type.toLowerCase())?.forEach((id) => ids.add(id));
      }
      indexedSets.push(ids);
    }
    if (filter.groupIds?.length) {
      const ids = new Set<string>();
      for (const groupId of filter.groupIds) {
        this.groupIndex.get(groupId)?.forEach((id) => ids.add(id));
      }
      indexedSets.push(ids);
    }
    if (filter.frameIds?.length) {
      const ids = new Set<string>();
      for (const frameId of filter.frameIds) {
        this.frameIndex.get(frameId)?.forEach((id) => ids.add(id));
      }
      indexedSets.push(ids);
    }

    if (!indexedSets.length) {
      return filter.includeDeleted ? this.elements : this.visibleElements;
    }

    indexedSets.sort((a, b) => a.size - b.size);
    const [smallest, ...rest] = indexedSets;
    const ids = [...smallest].filter((id) => rest.every((set) => set.has(id)));
    return ids
      .map((id) => this.elementsMap.get(id))
      .filter(
        (element): element is OrderedExcalidrawElement =>
          !!element && (filter.includeDeleted || !element.isDeleted),
      )
      .sort(
        (a, b) =>
          (this.orderById.get(a.id) ?? 0) - (this.orderById.get(b.id) ?? 0),
      );
  };

  private addToIndex = (
    index: Map<string, Set<string>>,
    key: string,
    elementId: string,
    normalize = false,
  ) => {
    const normalized = normalize ? key.toLowerCase() : key;
    const ids = index.get(normalized) ?? new Set<string>();
    ids.add(elementId);
    index.set(normalized, ids);
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
