import type { CanvasCapabilities } from "./types";

const STANDARD_OPERATIONS = [
  "create",
  "patch",
  "transform",
  "duplicate",
  "delete",
  "group",
  "ungroup",
  "connect",
  "layout",
  "arrange",
  "viewport",
  "extension",
] as const;

const INSPECT_FIELDS = [
  "position",
  "size",
  "text",
  "state",
  "style",
  "groups",
  "bindings",
  "custom",
  "raw",
] as const;

export const CANVAS_CORE_PROTOCOL_VERSION = 1 as const;

export const getCanvasCapabilities = (
  extensions: readonly string[] = [],
): CanvasCapabilities => ({
  protocolVersion: CANVAS_CORE_PROTOCOL_VERSION,
  commands: ["inspect", "apply"],
  operations: STANDARD_OPERATIONS,
  createKinds: ["text", "shape", "custom"],
  inspectFields: INSPECT_FIELDS,
  extensions: [...extensions],
});
