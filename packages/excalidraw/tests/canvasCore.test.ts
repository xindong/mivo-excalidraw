import {
  applyCanvasSceneOperations,
  CANVAS_CORE_PROTOCOL_VERSION,
  createCanvasController,
  defineCanvasControllerExtension,
  getCanvasCapabilities,
} from "../canvas";

describe("Canvas Core public contracts", () => {
  it("reports a stable protocol and registered extension namespaces", () => {
    const capabilities = getCanvasCapabilities(["mivo.assets"]);

    expect(capabilities.protocolVersion).toBe(CANVAS_CORE_PROTOCOL_VERSION);
    expect(capabilities.commands).toEqual(["inspect", "apply"]);
    expect(capabilities.operations).toContain("extension");
    expect(capabilities.createKinds).toContain("custom");
    expect(capabilities.extensions).toEqual(["mivo.assets"]);
  });

  it("preserves typed extension definitions without wrapping execution", () => {
    const execute = jest.fn(() => ({ refreshed: true }));
    const extension = defineCanvasControllerExtension<
      "refresh",
      { elementId: string },
      { refreshed: boolean }
    >({
      namespace: "mivo.assets",
      execute,
    });

    expect(extension.namespace).toBe("mivo.assets");
    expect(extension.execute).toBe(execute);
  });

  it("retypes a custom element in place while preserving its center", () => {
    const created = applyCanvasSceneOperations(
      {
        elements: [],
        appState: { editingGroupId: null, selectedGroupIds: {} },
      },
      [
        {
          type: "create",
          items: [
            {
              kind: "custom",
              id: "generate-1",
              x: 10,
              y: 20,
              width: 200,
              height: 100,
              customType: "mivo.generate",
              rendererId: "generate.v1",
              schemaVersion: 1,
              rendererVersion: 1,
              data: { status: "running" },
            },
          ],
        },
      ],
    );
    const previous = created.elements[0];

    const patched = applyCanvasSceneOperations(
      {
        elements: created.elements,
        appState: { editingGroupId: null, selectedGroupIds: {} },
      },
      [
        {
          type: "patch",
          elementId: "generate-1",
          preserveCenter: true,
          patch: {
            name: "finished",
            width: 100,
            height: 50,
            customType: "mivo.image",
            rendererId: "image.v1",
            schemaVersion: 2,
            rendererVersion: 3,
            status: "ready",
            data: { mimeType: "image/png" },
          },
        },
      ],
    );
    const element = patched.elements[0];

    expect(element).toMatchObject({
      id: "generate-1",
      type: "custom",
      x: 60,
      y: 45,
      width: 100,
      height: 50,
      customType: "mivo.image",
      rendererId: "image.v1",
      schemaVersion: 2,
      rendererVersion: 3,
      status: "ready",
      data: { name: "finished", mimeType: "image/png" },
    });
    expect(element.version).toBeGreaterThan(previous.version);
    expect(patched.createdElementIds).toEqual([]);
    expect(patched.touchedElementIds).toEqual(["generate-1"]);
  });

  it("centers the viewport on a scene point through the controller", async () => {
    const setViewport = jest.fn();
    const controller = createCanvasController({
      isDestroyed: false,
      getSceneElementsIncludingDeleted: () => [],
      getAppState: () => ({
        editingGroupId: null,
        selectedElementIds: {},
        selectedGroupIds: {},
      }),
      setViewport,
    } as never);

    const result = await controller.apply({
      operations: [{ type: "viewport", center: { x: 120, y: 80 } }],
    });

    expect(result).toMatchObject({ sceneChanged: false, viewportChanged: true });
    expect(setViewport).toHaveBeenCalledWith({
      target: { x: 120, y: 80, width: 0, height: 0 },
      fit: "none",
      animation: true,
      offsets: { ui: true },
    });
  });
});
