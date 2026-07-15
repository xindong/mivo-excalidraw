import { useEffect } from "react";

import {
  registerCustomElement,
  type CustomElementData,
  type CustomElementDefinition,
} from "@excalidraw/element";

import {
  registerCustomElementOverlays,
  registerCustomElementWithOverlays,
} from "../customElementOverlay/registry";

import type {
  CustomElementOverlayDefinition,
  CustomElementWithOverlays,
} from "../customElementOverlay/types";

export function useRegisterCustomElement<TData extends CustomElementData>(
  definition: CustomElementDefinition<TData>,
): void;
export function useRegisterCustomElement<TData extends CustomElementData>(
  extension: CustomElementWithOverlays<TData>,
): void;
/** React lifecycle wrapper for the core definition and optional DOM overlays. */
export function useRegisterCustomElement<TData extends CustomElementData>(
  input: CustomElementDefinition<TData> | CustomElementWithOverlays<TData>,
) {
  useEffect(
    () =>
      "definition" in input
        ? registerCustomElementWithOverlays(input)
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
