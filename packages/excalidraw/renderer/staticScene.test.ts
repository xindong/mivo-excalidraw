import { getStaticViewportSnapshotTransform } from "./staticScene";

describe("static viewport snapshot transform", () => {
  it("maps scene points from the captured viewport into the next viewport", () => {
    const previous = {
      zoom: 0.75,
      scrollX: -120,
      scrollY: 40,
    };
    const next = {
      zoom: 1.5,
      scrollX: -180,
      scrollY: 10,
    };
    const transform = getStaticViewportSnapshotTransform(previous, next);
    const scenePoint = { x: 320, y: 160 };
    const previousViewportPoint = {
      x: (scenePoint.x + previous.scrollX) * previous.zoom,
      y: (scenePoint.y + previous.scrollY) * previous.zoom,
    };

    expect(
      previousViewportPoint.x * transform.scale + transform.translateX,
    ).toBe((scenePoint.x + next.scrollX) * next.zoom);
    expect(
      previousViewportPoint.y * transform.scale + transform.translateY,
    ).toBe((scenePoint.y + next.scrollY) * next.zoom);
  });

  it("uses a pure translation when zoom is unchanged", () => {
    expect(
      getStaticViewportSnapshotTransform(
        { zoom: 2, scrollX: 10, scrollY: 20 },
        { zoom: 2, scrollX: 16, scrollY: 11 },
      ),
    ).toEqual({
      scale: 1,
      translateX: 12,
      translateY: -18,
    });
  });
});
