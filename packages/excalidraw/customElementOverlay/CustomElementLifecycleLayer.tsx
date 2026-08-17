import { useEffect, useMemo, useRef, useState } from "react";

import { deepCopyElement, isCustomElement } from "@excalidraw/element";

import type {
  CustomElementAssetStore,
  TypedExcalidrawCustomElement,
} from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import {
  getCustomElementExtensionRevision,
  getCustomElementLifecycleRegistration,
  subscribeCustomElementExtensions,
} from "./registry";

import type { CustomElementOverlayRuntime } from "./runtime";
import type { CustomElementLifecycleContext } from "./types";
import type { AppState, ExcalidrawImperativeAPI } from "../types";

type LifecycleRegistration = NonNullable<
  ReturnType<typeof getCustomElementLifecycleRegistration>
>;

type ElementSet = Readonly<{
  registration: LifecycleRegistration;
  elements: Map<string, TypedExcalidrawCustomElement<any>>;
}>;

type ElementState = Readonly<{
  registration: LifecycleRegistration;
  selected: boolean;
  inViewport: boolean;
}>;

type LifecycleElementSnapshot = Readonly<{
  element: TypedExcalidrawCustomElement<any>;
  customType: string;
  schemaVersion: number;
  rendererId: string;
  rendererVersion: number;
  status: TypedExcalidrawCustomElement<any>["status"];
  data: TypedExcalidrawCustomElement<any>["data"];
  resource: TypedExcalidrawCustomElement<any>["resource"];
  previewFileId: TypedExcalidrawCustomElement<any>["previewFileId"];
  customData: TypedExcalidrawCustomElement<any>["customData"];
}>;

const useRegistryRevision = () => {
  const [revision, setRevision] = useState(getCustomElementExtensionRevision);
  useEffect(() => {
    const update = () => setRevision(getCustomElementExtensionRevision());
    const unsubscribe = subscribeCustomElementExtensions(update);
    update();
    return unsubscribe;
  }, []);
  return revision;
};

const reportLifecycleError = (name: string, error: unknown) => {
  console.error(`Custom element ${name} lifecycle failed`, error);
};

const invokeLifecycle = (
  name: string,
  callback: () => void | Promise<void>,
  signal: AbortSignal,
) => {
  if (signal.aborted) {
    return;
  }
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      void result.catch((error) => {
        if (!signal.aborted) {
          reportLifecycleError(name, error);
        }
      });
    }
  } catch (error) {
    reportLifecycleError(name, error);
  }
};

const hasCustomLifecycleUpdate = (
  previous: LifecycleElementSnapshot,
  current: TypedExcalidrawCustomElement<any>,
) =>
  previous.customType !== current.customType ||
  previous.schemaVersion !== current.schemaVersion ||
  previous.rendererId !== current.rendererId ||
  previous.rendererVersion !== current.rendererVersion ||
  previous.status !== current.status ||
  previous.data !== current.data ||
  previous.resource !== current.resource ||
  previous.previewFileId !== current.previewFileId ||
  previous.customData !== current.customData;

const snapshotLifecycleElement = (
  element: TypedExcalidrawCustomElement<any>,
): LifecycleElementSnapshot => ({
  element: deepCopyElement(element),
  customType: element.customType,
  schemaVersion: element.schemaVersion,
  rendererId: element.rendererId,
  rendererVersion: element.rendererVersion,
  status: element.status,
  data: element.data,
  resource: element.resource,
  previewFileId: element.previewFileId,
  customData: element.customData,
});

const addSymmetricDifference = (
  target: Set<string>,
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
) => {
  for (const id of previous) {
    if (!current.has(id)) {
      target.add(id);
    }
  }
  for (const id of current) {
    if (!previous.has(id)) {
      target.add(id);
    }
  }
};

export const CustomElementLifecycleLayer = ({
  elements,
  visibleElements,
  appState,
  api,
  assets,
  runtime,
  changedElementIds,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  visibleElements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  runtime: CustomElementOverlayRuntime;
  changedElementIds?: ReadonlySet<string>;
}) => {
  const registryRevision = useRegistryRevision();
  const [abortController, setAbortController] = useState(
    () => new AbortController(),
  );
  const elementSets = useRef(new Map<string, ElementSet>());
  const elementSnapshots = useRef(new Map<string, LifecycleElementSnapshot>());
  const elementStates = useRef(new Map<string, ElementState>());
  const contentRegistryRevision = useRef<number | null>(null);
  const stateRegistryRevision = useRef<number | null>(null);
  const previousSelectedIds = useRef<ReadonlySet<string>>(new Set());
  const previousVisibleIds = useRef<ReadonlySet<string>>(new Set());
  const elementsMap = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const contentDirtyIds = useMemo(
    () => changedElementIds ?? new Set(elements.map((element) => element.id)),
    [changedElementIds, elements],
  );
  const visibleElementIds = useMemo(
    () => new Set(visibleElements.map((element) => element.id)),
    [visibleElements],
  );

  useEffect(() => {
    if (abortController.signal.aborted) {
      setAbortController(new AbortController());
      return;
    }
    const unsubscribe = api.onEvent("editor:unmount", () => {
      abortController.abort();
      // React StrictMode simulates an editor unmount while preserving Hook
      // state. Renew the scope when this layer survives that event so the
      // remounted editor does not inherit a permanently aborted signal.
      setAbortController((current) =>
        current === abortController ? new AbortController() : current,
      );
    });
    return () => {
      unsubscribe();
      abortController.abort();
    };
  }, [abortController, api]);

  useEffect(() => {
    const registryChanged =
      contentRegistryRevision.current !== registryRevision;
    contentRegistryRevision.current = registryRevision;
    const dirtyIds = registryChanged
      ? new Set([...elementSnapshots.current.keys(), ...elementsMap.keys()])
      : contentDirtyIds;
    const changes: Array<{
      customType: string;
      registration: LifecycleRegistration;
      added: TypedExcalidrawCustomElement<any>[];
      updated: Array<{
        previous: TypedExcalidrawCustomElement<any>;
        current: TypedExcalidrawCustomElement<any>;
      }>;
      removed: TypedExcalidrawCustomElement<any>[];
    }> = [];
    const getChanges = (
      customType: string,
      registration: LifecycleRegistration,
    ) => {
      let entry = changes.find(
        (change) =>
          change.customType === customType &&
          change.registration === registration,
      );
      if (!entry) {
        entry = {
          customType,
          registration,
          added: [],
          updated: [],
          removed: [],
        };
        changes.push(entry);
      }
      return entry;
    };
    const baseContext = {
      appState,
      api,
      assets,
      signal: abortController.signal,
    };
    for (const elementId of dirtyIds) {
      const previous = elementSnapshots.current.get(elementId);
      const currentElement = elementsMap.get(elementId);
      const current =
        currentElement && isCustomElement(currentElement)
          ? currentElement
          : null;
      const previousSet = previous
        ? elementSets.current.get(previous.customType)
        : undefined;
      const previousRegistration = previousSet?.registration;
      const currentRegistration = current
        ? getCustomElementLifecycleRegistration(current.customType)
        : null;

      if (
        previous &&
        previousRegistration?.lifecycle.onElementsChange &&
        (!current ||
          current.customType !== previous.customType ||
          currentRegistration !== previousRegistration)
      ) {
        previousSet?.elements.delete(elementId);
        getChanges(previous.customType, previousRegistration).removed.push(
          previous.element,
        );
      }

      if (current && currentRegistration?.lifecycle.onElementsChange) {
        let currentSet = elementSets.current.get(current.customType);
        if (!currentSet || currentSet.registration !== currentRegistration) {
          currentSet = {
            registration: currentRegistration,
            elements: new Map(),
          };
          elementSets.current.set(current.customType, currentSet);
        }
        currentSet.elements.set(elementId, current);
        const currentChanges = getChanges(
          current.customType,
          currentRegistration,
        );
        if (
          !previous ||
          previous.customType !== current.customType ||
          previousRegistration !== currentRegistration
        ) {
          currentChanges.added.push(current);
        } else if (hasCustomLifecycleUpdate(previous, current)) {
          currentChanges.updated.push({ previous: previous.element, current });
        }
      }

      if (current) {
        elementSnapshots.current.set(
          elementId,
          snapshotLifecycleElement(current),
        );
      } else {
        elementSnapshots.current.delete(elementId);
        elementStates.current.delete(elementId);
      }
    }

    for (const change of changes) {
      const { customType } = change;
      if (
        !change.added.length &&
        !change.updated.length &&
        !change.removed.length
      ) {
        continue;
      }
      const currentSet = elementSets.current.get(customType);
      invokeLifecycle(
        "elements",
        () =>
          change.registration.lifecycle.onElementsChange?.({
            ...baseContext,
            customType,
            elements:
              currentSet?.registration === change.registration
                ? [...currentSet.elements.values()]
                : [],
            added: change.added,
            updated: change.updated,
            removed: change.removed,
          }),
        abortController.signal,
      );
    }
  }, [
    abortController,
    api,
    appState,
    assets,
    contentDirtyIds,
    elementsMap,
    registryRevision,
  ]);

  useEffect(() => {
    const selectedIds = new Set(
      Object.keys(appState.selectedElementIds).filter(
        (elementId) => appState.selectedElementIds[elementId],
      ),
    );
    const registryChanged = stateRegistryRevision.current !== registryRevision;
    stateRegistryRevision.current = registryRevision;
    const dirtyIds = registryChanged
      ? new Set(elementsMap.keys())
      : new Set(contentDirtyIds);
    addSymmetricDifference(dirtyIds, previousSelectedIds.current, selectedIds);
    addSymmetricDifference(
      dirtyIds,
      previousVisibleIds.current,
      visibleElementIds,
    );
    previousSelectedIds.current = selectedIds;
    previousVisibleIds.current = visibleElementIds;

    for (const elementId of dirtyIds) {
      const element = elementsMap.get(elementId);
      if (!element || !isCustomElement(element)) {
        elementStates.current.delete(elementId);
        continue;
      }
      const registration = getCustomElementLifecycleRegistration(
        element.customType,
      );
      if (!registration) {
        continue;
      }
      const lifecycle = registration.lifecycle;
      const selected = !!appState.selectedElementIds[element.id];
      const inViewport = visibleElementIds.has(element.id);
      const previous = elementStates.current.get(element.id);
      const sameRegistration = previous?.registration === registration;
      const previousSelected = sameRegistration ? previous.selected : false;
      const previousInViewport = sameRegistration ? previous.inViewport : false;
      elementStates.current.set(element.id, {
        registration,
        selected,
        inViewport,
      });

      const baseContext: CustomElementLifecycleContext<any> = {
        element,
        appState,
        api,
        assets,
        runtime,
        signal: abortController.signal,
      };
      if (lifecycle.onSelectionChange && selected !== previousSelected) {
        invokeLifecycle(
          "selection",
          () =>
            lifecycle.onSelectionChange?.({
              ...baseContext,
              isSelected: selected,
              previousIsSelected: previousSelected,
            }),
          abortController.signal,
        );
      }
      if (lifecycle.onViewportChange && inViewport !== previousInViewport) {
        invokeLifecycle(
          "viewport",
          () =>
            lifecycle.onViewportChange?.({
              ...baseContext,
              isInViewport: inViewport,
              previousIsInViewport: previousInViewport,
            }),
          abortController.signal,
        );
      }
    }
  }, [
    abortController,
    api,
    appState,
    assets,
    contentDirtyIds,
    elementsMap,
    registryRevision,
    runtime,
    visibleElementIds,
  ]);

  return null;
};
