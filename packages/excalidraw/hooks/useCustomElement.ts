import { useEffect } from "react";

import {
  registerCustomElement,
  type CustomElementData,
  type CustomElementDefinition,
} from "@excalidraw/element";

/** React lifecycle wrapper around the framework-agnostic registry API. */
export const useRegisterCustomElement = <
  TData extends CustomElementData,
>(
  definition: CustomElementDefinition<TData>,
) => {
  useEffect(() => registerCustomElement(definition), [definition]);
};
