import {
  CANVAS_CORE_PROTOCOL_VERSION,
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
});
