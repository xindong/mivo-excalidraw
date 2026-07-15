import type {
  Arrowhead,
  CustomElementResource,
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type { CustomElementData } from "@excalidraw/element";

import type { AppState, ExcalidrawImperativeAPI } from "../types";

export type CanvasPoint = Readonly<{ x: number; y: number }>;
export type CanvasBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type CanvasInspectField =
  | "position"
  | "size"
  | "text"
  | "state"
  | "style"
  | "groups"
  | "bindings"
  | "custom"
  | "raw";

export type CanvasInspectSearchField = "id" | "name" | "text";

export type CanvasInspectFilter = Readonly<{
  ids?: readonly string[];
  types?: readonly string[];
  keyword?: string;
  searchIn?: readonly CanvasInspectSearchField[];
  selected?: boolean;
  locked?: boolean;
  includeDeleted?: boolean;
  groupIds?: readonly string[];
  frameIds?: readonly string[];
  intersects?: CanvasBounds;
  inside?: CanvasBounds;
}>;

export type CanvasInspectQuery = Readonly<{
  filter?: CanvasInspectFilter;
  fields?: readonly CanvasInspectField[];
  limit?: number;
  cursor?: string;
}>;

export type CanvasElementProjection = Readonly<{
  id: string;
  type: string;
  name?: string;
  position?: CanvasPoint;
  size?: Readonly<{ width: number; height: number }>;
  text?: string | null;
  state?: Readonly<{
    isDeleted: boolean;
    locked: boolean;
    index: string | null;
  }>;
  style?: Readonly<Record<string, unknown>>;
  groups?: Readonly<{
    groupIds: readonly string[];
    frameId: string | null;
  }>;
  bindings?: Readonly<{
    boundElementIds: readonly string[];
    startBindingId: string | null;
    endBindingId: string | null;
  }>;
  custom?: Readonly<Record<string, unknown>> | null;
  raw?: OrderedExcalidrawElement;
}>;

export type CanvasInspectResult = Readonly<{
  revision: string;
  selectedIds: readonly string[];
  total: number;
  count: number;
  nextCursor: string | null;
  sceneBounds: CanvasBounds | null;
  elements: readonly CanvasElementProjection[];
}>;

type CanvasCreateBase = Readonly<{
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  opacity?: number;
  locked?: boolean;
  customData?: Record<string, unknown>;
}>;

export type CanvasCreateItem =
  | (CanvasCreateBase &
      Readonly<{
        kind: "text";
        text: string;
        fontSize?: number;
        color?: string;
        textAlign?: "left" | "center" | "right";
      }>)
  | (CanvasCreateBase &
      Readonly<{
        kind: "shape";
        shape: "rectangle" | "ellipse" | "diamond" | "line" | "arrow";
        strokeColor?: string;
        backgroundColor?: string;
        strokeWidth?: number;
      }>)
  | (CanvasCreateBase &
      Readonly<{
        kind: "custom";
        customType: string;
        rendererId: string;
        schemaVersion?: number;
        rendererVersion?: number;
        resource?: CustomElementResource | null;
        status?: "pending" | "ready" | "error";
        data?: CustomElementData;
        previewFileId?: FileId | null;
      }>);

export type CanvasElementPatch = Readonly<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  opacity?: number;
  locked?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  text?: string;
  fontSize?: number;
  customData?: Record<string, unknown>;
  data?: CustomElementData;
  resource?: CustomElementResource | null;
  previewFileId?: FileId | null;
  status?: "pending" | "ready" | "error";
}>;

export type CanvasLayoutOperation = Readonly<{
  type: "layout";
  elementIds: readonly string[];
  mode: "align" | "distribute" | "horizontalStack" | "verticalStack" | "grid";
  align?: "left" | "center" | "right" | "top" | "middle" | "bottom";
  direction?: "horizontal" | "vertical";
  gap?: number;
  columns?: number;
  gapX?: number;
  gapY?: number;
}>;

export type CanvasOperation =
  | Readonly<{
      type: "create";
      items: readonly CanvasCreateItem[];
    }>
  | Readonly<{
      type: "patch";
      elementId: string;
      patch: CanvasElementPatch;
    }>
  | Readonly<{
      type: "transform";
      elementIds: readonly string[];
      dx?: number;
      dy?: number;
      scale?: number;
      scaleX?: number;
      scaleY?: number;
      angleDelta?: number;
      anchor?: CanvasPoint;
    }>
  | Readonly<{
      type: "duplicate";
      elementIds: readonly string[];
      offsetX?: number;
      offsetY?: number;
    }>
  | Readonly<{ type: "delete"; elementIds: readonly string[] }>
  | Readonly<{
      type: "group";
      elementIds: readonly string[];
      groupId?: string;
    }>
  | Readonly<{
      type: "ungroup";
      elementIds: readonly string[];
      groupId?: string;
    }>
  | Readonly<{
      type: "connect";
      from: string;
      to: string;
      label?: string;
      endArrowhead?: Arrowhead;
      strokeColor?: string;
      strokeWidth?: number;
    }>
  | CanvasLayoutOperation
  | Readonly<{
      type: "arrange";
      elementIds: readonly string[];
      mode: "front" | "back" | "forward" | "backward";
    }>
  | Readonly<{
      type: "viewport";
      select?: readonly string[];
      focus?: readonly string[];
      fit?: "scale-down" | "contain" | "none";
      animate?: boolean;
    }>
  | Readonly<{
      type: "extension";
      namespace: string;
      command: string;
      payload?: unknown;
    }>;

export type CanvasApplyRequest = Readonly<{
  operations: readonly CanvasOperation[];
  selectCreated?: boolean;
  focusCreated?: boolean;
}>;

export type CanvasElementChange = Readonly<{
  elementId: string;
  kind: "created" | "updated" | "deleted";
  fields: readonly string[];
}>;

export type CanvasApplyResult = Readonly<{
  ok: true;
  noOp: boolean;
  sceneChanged: boolean;
  viewportChanged: boolean;
  revision: string;
  previousRevision: string;
  elementIds: readonly string[];
  createdElementIds: readonly string[];
  changes: readonly CanvasElementChange[];
  extension?: unknown;
}>;

export type CanvasCommand =
  | Readonly<{ type: "inspect"; query?: CanvasInspectQuery }>
  | Readonly<{ type: "apply"; request: CanvasApplyRequest }>;

export type CanvasCommandResult = CanvasInspectResult | CanvasApplyResult;

export type CanvasCapabilities = Readonly<{
  protocolVersion: 1;
  commands: readonly ["inspect", "apply"];
  operations: readonly CanvasOperation["type"][];
  createKinds: readonly CanvasCreateItem["kind"][];
  inspectFields: readonly CanvasInspectField[];
  extensions: readonly string[];
}>;

export type CanvasSceneSnapshot = Readonly<{
  elements: readonly OrderedExcalidrawElement[];
  appState: Pick<AppState, "editingGroupId" | "selectedGroupIds">;
}>;

export type CanvasSceneOperationResult = Readonly<{
  elements: readonly OrderedExcalidrawElement[];
  selectedElementIds?: Readonly<Record<string, true>>;
  focusElementIds?: readonly string[];
  createdElementIds: readonly string[];
  touchedElementIds: readonly string[];
}>;

export type CanvasExtensionContext = Readonly<{
  operation: Extract<CanvasOperation, { type: "extension" }>;
  inspect: (query?: CanvasInspectQuery) => CanvasInspectResult;
  commit: <T>(
    mutation: (api: ExcalidrawImperativeAPI) => Promise<T> | T,
  ) => Promise<T>;
}>;

export type CanvasControllerExtension = Readonly<{
  namespace: string;
  execute: (context: CanvasExtensionContext) => Promise<unknown> | unknown;
}>;

export type CanvasControllerOptions = Readonly<{
  extensions?: readonly CanvasControllerExtension[];
  resolveElementName?: CanvasElementNameResolver;
  beforeCommit?: (request: CanvasApplyRequest) => Promise<void> | void;
  afterCommit?: (result: CanvasApplyResult) => Promise<void> | void;
}>;

export interface CanvasController {
  inspect(query?: CanvasInspectQuery): CanvasInspectResult;
  apply(request: CanvasApplyRequest): Promise<CanvasApplyResult>;
  execute(command: CanvasCommand): Promise<CanvasCommandResult>;
  getCapabilities(): CanvasCapabilities;
  getRevision(): string;
  destroy(): void;
  readonly isDestroyed: boolean;
}

export type CanvasElementNameResolver = (
  element: ExcalidrawElement,
) => string | null;
