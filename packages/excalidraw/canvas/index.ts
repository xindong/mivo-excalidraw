export { CanvasError } from "./errors";
export {
  CANVAS_CORE_PROTOCOL_VERSION,
  getCanvasCapabilities,
} from "./capabilities";
export { createCanvasController } from "./controller";
export { defineCanvasControllerExtension } from "./extensions";
export { inspectCanvasScene } from "./inspect";
export { applyCanvasSceneOperations } from "./operations";
export { CanvasSceneIndex, getCanvasRevision } from "./sceneIndex";
export type { CanvasErrorCode } from "./errors";

export type {
  CanvasApplyRequest,
  CanvasApplyResult,
  CanvasBounds,
  CanvasCommand,
  CanvasCommandResult,
  CanvasCapabilities,
  CanvasController,
  CanvasControllerExtension,
  CanvasControllerOptions,
  CanvasCreateItem,
  CanvasElementChange,
  CanvasElementNameResolver,
  CanvasElementPatch,
  CanvasElementProjection,
  CanvasExtensionContext,
  CanvasInspectField,
  CanvasInspectFilter,
  CanvasInspectQuery,
  CanvasInspectResult,
  CanvasInspectSearchField,
  CanvasLayoutOperation,
  CanvasOperation,
  CanvasPoint,
  CanvasSceneOperationResult,
  CanvasSceneSnapshot,
} from "./types";
export type {
  TypedCanvasControllerExtension,
  TypedCanvasExtensionContext,
} from "./extensions";
