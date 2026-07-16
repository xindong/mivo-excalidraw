import { useEffect, useState } from "react";

import type { CustomElementAssetStore } from "@excalidraw/element";
import type { CustomElementResource } from "@excalidraw/element/types";

export type CustomElementResourceState = Readonly<{
  status: "idle" | "loading" | "ready" | "error";
  value: Blob | File | string | null;
  url: string | null;
  error: Error | null;
}>;

const IDLE_RESOURCE_STATE: CustomElementResourceState = {
  status: "idle",
  value: null,
  url: null,
  error: null,
};

export const useCustomElementResource = (
  resource: CustomElementResource | null,
  assets: CustomElementAssetStore | null,
): CustomElementResourceState => {
  const [state, setState] =
    useState<CustomElementResourceState>(IDLE_RESOURCE_STATE);

  useEffect(() => {
    if (!resource || !assets) {
      setState(IDLE_RESOURCE_STATE);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ status: "loading", value: null, url: null, error: null });

    void assets
      .resolve(resource, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) {
          return;
        }
        if (value instanceof Blob) {
          objectUrl = URL.createObjectURL(value);
        }
        setState({
          status: "ready",
          value,
          url: typeof value === "string" ? value : objectUrl,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: "error",
          value: null,
          url: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assets, resource]);

  return state;
};
