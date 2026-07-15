import { THEME } from "@excalidraw/common";

import type {
  ExcalidrawCustomElement,
  FileId,
  Theme,
} from "./types";

export type CustomElementImageFit = "fill" | "contain" | "cover";

export type CustomElementDrawCommand =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth: number;
    }
  | {
      type: "circle";
      x: number;
      y: number;
      radius: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "path";
      d: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      type: "text";
      text: string;
      x: number;
      y: number;
      color: string;
      fontSize: number;
      fontFamily: string;
      fontWeight: number | string;
      align: CanvasTextAlign;
      baseline: CanvasTextBaseline;
      maxWidth?: number;
    }
  | {
      type: "image";
      fileId: FileId;
      x: number;
      y: number;
      width: number;
      height: number;
      fit: CustomElementImageFit;
      radius: number;
    }
  | { type: "save" }
  | { type: "restore" }
  | {
      type: "clipRect";
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
    };

export class CustomElementPainter {
  private readonly commands: CustomElementDrawCommand[] = [];

  public rect(
    x: number,
    y: number,
    width: number,
    height: number,
    style: {
      radius?: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    } = {},
  ) {
    this.commands.push({
      type: "rect",
      x,
      y,
      width,
      height,
      radius: style.radius ?? 0,
      ...style,
    });
  }

  public line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    style: { stroke: string; strokeWidth?: number },
  ) {
    this.commands.push({
      type: "line",
      x1,
      y1,
      x2,
      y2,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth ?? 1,
    });
  }

  public circle(
    x: number,
    y: number,
    radius: number,
    style: { fill?: string; stroke?: string; strokeWidth?: number } = {},
  ) {
    this.commands.push({ type: "circle", x, y, radius, ...style });
  }

  public path(
    d: string,
    style: { fill?: string; stroke?: string; strokeWidth?: number } = {},
  ) {
    this.commands.push({ type: "path", d, ...style });
  }

  public text(
    text: string,
    x: number,
    y: number,
    style: {
      color?: string;
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: number | string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      maxWidth?: number;
    } = {},
  ) {
    this.commands.push({
      type: "text",
      text,
      x,
      y,
      color: style.color ?? "#1b1b1f",
      fontSize: style.fontSize ?? 16,
      fontFamily: style.fontFamily ?? "Arial, sans-serif",
      fontWeight: style.fontWeight ?? 400,
      align: style.align ?? "left",
      baseline: style.baseline ?? "alphabetic",
      maxWidth: style.maxWidth,
    });
  }

  public image(
    fileId: FileId,
    x: number,
    y: number,
    width: number,
    height: number,
    options: { fit?: CustomElementImageFit; radius?: number } = {},
  ) {
    this.commands.push({
      type: "image",
      fileId,
      x,
      y,
      width,
      height,
      fit: options.fit ?? "cover",
      radius: options.radius ?? 0,
    });
  }

  public save() {
    this.commands.push({ type: "save" });
  }

  public restore() {
    this.commands.push({ type: "restore" });
  }

  public clipRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius = 0,
  ) {
    this.commands.push({ type: "clipRect", x, y, width, height, radius });
  }

  public getCommands(): readonly CustomElementDrawCommand[] {
    return this.commands;
  }
}

export type CustomElementRenderer = Readonly<{
  id: string;
  render: (context: {
    element: Readonly<ExcalidrawCustomElement>;
    painter: CustomElementPainter;
    theme: Theme;
  }) => void;
}>;

const rendererRegistry = new Map<string, CustomElementRenderer>();
let rendererRegistryRevision = 0;

export const getCustomElementRendererRevision = () => rendererRegistryRevision;

export const registerCustomElementRenderer = (
  renderer: CustomElementRenderer,
) => {
  rendererRegistry.set(renderer.id, renderer);
  rendererRegistryRevision++;
  return () => {
    if (rendererRegistry.get(renderer.id) === renderer) {
      unregisterCustomElementRenderer(renderer.id);
    }
  };
};

export const unregisterCustomElementRenderer = (rendererId: string) => {
  if (rendererRegistry.delete(rendererId)) {
    rendererRegistryRevision++;
  }
};

export const getCustomElementRenderer = (rendererId: string) =>
  rendererRegistry.get(rendererId) ?? null;

const renderFallback = (
  painter: CustomElementPainter,
  element: Readonly<ExcalidrawCustomElement>,
  theme: Theme,
) => {
  const dark = theme === THEME.DARK;
  const label =
    (typeof element.data.name === "string" && element.data.name) ||
    (typeof element.data.label === "string" && element.data.label) ||
    element.customType ||
    "Custom element";
  painter.rect(0, 0, element.width, element.height, {
    radius: Math.min(16, Math.min(element.width, element.height) / 8),
    fill: dark ? "#232329" : "#ffffff",
    stroke: dark ? "#555560" : "#d8d8df",
    strokeWidth: 1,
  });
  if (element.previewFileId) {
    painter.image(
      element.previewFileId,
      1,
      1,
      Math.max(0, element.width - 2),
      Math.max(0, element.height - 46),
      { fit: "cover", radius: 15 },
    );
  }
  painter.text(label, 16, element.height - 22, {
    color: dark ? "#f1f1f4" : "#29292f",
    fontSize: 15,
    fontWeight: 600,
    baseline: "middle",
    maxWidth: Math.max(0, element.width - 32),
  });
};

export const createCustomElementDrawCommands = (
  element: Readonly<ExcalidrawCustomElement>,
  theme: Theme,
) => {
  const painter = new CustomElementPainter();
  const renderer = getCustomElementRenderer(element.rendererId);
  if (!renderer) {
    renderFallback(painter, element, theme);
    return painter.getCommands();
  }
  try {
    renderer.render({ element, painter, theme });
    return painter.getCommands();
  } catch (error) {
    console.error(
      `Custom element renderer \"${element.rendererId}\" failed`,
      error,
    );
    const fallbackPainter = new CustomElementPainter();
    renderFallback(fallbackPainter, element, theme);
    return fallbackPainter.getCommands();
  }
};

const roundedRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  if (radius > 0 && context.roundRect) {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
};

export const getImageDrawRect = (
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: CustomElementImageFit,
) => {
  if (fit === "fill" || !sourceWidth || !sourceHeight) {
    return { x, y, width, height };
  }
  const scale =
    fit === "cover"
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  };
};

export const drawCustomElementCommandsToCanvas = (
  context: CanvasRenderingContext2D,
  commands: readonly CustomElementDrawCommand[],
  resolveImage: (
    fileId: FileId,
  ) => HTMLImageElement | HTMLCanvasElement | ImageBitmap | null,
) => {
  for (const command of commands) {
    switch (command.type) {
      case "save":
        context.save();
        break;
      case "restore":
        context.restore();
        break;
      case "clipRect":
        roundedRectPath(
          context,
          command.x,
          command.y,
          command.width,
          command.height,
          command.radius,
        );
        context.clip();
        break;
      case "rect":
        roundedRectPath(
          context,
          command.x,
          command.y,
          command.width,
          command.height,
          command.radius,
        );
        if (command.fill) {
          context.fillStyle = command.fill;
          context.fill();
        }
        if (command.stroke) {
          context.strokeStyle = command.stroke;
          context.lineWidth = command.strokeWidth ?? 1;
          context.stroke();
        }
        break;
      case "line":
        context.beginPath();
        context.moveTo(command.x1, command.y1);
        context.lineTo(command.x2, command.y2);
        context.strokeStyle = command.stroke;
        context.lineWidth = command.strokeWidth;
        context.stroke();
        break;
      case "circle":
        context.beginPath();
        context.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
        if (command.fill) {
          context.fillStyle = command.fill;
          context.fill();
        }
        if (command.stroke) {
          context.strokeStyle = command.stroke;
          context.lineWidth = command.strokeWidth ?? 1;
          context.stroke();
        }
        break;
      case "path": {
        const path = new Path2D(command.d);
        if (command.fill) {
          context.fillStyle = command.fill;
          context.fill(path);
        }
        if (command.stroke) {
          context.strokeStyle = command.stroke;
          context.lineWidth = command.strokeWidth ?? 1;
          context.stroke(path);
        }
        break;
      }
      case "text":
        context.fillStyle = command.color;
        context.font = `${command.fontWeight} ${command.fontSize}px ${command.fontFamily}`;
        context.textAlign = command.align;
        context.textBaseline = command.baseline;
        if (command.maxWidth === undefined) {
          context.fillText(command.text, command.x, command.y);
        } else {
          context.fillText(command.text, command.x, command.y, command.maxWidth);
        }
        break;
      case "image": {
        const image = resolveImage(command.fileId);
        if (!image) {
          break;
        }
        const sourceWidth =
          "naturalWidth" in image ? image.naturalWidth : image.width;
        const sourceHeight =
          "naturalHeight" in image ? image.naturalHeight : image.height;
        const drawRect = getImageDrawRect(
          sourceWidth,
          sourceHeight,
          command.x,
          command.y,
          command.width,
          command.height,
          command.fit,
        );
        context.save();
        roundedRectPath(
          context,
          command.x,
          command.y,
          command.width,
          command.height,
          command.radius,
        );
        context.clip();
        context.drawImage(
          image,
          drawRect.x,
          drawRect.y,
          drawRect.width,
          drawRect.height,
        );
        context.restore();
        break;
      }
    }
  }
};

export const drawCustomElementCommandsToSvg = (
  document: Document,
  commands: readonly CustomElementDrawCommand[],
  resolveImageHref: (fileId: FileId) => string | null,
  idPrefix: string,
) => {
  const svgNS = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(svgNS, "g");
  const stack: SVGGElement[] = [root];
  let clipIndex = 0;
  const append = (node: SVGElement) => stack[stack.length - 1].appendChild(node);
  const setRect = (
    node: SVGElement,
    command: { x: number; y: number; width: number; height: number },
  ) => {
    node.setAttribute("x", `${command.x}`);
    node.setAttribute("y", `${command.y}`);
    node.setAttribute("width", `${command.width}`);
    node.setAttribute("height", `${command.height}`);
  };

  for (const command of commands) {
    switch (command.type) {
      case "save": {
        const group = document.createElementNS(svgNS, "g");
        append(group);
        stack.push(group);
        break;
      }
      case "restore":
        if (stack.length > 1) {
          stack.pop();
        }
        break;
      case "clipRect": {
        const clipId = `${idPrefix}-clip-${clipIndex++}`;
        const defs = document.createElementNS(svgNS, "defs");
        const clipPath = document.createElementNS(svgNS, "clipPath");
        const rect = document.createElementNS(svgNS, "rect");
        clipPath.id = clipId;
        setRect(rect, command);
        rect.setAttribute("rx", `${command.radius}`);
        clipPath.appendChild(rect);
        defs.appendChild(clipPath);
        append(defs);
        stack[stack.length - 1].setAttribute("clip-path", `url(#${clipId})`);
        break;
      }
      case "rect": {
        const rect = document.createElementNS(svgNS, "rect");
        setRect(rect, command);
        rect.setAttribute("rx", `${command.radius}`);
        rect.setAttribute("fill", command.fill ?? "none");
        if (command.stroke) {
          rect.setAttribute("stroke", command.stroke);
          rect.setAttribute("stroke-width", `${command.strokeWidth ?? 1}`);
        }
        append(rect);
        break;
      }
      case "line": {
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", `${command.x1}`);
        line.setAttribute("y1", `${command.y1}`);
        line.setAttribute("x2", `${command.x2}`);
        line.setAttribute("y2", `${command.y2}`);
        line.setAttribute("stroke", command.stroke);
        line.setAttribute("stroke-width", `${command.strokeWidth}`);
        append(line);
        break;
      }
      case "circle": {
        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", `${command.x}`);
        circle.setAttribute("cy", `${command.y}`);
        circle.setAttribute("r", `${command.radius}`);
        circle.setAttribute("fill", command.fill ?? "none");
        if (command.stroke) {
          circle.setAttribute("stroke", command.stroke);
          circle.setAttribute("stroke-width", `${command.strokeWidth ?? 1}`);
        }
        append(circle);
        break;
      }
      case "path": {
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", command.d);
        path.setAttribute("fill", command.fill ?? "none");
        if (command.stroke) {
          path.setAttribute("stroke", command.stroke);
          path.setAttribute("stroke-width", `${command.strokeWidth ?? 1}`);
        }
        append(path);
        break;
      }
      case "text": {
        const text = document.createElementNS(svgNS, "text");
        text.textContent = command.text;
        text.setAttribute("x", `${command.x}`);
        text.setAttribute("y", `${command.y}`);
        text.setAttribute("fill", command.color);
        text.setAttribute("font-size", `${command.fontSize}`);
        text.setAttribute("font-family", command.fontFamily);
        text.setAttribute("font-weight", `${command.fontWeight}`);
        text.setAttribute(
          "text-anchor",
          command.align === "center"
            ? "middle"
            : command.align === "right" || command.align === "end"
            ? "end"
            : "start",
        );
        text.setAttribute(
          "dominant-baseline",
          command.baseline === "middle" ? "middle" : "alphabetic",
        );
        append(text);
        break;
      }
      case "image": {
        const href = resolveImageHref(command.fileId);
        if (!href) {
          break;
        }
        const image = document.createElementNS(svgNS, "image");
        setRect(image, command);
        image.setAttribute("href", href);
        image.setAttribute(
          "preserveAspectRatio",
          command.fit === "cover"
            ? "xMidYMid slice"
            : command.fit === "contain"
            ? "xMidYMid meet"
            : "none",
        );
        if (command.radius > 0) {
          const clipId = `${idPrefix}-image-clip-${clipIndex++}`;
          const defs = document.createElementNS(svgNS, "defs");
          const clipPath = document.createElementNS(svgNS, "clipPath");
          const rect = document.createElementNS(svgNS, "rect");
          clipPath.id = clipId;
          setRect(rect, command);
          rect.setAttribute("rx", `${command.radius}`);
          clipPath.appendChild(rect);
          defs.appendChild(clipPath);
          append(defs);
          image.setAttribute("clip-path", `url(#${clipId})`);
        }
        append(image);
        break;
      }
    }
  }
  return root;
};
