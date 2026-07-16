import { useEffect } from "react";

import {
  registerCustomElement,
  type CustomElementData,
  type CustomElementDefinition,
} from "@excalidraw/element";
import type { CustomElementValue } from "@excalidraw/element/types";

import {
  registerCustomElementOverlays,
  registerCustomElementExtension,
} from "../customElementOverlay/registry";

import type {
  CustomElementExtension,
  CustomElementOverlayDefinition,
} from "../customElementOverlay/types";

export function useRegisterCustomElement<
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(definition: CustomElementDefinition<TData, TPreviewRequest>): void;
export function useRegisterCustomElement<
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(extension: CustomElementExtension<TData, TPreviewRequest>): void;
/** React lifecycle wrapper for the core definition and optional DOM overlays. */
export function useRegisterCustomElement<
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(
  input:
    | CustomElementDefinition<TData, TPreviewRequest>
    | CustomElementExtension<TData, TPreviewRequest>,
) {
  useEffect(
    () =>
      "definition" in input
        ? registerCustomElementExtension(input)
        : registerCustomElement(input),
    [input],
  );
}

export const useRegisterCustomElementOverlays = <
  TData extends CustomElementData,
>(
  customType: string,
  overlays: readonly CustomElementOverlayDefinition<TData, any>[],
) => {
  useEffect(
    () => registerCustomElementOverlays(customType, overlays),
    [customType, overlays],
  );
};
