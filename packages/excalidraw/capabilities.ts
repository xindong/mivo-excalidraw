import type { ExcalidrawElementType } from "@excalidraw/element/types";

import type { ExcalidrawCapabilities } from "./types";

export const isRotationEnabled = (
  capabilities: ExcalidrawCapabilities | undefined,
) => capabilities?.transforms?.rotation !== false;

export const isDoubleClickEnabled = (
  capabilities: ExcalidrawCapabilities | undefined,
  elementType: ExcalidrawElementType | null,
) => {
  const config = capabilities?.doubleClick;

  if (typeof config === "boolean") {
    return config;
  }

  if (elementType === null) {
    return config?.canvas ?? config?.default ?? true;
  }

  return config?.elementTypes?.[elementType] ?? config?.default ?? true;
};

export const areCapabilitiesEqual = (
  prev: ExcalidrawCapabilities | undefined,
  next: ExcalidrawCapabilities | undefined,
) => {
  if (prev === next) {
    return true;
  }

  if (isRotationEnabled(prev) !== isRotationEnabled(next)) {
    return false;
  }

  const prevDoubleClick = prev?.doubleClick;
  const nextDoubleClick = next?.doubleClick;

  if (
    typeof prevDoubleClick === "boolean" ||
    typeof nextDoubleClick === "boolean"
  ) {
    return prevDoubleClick === nextDoubleClick;
  }

  if (
    (prevDoubleClick?.default ?? true) !== (nextDoubleClick?.default ?? true) ||
    (prevDoubleClick?.canvas ?? prevDoubleClick?.default ?? true) !==
      (nextDoubleClick?.canvas ?? nextDoubleClick?.default ?? true)
  ) {
    return false;
  }

  const elementTypes = new Set([
    ...Object.keys(prevDoubleClick?.elementTypes ?? {}),
    ...Object.keys(nextDoubleClick?.elementTypes ?? {}),
  ]) as Set<ExcalidrawElementType>;

  return [...elementTypes].every(
    (elementType) =>
      isDoubleClickEnabled(prev, elementType) ===
      isDoubleClickEnabled(next, elementType),
  );
};
