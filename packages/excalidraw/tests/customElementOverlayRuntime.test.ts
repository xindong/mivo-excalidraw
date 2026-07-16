import { CustomElementOverlayRuntime } from "../customElementOverlay/runtime";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("CustomElementOverlayRuntime", () => {
  it("shares transient state by element and state scope", () => {
    const runtime = new CustomElementOverlayRuntime();

    runtime.setState("element-a", "shared", { playing: false, time: 0 });
    runtime.patchState("element-a", "shared", { playing: true });

    expect(runtime.getState("element-a", "shared")).toEqual({
      playing: true,
      time: 0,
    });
    expect(runtime.getState("element-b", "shared")).toBeUndefined();
  });

  it("does not let an older closeAfter close a reopened overlay", async () => {
    const runtime = new CustomElementOverlayRuntime();
    const pending = deferred();

    runtime.open("element-a", "surface");
    const closeResult = runtime.closeAfter(
      "element-a",
      "surface",
      pending.promise,
    );
    runtime.open("element-a", "surface");
    pending.resolve();

    await expect(closeResult).resolves.toBe("stale");
    expect(runtime.isOpen("element-a", "surface")).toBe(true);
  });

  it("keeps an overlay open on failure unless closeOnError is enabled", async () => {
    const runtime = new CustomElementOverlayRuntime();
    const first = deferred();

    runtime.open("element-a", "surface");
    const failedResult = runtime.closeAfter(
      "element-a",
      "surface",
      first.promise,
    );
    first.reject(new Error("preview failed"));

    await expect(failedResult).resolves.toBe("failed");
    expect(runtime.isOpen("element-a", "surface")).toBe(true);

    const second = deferred();
    const closedResult = runtime.closeAfter(
      "element-a",
      "surface",
      second.promise,
      { closeOnError: true },
    );
    second.reject(new Error("preview failed again"));

    await expect(closedResult).resolves.toBe("closed");
    expect(runtime.isOpen("element-a", "surface")).toBe(false);
  });

  it("removes state and presence for deleted elements", () => {
    const runtime = new CustomElementOverlayRuntime();
    runtime.open("keep", "surface");
    runtime.open("remove", "surface");
    runtime.setState("remove", "shared", { value: 1 });

    runtime.prune(new Set(["keep"]));

    expect(runtime.isOpen("keep", "surface")).toBe(true);
    expect(runtime.isOpen("remove", "surface")).toBe(false);
    expect(runtime.getState("remove", "shared")).toBeUndefined();
  });
});
