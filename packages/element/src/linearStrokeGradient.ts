import type { ExcalidrawLinearElement, LinearStrokeGradient } from "./types";

const clampOpacity = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;

export const normalizeLinearStrokeGradient = (
  value: unknown,
): LinearStrokeGradient | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const gradient = value as Partial<LinearStrokeGradient>;
  if (gradient.type !== "linear") {
    return null;
  }
  return {
    type: "linear",
    startOpacity: clampOpacity(gradient.startOpacity, 1),
    endOpacity: clampOpacity(gradient.endOpacity, 1),
    ...(typeof gradient.startColor === "string" && gradient.startColor
      ? { startColor: gradient.startColor }
      : {}),
    ...(typeof gradient.endColor === "string" && gradient.endColor
      ? { endColor: gradient.endColor }
      : {}),
  };
};

export const getLinearStrokeGradient = (element: ExcalidrawLinearElement) => {
  const gradient = element.strokeGradient;
  const start = element.points[0];
  const end = element.points[element.points.length - 1];
  if (
    !gradient ||
    !start ||
    !end ||
    (start[0] === end[0] && start[1] === end[1])
  ) {
    return null;
  }
  return {
    start,
    end,
    startColor: gradient.startColor ?? element.strokeColor,
    endColor: gradient.endColor ?? element.strokeColor,
    startOpacity: gradient.startOpacity,
    endOpacity: gradient.endOpacity,
  };
};

export const colorWithOpacity = (color: string, opacity: number) => {
  const match = color.match(
    /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i,
  );
  if (!match) {
    return color;
  }
  const hex = match[1];
  const expanded =
    hex.length <= 4
      ? hex
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex;
  const rgb = expanded.slice(0, 6);
  const existingAlpha =
    expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1;
  const alpha = Math.round(existingAlpha * opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rgb}${alpha}`;
};
