export type CanvasErrorCode =
  | "canvas_destroyed"
  | "canvas_invalid_operation"
  | "canvas_element_not_found"
  | "canvas_extension_not_found"
  | "canvas_extension_failed";

export class CanvasError extends Error {
  public readonly code: CanvasErrorCode;
  public readonly details?: unknown;

  constructor(code: CanvasErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CanvasError";
    this.code = code;
    this.details = details;
  }
}

export const invalidCanvasOperation = (message: string, details?: unknown) =>
  new CanvasError("canvas_invalid_operation", message, details);
