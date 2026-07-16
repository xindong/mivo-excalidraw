import React from "react";

import { arrayToMap, CURSOR_TYPE } from "@excalidraw/common";
import { getTransformHandles } from "@excalidraw/element";

import { Excalidraw } from "../index";
import {
  areCapabilitiesEqual,
  isDoubleClickEnabled,
  isResizeEnabled,
} from "../capabilities";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import {
  GlobalTestState,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
} from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

beforeEach(() => {
  localStorage.clear();
  mouse.reset();
  mockBoundingClientRect();
});

afterEach(() => {
  restoreOriginalGetBoundingClientRect();
});

describe("capability resolution", () => {
  it("resolves double-click overrides by canvas and element type", () => {
    const capabilities = {
      doubleClick: {
        default: false,
        canvas: true,
        elementTypes: { rectangle: true },
      },
    } as const;

    expect(isDoubleClickEnabled(capabilities, null)).toBe(true);
    expect(isDoubleClickEnabled(capabilities, "rectangle")).toBe(true);
    expect(isDoubleClickEnabled(capabilities, "ellipse")).toBe(false);
  });

  it("compares inline capability configs semantically", () => {
    expect(
      areCapabilitiesEqual(
        {
          transforms: { rotation: false },
          doubleClick: { canvas: false, elementTypes: { image: false } },
        },
        {
          transforms: { rotation: false },
          doubleClick: { canvas: false, elementTypes: { image: false } },
        },
      ),
    ).toBe(true);
  });

  it("resolves resize overrides by element type", () => {
    const capabilities = {
      transforms: {
        resize: {
          default: true,
          elementTypes: { custom: false },
        },
      },
    } as const;

    expect(isResizeEnabled(capabilities, "custom")).toBe(false);
    expect(isResizeEnabled(capabilities, "rectangle")).toBe(true);
  });

  it("compares resize capability configs semantically", () => {
    expect(
      areCapabilitiesEqual(
        {
          transforms: {
            resize: { default: true, elementTypes: { custom: false } },
          },
        },
        {
          transforms: {
            resize: { elementTypes: { custom: false } },
          },
        },
      ),
    ).toBe(true);
  });
});

describe("double-click capabilities", () => {
  it("can disable double-click actions on empty canvas", async () => {
    await render(
      <Excalidraw capabilities={{ doubleClick: { canvas: false } }} />,
    );

    mouse.doubleClickAt(80, 80);

    expect(h.state.editingTextElement).toBe(null);
    expect(h.elements).toHaveLength(0);
  });

  it("can disable double-click actions for an element type", async () => {
    await render(
      <Excalidraw
        capabilities={{
          doubleClick: { elementTypes: { rectangle: false } },
        }}
      />,
    );
    const rectangle = UI.createElement("rectangle", { size: 100 });

    mouse.doubleClickOn(rectangle);

    expect(h.state.editingTextElement).toBe(null);
    expect(h.elements.some((element) => element.type === "text")).toBe(false);
  });

  it("allows an element type to override a disabled default", async () => {
    await render(
      <Excalidraw
        capabilities={{
          doubleClick: {
            default: false,
            elementTypes: { rectangle: true },
          },
        }}
      />,
    );
    const rectangle = UI.createElement("rectangle", { size: 100 });

    mouse.doubleClickOn(rectangle);

    expect(h.state.editingTextElement).not.toBe(null);
  });

  it("can disable image crop activation", async () => {
    await render(
      <Excalidraw
        capabilities={{
          doubleClick: { elementTypes: { image: false } },
        }}
      />,
    );
    const image = API.createElement({ type: "image", width: 200, height: 100 });
    API.setElements([image]);
    API.setAppState({ selectedElementIds: { [image.id]: true } });

    mouse.doubleClickOn(image);

    expect(h.state.croppingElementId).toBe(null);
  });
});

describe("rotation capability", () => {
  it("removes rotation hover and pointer interaction", async () => {
    await render(
      <Excalidraw capabilities={{ transforms: { rotation: false } }} />,
    );
    const rectangle = UI.createElement("rectangle", {
      width: 200,
      height: 100,
    });
    const rotationHandle = getTransformHandles(
      rectangle,
      h.state.zoom,
      arrayToMap(h.elements),
      "mouse",
      {},
    ).rotation!;
    const handleCenter = [
      rotationHandle[0] + rotationHandle[2] / 2,
      rotationHandle[1] + rotationHandle[3] / 2,
    ] as const;

    mouse.moveTo(...handleCenter);
    expect(GlobalTestState.interactiveCanvas.style.cursor).not.toBe(
      CURSOR_TYPE.GRAB,
    );

    UI.rotate(rectangle, [50, 50]);
    expect(rectangle.angle).toBe(0);
  });

  it("disables rotation for multi-element selections", async () => {
    await render(
      <Excalidraw capabilities={{ transforms: { rotation: false } }} />,
    );
    const first = UI.createElement("rectangle", { x: 0, y: 0, size: 100 });
    const second = UI.createElement("ellipse", { x: 200, y: 0, size: 100 });

    UI.rotate([first, second], [50, 50]);

    expect(first.angle).toBe(0);
    expect(second.angle).toBe(0);
  });
});

describe("resize capability", () => {
  it("removes resize pointer interaction for a configured element type", async () => {
    await render(
      <Excalidraw
        capabilities={{
          transforms: { resize: { elementTypes: { custom: false } } },
        }}
      />,
    );
    const custom = API.createElement({
      type: "custom",
      width: 200,
      height: 100,
      customType: "test.custom",
      rendererId: "test.custom",
    });
    API.setElements([custom]);

    UI.resize(custom, "se", [50, 50]);

    expect(h.elements[0].width).toBe(200);
    expect(h.elements[0].height).toBe(100);
  });

  it("keeps resize handles for element types without an override", async () => {
    await render(
      <Excalidraw
        capabilities={{
          transforms: { resize: { elementTypes: { custom: false } } },
        }}
      />,
    );
    const rectangle = UI.createElement("rectangle", {
      width: 200,
      height: 100,
    });

    expect(h.app.getTransformHandleOmissions([rectangle])).not.toMatchObject({
      nw: true,
      ne: true,
      sw: true,
      se: true,
    });
  });
});
