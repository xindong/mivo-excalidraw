import React from "react";
import { act, render, waitFor } from "@testing-library/react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { CustomElementLifecycleLayer } from "../customElementOverlay/CustomElementLifecycleLayer";
import {
  defineCustomElementExtension,
  registerCustomElementExtension,
} from "../customElementOverlay/registry";
import { CustomElementOverlayRuntime } from "../customElementOverlay/runtime";

import type { AppState, ExcalidrawImperativeAPI } from "../types";

describe("CustomElementLifecycleLayer", () => {
  it("renews its lifecycle signal after a StrictMode editor remount", async () => {
    const onElementsChange = vi.fn();
    const onSelectionChange = vi.fn();
    const unregister = registerCustomElementExtension(
      defineCustomElementExtension({
        definition: {
          type: "test.lifecycle",
          schemaVersion: 1,
        },
        lifecycle: { onElementsChange, onSelectionChange },
      }),
    );
    const element = customElement();
    let editorUnmount = () => {};
    const api = {
      onEvent: vi.fn((name: string, listener?: () => void) => {
        if (name === "editor:unmount" && listener) {
          editorUnmount = listener;
        }
        return () => {};
      }),
    } as unknown as ExcalidrawImperativeAPI;
    const runtime = new CustomElementOverlayRuntime();

    const view = (selected: boolean) => (
      <React.StrictMode>
        <CustomElementLifecycleLayer
          elements={[element]}
          visibleElements={[element]}
          appState={
            {
              selectedElementIds: selected ? { [element.id]: true } : {},
            } as AppState
          }
          api={api}
          assets={null}
          runtime={runtime}
        />
      </React.StrictMode>
    );

    try {
      const rendered = render(view(false));
      await waitFor(() => expect(onElementsChange).toHaveBeenCalled());
      const initialSignal = onElementsChange.mock.calls.at(-1)?.[0]
        .signal as AbortSignal;

      act(() => editorUnmount());
      expect(initialSignal.aborted).toBe(true);

      rendered.rerender(view(true));
      await waitFor(() => expect(onSelectionChange).toHaveBeenCalled());
      const selectionContext = onSelectionChange.mock.calls.at(-1)?.[0];
      expect(selectionContext).toMatchObject({
        isSelected: true,
        previousIsSelected: false,
      });
      expect(selectionContext.signal.aborted).toBe(false);
    } finally {
      act(() => unregister());
    }
  });
});

const customElement = () =>
  ({
    id: "lifecycle-element",
    type: "custom",
    customType: "test.lifecycle",
    schemaVersion: 1,
    rendererId: "test.lifecycle.renderer",
    rendererVersion: 1,
    status: "ready",
    data: {},
    resource: null,
    previewFileId: null,
    isDeleted: false,
  } as unknown as NonDeletedExcalidrawElement);
