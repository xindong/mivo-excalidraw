import { CaptureUpdateAction } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { CanvasError } from "./errors";
import { getCanvasCapabilities } from "./capabilities";
import { inspectCanvasScene } from "./inspect";
import { applyCanvasSceneOperations } from "./operations";
import { CanvasSceneIndex, getCanvasRevision } from "./sceneIndex";

import type {
  CanvasApplyRequest,
  CanvasApplyResult,
  CanvasCommand,
  CanvasCommandResult,
  CanvasController,
  CanvasControllerExtension,
  CanvasControllerOptions,
  CanvasElementChange,
  CanvasInspectQuery,
  CanvasInspectResult,
  CanvasOperation,
} from "./types";
import type { ExcalidrawImperativeAPI } from "../types";

export const createCanvasController = (
  api: ExcalidrawImperativeAPI,
  options: CanvasControllerOptions = {},
): CanvasController => new LiveCanvasController(api, options);

class LiveCanvasController implements CanvasController {
  private destroyed = false;
  private queue: Promise<void> = Promise.resolve();
  private cachedElements: readonly OrderedExcalidrawElement[] | null = null;
  private cachedIndex: CanvasSceneIndex | null = null;
  private cachedSceneRevision: number | null = null;
  private readonly extensions = new Map<string, CanvasControllerExtension>();

  constructor(
    private readonly api: ExcalidrawImperativeAPI,
    private readonly options: CanvasControllerOptions,
  ) {
    for (const extension of options.extensions ?? []) {
      if (!extension.namespace) {
        throw new CanvasError(
          "canvas_invalid_operation",
          "Canvas extension namespace cannot be empty",
        );
      }
      if (this.extensions.has(extension.namespace)) {
        throw new CanvasError(
          "canvas_invalid_operation",
          `Duplicate canvas extension namespace: ${extension.namespace}`,
        );
      }
      this.extensions.set(extension.namespace, extension);
    }
  }

  public get isDestroyed() {
    return this.destroyed || this.api.isDestroyed;
  }

  public inspect = (query: CanvasInspectQuery = {}): CanvasInspectResult => {
    this.assertActive();
    const selectedElementIds = this.api.getAppState().selectedElementIds;
    return inspectCanvasScene(
      this.getIndex(),
      new Set(
        Object.keys(selectedElementIds).filter((id) => selectedElementIds[id]),
      ),
      query,
    );
  };

  public apply = (request: CanvasApplyRequest): Promise<CanvasApplyResult> => {
    const run = this.queue.then(() => this.applyNow(request));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  public execute = async (
    command: CanvasCommand,
  ): Promise<CanvasCommandResult> =>
    command.type === "inspect"
      ? this.inspect(command.query)
      : this.apply(command.request);

  public getRevision = () => {
    this.assertActive();
    return this.getIndex().revision;
  };

  public getCapabilities = () =>
    getCanvasCapabilities([...this.extensions.keys()]);

  public destroy = () => {
    this.destroyed = true;
    this.cachedElements = null;
    this.cachedIndex = null;
    this.cachedSceneRevision = null;
    this.extensions.clear();
  };

  private applyNow = async (
    request: CanvasApplyRequest,
  ): Promise<CanvasApplyResult> => {
    this.assertActive();
    if (!request.operations.length) {
      throw new CanvasError(
        "canvas_invalid_operation",
        "Canvas apply requires at least one operation",
      );
    }

    const extensionOperations = request.operations.filter(
      (operation) => operation.type === "extension",
    );
    if (extensionOperations.length) {
      if (request.operations.length !== 1) {
        throw new CanvasError(
          "canvas_invalid_operation",
          "Canvas extension operations cannot be mixed into an atomic scene batch",
        );
      }
      return this.applyExtension(request, extensionOperations[0]);
    }

    let prepared = this.prepareStandardApply(request);
    if (!prepared.sceneChanged && !prepared.viewportChanged) {
      const result = prepared.result;
      await this.options.afterCommit?.(result);
      return result;
    }

    await this.options.beforeCommit?.(request);
    this.assertActive();

    const latestElements = this.getElements();
    const latestAppState = this.api.getAppState();
    if (
      getCanvasRevision(latestElements) !== prepared.previousRevision ||
      latestAppState.editingGroupId !== prepared.editingGroupId ||
      !sameBooleanRecord(
        latestAppState.selectedGroupIds,
        prepared.selectedGroupIds,
      )
    ) {
      prepared = this.prepareStandardApply(request);
    }

    const {
      operationResult,
      selectedElementIds,
      focusElementIds,
      sceneChanged,
      result,
    } = prepared;

    if (sceneChanged || selectedElementIds) {
      this.api.updateScene({
        ...(sceneChanged ? { elements: operationResult.elements } : {}),
        ...(selectedElementIds ? { appState: { selectedElementIds } } : {}),
        ...(sceneChanged
          ? { captureUpdate: CaptureUpdateAction.IMMEDIATELY }
          : {}),
      });
      this.invalidateIndex();
    }

    if (focusElementIds?.length) {
      const nextMap = new Map(
        operationResult.elements.map((element) => [element.id, element]),
      );
      const focusElements = focusElementIds
        .map((id) => nextMap.get(id))
        .filter(
          (element): element is OrderedExcalidrawElement =>
            !!element && !element.isDeleted,
        );
      const viewportOperation = [...request.operations]
        .reverse()
        .find((operation) => operation.type === "viewport");
      this.api.setViewport({
        target: focusElements,
        fit:
          viewportOperation?.type === "viewport"
            ? viewportOperation.fit ?? "scale-down"
            : "scale-down",
        animation:
          viewportOperation?.type === "viewport"
            ? viewportOperation.animate ?? true
            : true,
        offsets: { ui: true },
      });
    }

    await this.options.afterCommit?.(result);
    return result;
  };

  private prepareStandardApply = (request: CanvasApplyRequest) => {
    const beforeElements = this.getElements();
    const previousRevision = getCanvasRevision(beforeElements);
    const appState = this.api.getAppState();
    const operationResult = applyCanvasSceneOperations(
      { elements: beforeElements, appState },
      request.operations,
    );
    const createdElementIds = [...operationResult.createdElementIds];
    const selectedElementIds = request.selectCreated
      ? toSelectedElementIds(createdElementIds)
      : operationResult.selectedElementIds;
    const focusElementIds = request.focusCreated
      ? createdElementIds
      : operationResult.focusElementIds;
    const changes = summarizeChanges(beforeElements, operationResult.elements);
    const sceneChanged =
      changes.length > 0 ||
      hasOrderChanged(beforeElements, operationResult.elements);
    const viewportChanged =
      selectedElementIds !== undefined || focusElementIds !== undefined;
    const result: CanvasApplyResult = {
      ok: true,
      noOp: !sceneChanged && !viewportChanged,
      sceneChanged,
      viewportChanged,
      previousRevision,
      revision: sceneChanged
        ? getCanvasRevision(operationResult.elements)
        : previousRevision,
      elementIds: [...operationResult.touchedElementIds],
      createdElementIds,
      changes,
    };
    return {
      operationResult,
      selectedElementIds,
      focusElementIds,
      sceneChanged,
      viewportChanged,
      previousRevision,
      editingGroupId: appState.editingGroupId,
      selectedGroupIds: appState.selectedGroupIds,
      result,
    };
  };

  private applyExtension = async (
    request: CanvasApplyRequest,
    operation: Extract<CanvasOperation, { type: "extension" }>,
  ): Promise<CanvasApplyResult> => {
    const extension = this.extensions.get(operation.namespace);
    if (!extension) {
      throw new CanvasError(
        "canvas_extension_not_found",
        `Canvas extension not found: ${operation.namespace}`,
      );
    }
    let beforeElements = this.getElements();
    let previousRevision = getCanvasRevision(beforeElements);
    let commitStarted = false;
    const commit = async <T>(
      mutation: (api: ExcalidrawImperativeAPI) => Promise<T> | T,
    ) => {
      if (!commitStarted) {
        await this.options.beforeCommit?.(request);
        this.assertActive();
        beforeElements = this.getElements();
        previousRevision = getCanvasRevision(beforeElements);
        commitStarted = true;
      }
      return mutation(this.api);
    };
    let extensionResult: unknown;
    try {
      extensionResult = await extension.execute({
        operation,
        inspect: this.inspect,
        commit,
      });
    } catch (error) {
      throw new CanvasError(
        "canvas_extension_failed",
        `Canvas extension failed: ${operation.namespace}/${operation.command}`,
        error,
      );
    }
    this.invalidateIndex();
    const afterElements = this.getElements();
    const changes = summarizeChanges(beforeElements, afterElements);
    const revision = getCanvasRevision(afterElements);
    const sceneChanged =
      revision !== previousRevision ||
      changes.length > 0 ||
      hasOrderChanged(beforeElements, afterElements);
    const createdElementIds = changes
      .filter((change) => change.kind === "created")
      .map((change) => change.elementId);
    const result: CanvasApplyResult = {
      ok: true,
      noOp: !sceneChanged,
      sceneChanged,
      viewportChanged: false,
      previousRevision,
      revision,
      elementIds: changes.map((change) => change.elementId),
      createdElementIds,
      changes,
      extension: extensionResult,
    };
    await this.options.afterCommit?.(result);
    return result;
  };

  private getElements = () =>
    this.api.getSceneElementsIncludingDeleted() as readonly OrderedExcalidrawElement[];

  private getIndex = () => {
    const elements = this.getElements();
    const sceneRevision =
      typeof this.api.getSceneRevision === "function"
        ? this.api.getSceneRevision()
        : null;
    if (
      elements !== this.cachedElements ||
      sceneRevision !== this.cachedSceneRevision ||
      !this.cachedIndex
    ) {
      this.cachedElements = elements;
      this.cachedSceneRevision = sceneRevision;
      this.cachedIndex = this.options.resolveElementName
        ? new CanvasSceneIndex(elements, this.options.resolveElementName)
        : new CanvasSceneIndex(elements);
    }
    return this.cachedIndex;
  };

  private invalidateIndex = () => {
    this.cachedElements = null;
    this.cachedIndex = null;
    this.cachedSceneRevision = null;
  };

  private assertActive = () => {
    if (this.isDestroyed) {
      throw new CanvasError(
        "canvas_destroyed",
        "Canvas controller is no longer active",
      );
    }
  };
}

const summarizeChanges = (
  before: readonly OrderedExcalidrawElement[],
  after: readonly OrderedExcalidrawElement[],
): readonly CanvasElementChange[] => {
  const beforeMap = new Map(before.map((element) => [element.id, element]));
  const afterMap = new Map(after.map((element) => [element.id, element]));
  const changes: CanvasElementChange[] = [];
  for (const element of after) {
    const previous = beforeMap.get(element.id);
    if (!previous) {
      changes.push({
        elementId: element.id,
        kind: "created",
        fields: Object.keys(element),
      });
      continue;
    }
    if (previous === element) {
      continue;
    }
    const fields = changedFields(previous, element);
    if (fields.length) {
      changes.push({
        elementId: element.id,
        kind: !previous.isDeleted && element.isDeleted ? "deleted" : "updated",
        fields,
      });
    }
  }
  for (const element of before) {
    if (!afterMap.has(element.id)) {
      changes.push({
        elementId: element.id,
        kind: "deleted",
        fields: ["removed"],
      });
    }
  }
  return changes;
};

const changedFields = (before: ExcalidrawElement, after: ExcalidrawElement) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (key) =>
      !sameElementFieldValue(
        (before as unknown as Record<string, unknown>)[key],
        (after as unknown as Record<string, unknown>)[key],
      ),
  );

const sameElementFieldValue = (before: unknown, after: unknown) => {
  if (Object.is(before, after)) {
    return true;
  }
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object"
  ) {
    return false;
  }
  try {
    return JSON.stringify(before) === JSON.stringify(after);
  } catch {
    return false;
  }
};

const hasOrderChanged = (
  before: readonly OrderedExcalidrawElement[],
  after: readonly OrderedExcalidrawElement[],
) =>
  before.length !== after.length ||
  before.some((element, index) => element.id !== after[index]?.id);

const toSelectedElementIds = (ids: readonly string[]) =>
  Object.fromEntries(ids.map((id) => [id, true] as const)) as Record<
    string,
    true
  >;

const sameBooleanRecord = (
  a: Readonly<Record<string, boolean>>,
  b: Readonly<Record<string, boolean>>,
) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => Boolean(a[key]) === Boolean(b[key]));
};
