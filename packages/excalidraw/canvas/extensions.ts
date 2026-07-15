import type {
  CanvasControllerExtension,
  CanvasExtensionContext,
  CanvasOperation,
} from "./types";

export type TypedCanvasExtensionContext<
  TCommand extends string,
  TPayload,
> = Omit<CanvasExtensionContext, "operation"> &
  Readonly<{
    operation: Omit<
      Extract<CanvasOperation, { type: "extension" }>,
      "command" | "payload"
    > &
      Readonly<{
        command: TCommand;
        payload: TPayload;
      }>;
  }>;

export type TypedCanvasControllerExtension<
  TCommand extends string,
  TPayload,
  TResult,
> = Readonly<{
  namespace: string;
  execute: (
    context: TypedCanvasExtensionContext<TCommand, TPayload>,
  ) => Promise<TResult> | TResult;
}>;

export const defineCanvasControllerExtension = <
  TCommand extends string,
  TPayload = unknown,
  TResult = unknown,
>(
  extension: TypedCanvasControllerExtension<TCommand, TPayload, TResult>,
): CanvasControllerExtension =>
  extension as unknown as CanvasControllerExtension;
