import { registerCustomElement } from "@excalidraw/element";

import type { CustomElementData } from "@excalidraw/element";
import type { CustomElementValue } from "@excalidraw/element/types";

import type {
  CustomElementExtension,
  CustomElementOverlayDefinition,
} from "./types";

type RegistryEntry = Readonly<{
  definition: CustomElementOverlayDefinition<any, any>;
  owner: symbol;
}>;

const registry = new Map<string, Map<string, RegistryEntry>>();
const lifecycleRegistry = new Map<
  string,
  Readonly<{
    lifecycle: NonNullable<CustomElementExtension<any>["lifecycle"]>;
    owner: symbol;
  }>
>();
const listeners = new Set<() => void>();
let revision = 0;

const emit = () => {
  revision++;
  listeners.forEach((listener) => listener());
};

export const subscribeCustomElementExtensions = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getCustomElementExtensionRevision = () => revision;

// Backwards-compatible names for lower-level Overlay consumers.
export const subscribeCustomElementOverlays = subscribeCustomElementExtensions;
export const getCustomElementOverlayRevision = getCustomElementExtensionRevision;

export const getCustomElementOverlays = (customType: string) =>
  Array.from(
    registry.get(customType)?.values() ?? [],
    (entry) => entry.definition,
  );

export const getCustomElementLifecycleRegistration = (customType: string) =>
  lifecycleRegistry.get(customType) ?? null;

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

export const defineCustomElementExtension = <
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(
  extension: CustomElementExtension<TData, TPreviewRequest>,
) => extension;

export const registerCustomElementExtension = <
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(
  extension: CustomElementExtension<TData, TPreviewRequest>,
) => {
  const unregisterElement = registerCustomElement(extension.definition);
  let unregisterOverlays: (() => void) | null = null;
  const lifecycleOwner = Symbol(extension.definition.type);
  try {
    unregisterOverlays = extension.overlays?.length
      ? registerCustomElementOverlays(
          extension.definition.type,
          extension.overlays,
        )
      : null;
    if (extension.lifecycle) {
      lifecycleRegistry.set(extension.definition.type, {
        lifecycle: extension.lifecycle,
        owner: lifecycleOwner,
      });
      emit();
    }
  } catch (error) {
    unregisterElement();
    throw error;
  }

  return () => {
    const lifecycleEntry = lifecycleRegistry.get(extension.definition.type);
    if (lifecycleEntry?.owner === lifecycleOwner) {
      lifecycleRegistry.delete(extension.definition.type);
      emit();
    }
    unregisterOverlays?.();
    unregisterElement();
  };
};
