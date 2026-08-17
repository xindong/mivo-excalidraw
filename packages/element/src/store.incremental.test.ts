import type App from "@excalidraw/excalidraw/components/App";

import { CaptureUpdateAction, Store, StoreSnapshot } from "./store";

import type { OrderedExcalidrawElement, SceneElementsMap } from "./types";

describe("Store incremental scene commits", () => {
  it("keeps a stable snapshot map and updates only dirty element values", () => {
    const store = new Store({} as App);
    const initial = element({ version: 1, versionNonce: 11, x: 0 });
    const appState = StoreSnapshot.empty().appState;

    store.scheduleAction(CaptureUpdateAction.NEVER);
    store.commit(elementsMap(initial), appState, new Set([initial.id]));

    const stableElementsMap = store.snapshot.elements;
    const updated = element({ version: 2, versionNonce: 22, x: 40 });
    let durableIncrementCount = 0;
    store.onDurableIncrementEmitter.on(() => {
      durableIncrementCount += 1;
    });

    store.scheduleCapture();
    store.commit(elementsMap(updated), appState, new Set([updated.id]));

    expect(store.snapshot.elements).toBe(stableElementsMap);
    expect(store.snapshot.elements.get(updated.id)).toMatchObject({
      version: 2,
      versionNonce: 22,
      x: 40,
    });
    expect(store.snapshot.elements.get(updated.id)).not.toBe(updated);
    expect(durableIncrementCount).toBe(1);
  });
});

const element = ({
  version,
  versionNonce,
  x,
}: {
  version: number;
  versionNonce: number;
  x: number;
}) =>
  ({
    id: "incremental-element",
    type: "rectangle",
    isDeleted: false,
    version,
    versionNonce,
    x,
  } as OrderedExcalidrawElement);

const elementsMap = (element: OrderedExcalidrawElement) =>
  new Map([[element.id, element]]) as SceneElementsMap;
