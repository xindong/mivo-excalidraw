import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import {
  createCustomElementDrawCommands,
  drawCustomElementCommandsToCanvas,
  drawCustomElementCommandsToSvg,
  getCustomElementFileImportDefinitions,
  getCustomElementSelectionStyle,
  registerCustomElement,
  registerCustomElementRenderer,
  shouldRegenerateCustomElementCanvasForScale,
} from "../src/customElement";

import type { CustomElementDrawCommand } from "../src/customElement";
import type { ExcalidrawCustomElement } from "../src/types";

describe("custom element renderer viewBox", () => {
  const unregisterRenderers: Array<() => void> = [];

  afterEach(() => {
    unregisterRenderers.splice(0).forEach((unregister) => unregister());
  });

  it("scales viewBox commands to the resized element bounds", () => {
    unregisterRenderers.push(
      registerCustomElementRenderer({
        id: "test.scaled",
        viewBox: { width: 400, height: 264 },
        render: ({ painter, viewBox }) => {
          painter.rect(0, 0, viewBox.width, viewBox.height);
          painter.text("Footer", 16, 232, { fontSize: 18 });
        },
      }),
    );

    const commands = createCustomElementDrawCommands(
      customElement("test.scaled", 200, 132),
      "light",
    );

    expect(commands).toEqual([
      { type: "save" },
      { type: "scale", scaleX: 0.5, scaleY: 0.5 },
      expect.objectContaining({
        type: "rect",
        width: 400,
        height: 264,
      }),
      expect.objectContaining({
        type: "text",
        text: "Footer",
        fontSize: 18,
      }),
      { type: "restore" },
    ]);
  });

  it("keeps renderers without a viewBox responsive", () => {
    unregisterRenderers.push(
      registerCustomElementRenderer({
        id: "test.responsive",
        render: ({ element, painter, viewBox }) => {
          painter.rect(0, 0, viewBox.width, viewBox.height);
          expect(viewBox).toEqual({
            width: element.width,
            height: element.height,
          });
        },
      }),
    );

    const commands = createCustomElementDrawCommands(
      customElement("test.responsive", 200, 132),
      "light",
    );

    expect(commands).toEqual([
      expect.objectContaining({
        type: "rect",
        width: 200,
        height: 132,
      }),
    ]);
  });

  it("exposes normalized selection geometry from the renderer", () => {
    unregisterRenderers.push(
      registerCustomElementRenderer({
        id: "test.selection",
        selection: {
          padding: 0,
          border: { color: "#5e5ad8", width: 2, radius: 8 },
          transformHandles: { margin: 0, spacing: 0 },
        },
        render: () => undefined,
      }),
    );

    expect(
      getCustomElementSelectionStyle(customElement("test.selection", 200, 132)),
    ).toEqual({
      padding: 0,
      border: { color: "#5e5ad8", width: 2, radius: 8 },
      transformHandles: { margin: 0, spacing: 0 },
    });
  });

  it("applies scale commands to Canvas and SVG consumers", () => {
    const commands: readonly CustomElementDrawCommand[] = [
      { type: "save" },
      { type: "scale", scaleX: 0.5, scaleY: 0.25 },
      { type: "restore" },
    ];
    const context = {
      save: vi.fn(),
      scale: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawCustomElementCommandsToCanvas(context, commands, () => null);
    expect(context.scale).toHaveBeenCalledWith(0.5, 0.25);

    const svg = drawCustomElementCommandsToSvg(
      document,
      commands,
      () => null,
      "test",
    );
    expect(svg.firstElementChild?.getAttribute("transform")).toBe(
      "scale(0.5 0.25)",
    );
  });
});

describe("custom element file import matching", () => {
  const unregisterDefinitions: Array<() => void> = [];

  afterEach(() => {
    unregisterDefinitions.splice(0).forEach((unregister) => unregister());
  });

  it("returns only registered import definitions that accept the file", () => {
    unregisterDefinitions.push(
      registerCustomElement({
        type: "test.image-card",
        schemaVersion: 1,
        rendererId: "test.image-card",
        file: {
          accept: ["image/*"],
          import: async () => ({ data: {} }),
        },
      }),
      registerCustomElement({
        type: "test.audio-card",
        schemaVersion: 1,
        rendererId: "test.audio-card",
        file: {
          accept: ["audio/*"],
          import: async () => ({ data: {} }),
        },
      }),
    );

    expect(
      getCustomElementFileImportDefinitions(
        new File(["image"], "sample.png", { type: "image/png" }),
      ).map(({ type }) => type),
    ).toEqual(["test.image-card"]);
  });
});

describe("custom element canvas cache", () => {
  it("reuses zoom-dependent caches while zoom cache updates are disabled", () => {
    expect(
      shouldRegenerateCustomElementCanvasForScale({ mode: "zoom" }, 1, 2, true),
    ).toBe(false);
    expect(
      shouldRegenerateCustomElementCanvasForScale(undefined, 1, 2, true),
    ).toBe(false);
  });

  it("refreshes zoom-dependent caches after zooming settles", () => {
    expect(
      shouldRegenerateCustomElementCanvasForScale(
        { mode: "zoom" },
        1,
        2,
        false,
      ),
    ).toBe(true);
  });

  it("keeps non-zoom scale changes independent from zoom throttling", () => {
    expect(
      shouldRegenerateCustomElementCanvasForScale(
        { mode: "source", maxScale: 4 },
        1,
        2,
        true,
      ),
    ).toBe(true);
    expect(
      shouldRegenerateCustomElementCanvasForScale(
        { mode: "fixed", scale: 2 },
        2,
        2,
        true,
      ),
    ).toBe(false);
  });
});

const customElement = (rendererId: string, width: number, height: number) =>
  API.createElement({
    type: "custom",
    width,
    height,
    customType: "test.custom",
    rendererId,
    data: {},
  }) as unknown as ExcalidrawCustomElement;
