import { MAX_ZOOM, MIN_ZOOM } from "@excalidraw/common";

import { clamp, round } from "@excalidraw/math";

import type { NormalizedZoomValue } from "../types";

export const getNormalizedZoom = (
  zoom: number,
  minZoom = MIN_ZOOM,
): NormalizedZoomValue => {
  return clamp(round(zoom, 6), minZoom, MAX_ZOOM) as NormalizedZoomValue;
};

export const getNormalizedGridSize = (gridStep: number) => {
  return clamp(Math.round(gridStep), 1, 100);
};

export const getNormalizedGridStep = (gridStep: number) => {
  return clamp(Math.round(gridStep), 1, 100);
};
