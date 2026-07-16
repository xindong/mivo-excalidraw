import { THEME } from "@excalidraw/common";

import type {
  CustomElementResource,
  CustomElementValue,
  ExcalidrawCustomElement,
  FileId,
  Theme,
} from "./types";

export type CustomElementImageFit = "fill" | "contain" | "cover";

export type CustomElementTextStyle = Readonly<{
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  maxWidth?: number;
  /** `ellipsis` keeps glyph proportions; `compress` mirrors Canvas fillText. */
  overflow?: "ellipsis" | "compress" | "visible";
}>;

export type CustomElementData = Readonly<Record<string, CustomElementValue>>;

export type CustomElementCacheStrategy =
  | Readonly<{ mode: "zoom" }>
  | Readonly<{ mode: "fixed"; scale: number }>
  | Readonly<{ mode: "source"; maxScale?: number }>;

export type TypedExcalidrawCustomElement<
  TData extends CustomElementData = CustomElementData,
> = Omit<ExcalidrawCustomElement, "data"> & Readonly<{ data: TData }>;

export type CustomElementAssetStore = Readonly<{
  put: (
    file: File | Blob,
    context: {
      customType: string;
      signal: AbortSignal;
    },
  ) => Promise<CustomElementResource>;
  resolve: (
    resource: CustomElementResource,
    context: { signal: AbortSignal },
  ) => Promise<Blob | File | string | null>;
  exists?: (resource: CustomElementResource) => Promise<boolean>;
  remove?: (resource: CustomElementResource) => Promise<void>;
}>;

export const defineCustomElementAssetStore = (store: CustomElementAssetStore) =>
  store;

export type CustomElementPreviewStore = Readonly<{
  put: (preview: File | Blob, options?: { name?: string }) => Promise<FileId>;
}>;

export type CustomElementPreviewRequest<
  TData extends CustomElementValue = CustomElementValue,
> = Readonly<{
  reason?: string;
  data?: TData;
}>;

export type CustomElementPreviewOutput =
  | FileId
  | File
  | Blob
  | Readonly<{ type: "clear" }>
  | null;

export type CustomElementFileContext = Readonly<{
  assets: CustomElementAssetStore | null;
  previews: CustomElementPreviewStore;
  signal: AbortSignal;
}>;

export type CustomElementImportResult<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  data: TData;
  resource?: CustomElementResource | null;
  preview?: Exclude<CustomElementPreviewOutput, Readonly<{ type: "clear" }>>;
  width?: number;
  height?: number;
}>;

export type CustomElementActivation = Readonly<{
  /** Where the activation originated. */
  source: "canvas" | "api";
  /** Point inside the unrotated element bounds, in element-local units. */
  point: Readonly<{ x: number; y: number }> | null;
  modifiers: Readonly<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }> | null;
}>;

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
  | { type: "scale"; scaleX: number; scaleY: number }
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

let customElementTextMeasurementContext:
  | CanvasRenderingContext2D
  | null
  | undefined;

const getCustomElementTextMeasurementContext = () => {
  if (customElementTextMeasurementContext !== undefined) {
    return customElementTextMeasurementContext;
  }
  if (typeof document === "undefined") {
    return null;
  }
  customElementTextMeasurementContext = document
    .createElement("canvas")
    .getContext("2d");
  return customElementTextMeasurementContext;
};

export const measureCustomElementText = (
  text: string,
  style: Pick<
    CustomElementTextStyle,
    "fontSize" | "fontFamily" | "fontWeight"
  > = {},
) => {
  const fontSize = style.fontSize ?? 16;
  const fontFamily = style.fontFamily ?? "Arial, sans-serif";
  const fontWeight = style.fontWeight ?? 400;
  const context = getCustomElementTextMeasurementContext();
  if (context) {
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  }
  return Array.from(text).reduce((width, character) => {
    if (/\s/.test(character)) {
      return width + fontSize * 0.33;
    }
    return width + fontSize * (/^[\x00-\x7F]$/.test(character) ? 0.6 : 1);
  }, 0);
};

export const ellipsizeCustomElementText = (
  text: string,
  maxWidth: number,
  style: Pick<
    CustomElementTextStyle,
    "fontSize" | "fontFamily" | "fontWeight"
  > = {},
) => {
  if (measureCustomElementText(text, style) <= maxWidth) {
    return text;
  }
  const ellipsis = "…";
  if (measureCustomElementText(ellipsis, style) > maxWidth) {
    return "";
  }
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${characters.slice(0, middle).join("")}${ellipsis}`;
    if (measureCustomElementText(candidate, style) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return `${characters.slice(0, low).join("")}${ellipsis}`;
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
    style: CustomElementTextStyle = {},
  ) {
    const fontSize = style.fontSize ?? 16;
    const fontFamily = style.fontFamily ?? "Arial, sans-serif";
    const fontWeight = style.fontWeight ?? 400;
    const overflow = style.overflow ?? "ellipsis";
    const fittedText =
      style.maxWidth !== undefined && overflow === "ellipsis"
        ? ellipsizeCustomElementText(text, style.maxWidth, {
            fontSize,
            fontFamily,
            fontWeight,
          })
        : text;
    this.commands.push({
      type: "text",
      text: fittedText,
      x,
      y,
      color: style.color ?? "#1b1b1f",
      fontSize,
      fontFamily,
      fontWeight,
      align: style.align ?? "left",
      baseline: style.baseline ?? "alphabetic",
      maxWidth: overflow === "compress" ? style.maxWidth : undefined,
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

  public scale(scaleX: number, scaleY: number) {
    this.commands.push({ type: "scale", scaleX, scaleY });
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

export type CustomElementRenderer<
  TData extends CustomElementData = CustomElementData,
> = Readonly<{
  id: string;
  /** Controls the resolution and zoom invalidation of the element canvas. */
  cache?: CustomElementCacheStrategy;
  /**
   * Optional logical coordinate system used by the renderer. When provided,
   * all painter commands are scaled from this viewBox to the element's current
   * width and height. This makes element resize behave like scaling the whole
   * rendered card, while renderers without a viewBox remain responsive.
   */
  viewBox?:
    | CustomElementViewBox
    | ((context: {
        element: Readonly<TypedExcalidrawCustomElement<TData>>;
      }) => CustomElementViewBox);
  render: (context: {
    element: Readonly<TypedExcalidrawCustomElement<TData>>;
    painter: CustomElementPainter;
    theme: Theme;
    /** Logical dimensions painter commands should use. */
    viewBox: CustomElementViewBox;
  }) => void;
}>;

export type CustomElementViewBox = Readonly<{
  width: number;
  height: number;
}>;

export type CustomElementDefinition<
  TData extends CustomElementData = CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
> = Readonly<{
  type: string;
  schemaVersion: number;
  renderer?: CustomElementRenderer<TData>;
  rendererId?: string;
  file?: Readonly<{
    accept?: readonly string[] | ((file: File) => boolean);
    import?: (
      context: CustomElementFileContext & Readonly<{ file: File }>,
    ) => Promise<CustomElementImportResult<TData>>;
    createPreview?: (
      context: CustomElementFileContext &
        Readonly<{
          element: TypedExcalidrawCustomElement<TData> | null;
          resource: CustomElementResource | null;
          data: TData;
          file: File | null;
          request: CustomElementPreviewRequest<TPreviewRequest> | null;
        }>,
    ) => Promise<CustomElementPreviewOutput>;
  }>;
  activate?: (
    context: Readonly<{
      element: TypedExcalidrawCustomElement<TData>;
      assets: CustomElementAssetStore | null;
      signal: AbortSignal;
      activation: CustomElementActivation;
    }>,
  ) => void | Promise<void>;
  migrate?: (data: CustomElementData, fromVersion: number) => TData;
}>;

export const defineCustomElement = <
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(
  definition: CustomElementDefinition<TData, TPreviewRequest>,
) => definition;

export const customElementDefinitionAcceptsFile = (
  definition: CustomElementDefinition<any, any>,
  file: File,
) => {
  const accept = definition.file?.accept;
  if (!accept) {
    return true;
  }
  if (typeof accept === "function") {
    return accept(file);
  }
  const lowerName = file.name.toLowerCase();
  return accept.some((candidate) => {
    const normalized = candidate.trim().toLowerCase();
    if (normalized.startsWith(".")) {
      return lowerName.endsWith(normalized);
    }
    if (normalized.endsWith("/*")) {
      return file.type.toLowerCase().startsWith(normalized.slice(0, -1));
    }
    return file.type.toLowerCase() === normalized;
  });
};

const rendererRegistry = new Map<string, CustomElementRenderer<any>>();
const definitionRegistry = new Map<string, CustomElementDefinition<any, any>>();
let rendererRegistryRevision = 0;

export const getCustomElementRendererRevision = () => rendererRegistryRevision;

export const registerCustomElementRenderer = <TData extends CustomElementData>(
  renderer: CustomElementRenderer<TData>,
) => {
  rendererRegistry.set(renderer.id, renderer as CustomElementRenderer<any>);
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

export const getCustomElementDefinition = (customType: string) =>
  definitionRegistry.get(customType) ?? null;

export const unregisterCustomElement = (customType: string) => {
  const definition = definitionRegistry.get(customType);
  if (!definition) {
    return;
  }
  definitionRegistry.delete(customType);
  if (
    definition.renderer &&
    rendererRegistry.get(definition.renderer.id) === definition.renderer
  ) {
    unregisterCustomElementRenderer(definition.renderer.id);
  }
};

export const registerCustomElement = <
  TData extends CustomElementData,
  TPreviewRequest extends CustomElementValue = CustomElementValue,
>(
  definition: CustomElementDefinition<TData, TPreviewRequest>,
) => {
  if (!definition.type) {
    throw new Error("Custom element definition requires a non-empty type");
  }
  if (
    !Number.isInteger(definition.schemaVersion) ||
    definition.schemaVersion < 1
  ) {
    throw new Error("Custom element schemaVersion must be a positive integer");
  }

  const previousDefinition = definitionRegistry.get(definition.type);
  if (
    previousDefinition?.renderer &&
    rendererRegistry.get(previousDefinition.renderer.id) ===
      previousDefinition.renderer
  ) {
    unregisterCustomElementRenderer(previousDefinition.renderer.id);
  }
  definitionRegistry.set(definition.type, definition);
  const unregisterRenderer = definition.renderer
    ? registerCustomElementRenderer(definition.renderer)
    : null;

  return () => {
    if (definitionRegistry.get(definition.type) !== definition) {
      return;
    }
    definitionRegistry.delete(definition.type);
    unregisterRenderer?.();
  };
};

export const registerCustomElementType = registerCustomElement;

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
    const configuredViewBox =
      typeof renderer.viewBox === "function"
        ? renderer.viewBox({ element })
        : renderer.viewBox;
    const viewBox = configuredViewBox ?? {
      width: element.width,
      height: element.height,
    };
    if (
      !Number.isFinite(viewBox.width) ||
      viewBox.width <= 0 ||
      !Number.isFinite(viewBox.height) ||
      viewBox.height <= 0
    ) {
      throw new Error(
        `Custom element renderer "${element.rendererId}" returned an invalid viewBox`,
      );
    }
    if (configuredViewBox) {
      painter.save();
      painter.scale(
        element.width / configuredViewBox.width,
        element.height / configuredViewBox.height,
      );
    }
    renderer.render({ element, painter, theme, viewBox });
    if (configuredViewBox) {
      painter.restore();
    }
    return painter.getCommands();
  } catch (error) {
    console.error(
      `Custom element renderer "${element.rendererId}" failed`,
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
      case "scale":
        context.scale(command.scaleX, command.scaleY);
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
          context.fillText(
            command.text,
            command.x,
            command.y,
            command.maxWidth,
          );
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
  const savedStackDepths: number[] = [];
  let clipIndex = 0;
  const append = (node: SVGElement) =>
    stack[stack.length - 1].appendChild(node);
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
        savedStackDepths.push(stack.length);
        const group = document.createElementNS(svgNS, "g");
        append(group);
        stack.push(group);
        break;
      }
      case "restore": {
        const savedDepth = savedStackDepths.pop();
        if (savedDepth !== undefined) {
          stack.length = savedDepth;
        }
        break;
      }
      case "scale": {
        const currentGroup = stack[stack.length - 1];
        if (
          currentGroup.childNodes.length === 0 &&
          !currentGroup.hasAttribute("transform")
        ) {
          currentGroup.setAttribute(
            "transform",
            `scale(${command.scaleX} ${command.scaleY})`,
          );
        } else {
          const group = document.createElementNS(svgNS, "g");
          group.setAttribute(
            "transform",
            `scale(${command.scaleX} ${command.scaleY})`,
          );
          append(group);
          stack.push(group);
        }
        break;
      }
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
