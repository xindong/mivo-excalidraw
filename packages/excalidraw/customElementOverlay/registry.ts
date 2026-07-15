import { registerCustomElement } from "@excalidraw/element";

import type { CustomElementData } from "@excalidraw/element";

import type {
  CustomElementOverlayDefinition,
  CustomElementWithOverlays,
} from "./types";

type RegistryEntry = Readonly<{
  definition: CustomElementOverlayDefinition<any, any>;
  owner: symbol;
}>;

const registry = new Map<string, Map<string, RegistryEntry>>();
const listeners = new Set<() => void>();
let revision = 0;

const emit = () => {
  revision++;
  listeners.forEach((listener) => listener());
};

export const subscribeCustomElementOverlays = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCustomElementOverlayRevision = () => revision;

export const getCustomElementOverlays = (customType: string) =>
  Array.from(
    registry.get(customType)?.values() ?? [],
    (entry) => entry.definition,
  );

export const defineCustomElementOverlay = <
  TData extends CustomElementData,
  TState = unknown,
>(
  overlay: CustomElementOverlayDefinition<TData, TState>,
) => overlay;

export const registerCustomElementOverlays = <TData extends CustomElementData>(
  customType: string,
  overlays: readonly CustomElementOverlayDefinition<TData, any>[],
) => {
  if (!customType) {
    throw new Error("Custom element overlays require a non-empty customType");
  }

  const ids = new Set<string>();
  for (const overlay of overlays) {
    if (!overlay.id) {
      throw new Error("Custom element overlay requires a non-empty id");
    }
    if (ids.has(overlay.id)) {
      throw new Error(
        `Duplicate custom element overlay id \"${overlay.id}\" for \"${customType}\"`,
      );
    }
    ids.add(overlay.id);
  }

  if (!overlays.length) {
    return () => {};
  }

  const owner = Symbol(customType);
  let typeRegistry = registry.get(customType);
  if (!typeRegistry) {
    typeRegistry = new Map();
    registry.set(customType, typeRegistry);
  }
  for (const overlay of overlays) {
    typeRegistry.set(overlay.id, {
      definition: overlay,
      owner,
    });
  }
  if (overlays.length) {
    emit();
  }

  return () => {
    const currentTypeRegistry = registry.get(customType);
    if (!currentTypeRegistry) {
      return;
    }
    let changed = false;
    for (const overlay of overlays) {
      if (currentTypeRegistry.get(overlay.id)?.owner === owner) {
        currentTypeRegistry.delete(overlay.id);
        changed = true;
      }
    }
    if (!currentTypeRegistry.size) {
      registry.delete(customType);
    }
    if (changed) {
      emit();
    }
  };
};

export const unregisterCustomElementOverlays = (
  customType: string,
  overlayId?: string,
) => {
  const typeRegistry = registry.get(customType);
  if (!typeRegistry) {
    return;
  }
  const changed =
    overlayId === undefined
      ? registry.delete(customType)
      : typeRegistry.delete(overlayId);
  if (overlayId !== undefined && !typeRegistry.size) {
    registry.delete(customType);
  }
  if (changed) {
    emit();
  }
};

export const defineCustomElementWithOverlays = <
  TData extends CustomElementData,
>(
  extension: CustomElementWithOverlays<TData>,
) => extension;

export const registerCustomElementWithOverlays = <
  TData extends CustomElementData,
>(
  extension: CustomElementWithOverlays<TData>,
) => {
  const unregisterElement = registerCustomElement(extension.definition);
  let unregisterOverlays: (() => void) | null = null;
  try {
    unregisterOverlays = extension.overlays?.length
      ? registerCustomElementOverlays(
          extension.definition.type,
          extension.overlays,
        )
      : null;
  } catch (error) {
    unregisterElement();
    throw error;
  }

  return () => {
    unregisterOverlays?.();
    unregisterElement();
  };
};
