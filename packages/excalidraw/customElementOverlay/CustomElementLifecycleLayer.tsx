import { useEffect, useMemo, useRef, useState } from "react";

import { isCustomElement } from "@excalidraw/element";

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
  previous: TypedExcalidrawCustomElement<any>,
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

export const CustomElementLifecycleLayer = ({
  elements,
  visibleElements,
  appState,
  api,
  assets,
  runtime,
}: {
  elements: readonly NonDeletedExcalidrawElement[];
  visibleElements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  api: ExcalidrawImperativeAPI;
  assets: CustomElementAssetStore | null;
  runtime: CustomElementOverlayRuntime;
}) => {
  const registryRevision = useRegistryRevision();
  const [abortController, setAbortController] = useState(
    () => new AbortController(),
  );
  const elementSets = useRef(new Map<string, ElementSet>());
  const elementStates = useRef(new Map<string, ElementState>());
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
    const nextSets = new Map<string, ElementSet>();
    for (const element of elements) {
      if (!isCustomElement(element)) {
        continue;
      }
      const registration = getCustomElementLifecycleRegistration(
        element.customType,
      );
      if (!registration?.lifecycle.onElementsChange) {
        continue;
      }
      let entry = nextSets.get(element.customType);
      if (!entry) {
        entry = { registration, elements: new Map() };
        nextSets.set(element.customType, entry);
      }
      entry.elements.set(element.id, element);
    }

    const baseContext = {
      appState,
      api,
      assets,
      signal: abortController.signal,
    };
    for (const [customType, previousSet] of elementSets.current) {
      const nextSet = nextSets.get(customType);
      if (nextSet?.registration === previousSet.registration) {
        continue;
      }
      invokeLifecycle(
        "elements",
        () =>
          previousSet.registration.lifecycle.onElementsChange?.({
            ...baseContext,
            customType,
            elements: [],
            added: [],
            updated: [],
            removed: [...previousSet.elements.values()],
          }),
        abortController.signal,
      );
    }

    for (const [customType, nextSet] of nextSets) {
      const previousSet = elementSets.current.get(customType);
      const sameRegistration =
        previousSet?.registration === nextSet.registration;
      const previousElements =
        sameRegistration && previousSet
          ? previousSet.elements
          : new Map<string, TypedExcalidrawCustomElement<any>>();
      const added: TypedExcalidrawCustomElement<any>[] = [];
      const updated: Array<{
        previous: TypedExcalidrawCustomElement<any>;
        current: TypedExcalidrawCustomElement<any>;
      }> = [];
      const removed: TypedExcalidrawCustomElement<any>[] = [];

      for (const element of nextSet.elements.values()) {
        const previous = previousElements.get(element.id);
        if (!previous) {
          added.push(element);
        } else if (hasCustomLifecycleUpdate(previous, element)) {
          updated.push({ previous, current: element });
        }
      }
      for (const element of previousElements.values()) {
        if (!nextSet.elements.has(element.id)) {
          removed.push(element);
        }
      }
      if (!added.length && !updated.length && !removed.length) {
        continue;
      }

      invokeLifecycle(
        "elements",
        () =>
          nextSet.registration.lifecycle.onElementsChange?.({
            ...baseContext,
            customType,
            elements: [...nextSet.elements.values()],
            added,
            updated,
            removed,
          }),
        abortController.signal,
      );
    }
    elementSets.current = nextSets;
  }, [abortController, api, appState, assets, elements, registryRevision]);

  useEffect(() => {
    const nextStates = new Map<string, ElementState>();
    for (const element of elements) {
      if (!isCustomElement(element)) {
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
      nextStates.set(element.id, { registration, selected, inViewport });

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
    elementStates.current = nextStates;
  }, [
    abortController,
    api,
    appState,
    assets,
    elements,
    registryRevision,
    runtime,
    visibleElementIds,
  ]);

  return null;
};
