import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import {
  forEachElementInManagedConnectorRenderOrder,
  getElementsInManagedConnectorRenderOrder,
  isElementHitTestable,
} from "../src/autoCubicConnector";

import type { ExcalidrawElement } from "../src/types";

const managedConnector = (id: string): ExcalidrawElement =>
  ({
    ...API.createElement({ type: "arrow", id }),
    connector: {
      routing: "auto-cubic",
      interaction: "managed",
      deletePolicy: "cascade",
    },
  } as ExcalidrawElement);

describe("managed Connector render order", () => {
  it("preserves regular order when the scene has no connectors", () => {
    const elements = [
      API.createElement({ type: "rectangle", id: "regular-a" }),
      API.createElement({ type: "ellipse", id: "regular-b" }),
    ];
    const visited: string[] = [];

    forEachElementInManagedConnectorRenderOrder(elements, (element) => {
      visited.push(element.id);
    });

    expect(visited).toEqual(["regular-a", "regular-b"]);
  });

  it("visits connectors first without mutating scene order", () => {
    const regularA = API.createElement({ type: "rectangle", id: "regular-a" });
    const connectorA = managedConnector("connector-a");
    const regularB = API.createElement({ type: "ellipse", id: "regular-b" });
    const connectorB = managedConnector("connector-b");
    const elements = [regularA, connectorA, regularB, connectorB];
    const visited: string[] = [];

    forEachElementInManagedConnectorRenderOrder(elements, (element) => {
      visited.push(element.id);
    });

    expect(visited).toEqual([
      "connector-a",
      "connector-b",
      "regular-a",
      "regular-b",
    ]);
    expect(elements.map((element) => element.id)).toEqual([
      "regular-a",
      "connector-a",
      "regular-b",
      "connector-b",
    ]);
  });

  it("preserves the existing array helper and hit-test policy", () => {
    const regular = API.createElement({ type: "rectangle", id: "regular" });
    const connector = managedConnector("connector");

    expect(
      getElementsInManagedConnectorRenderOrder([regular, connector]).map(
        (element) => element.id,
      ),
    ).toEqual(["connector", "regular"]);
    expect(isElementHitTestable(regular)).toBe(true);
    expect(isElementHitTestable(connector)).toBe(false);
  });
});
