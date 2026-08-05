import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import { createCanvasController } from "@excalidraw/excalidraw/canvas";
import { getAutoCubicGeometry } from "@excalidraw/element";

import type {
  CustomElementData,
  CustomElementOverlayDefinition,
  CustomElementOverlayRenderContext,
} from "@excalidraw/excalidraw";
import type { FileId } from "@excalidraw/element/types";

import "./customElementConnections.scss";

export const WORKFLOW_CUSTOM_TYPE = "dev.workflow";
export const WORKFLOW_RENDERER_ID = "mivo.dev.workflow-card";
export const WORKFLOW_PREVIEW_FILE_ID = "mivo-workflow-placeholder" as FileId;

type WorkflowKind = "image" | "video";

type ClientPoint = Readonly<{ x: number; y: number }>;
type ConnectorState = Readonly<{ engaged?: boolean }>;
type DragState = Readonly<{
  pointerId: number;
  start: ClientPoint;
  current: ClientPoint;
}>;

const WorkflowKindIcon = ({ kind }: { kind: WorkflowKind }) =>
  kind === "image" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 5.75h14.5v12.5H4.75z" />
      <circle cx="9" cy="10" r="1.45" />
      <path d="m6.8 16 3.3-3.4 2.3 2.25 1.7-1.75 3.1 2.9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.75" y="6" width="14.5" height="12" rx="2" />
      <path d="m10.25 9.4 4.5 2.6-4.5 2.6z" />
    </svg>
  );

const WorkflowConnector = ({
  context,
}: {
  context: CustomElementOverlayRenderContext<CustomElementData, ConnectorState>;
}) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menuPoint, setMenuPoint] = useState<ClientPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setDrag(null);
    setMenuPoint(null);
    context.patchState<ConnectorState>({ engaged: false });
  };

  useEffect(() => {
    if (!menuPoint) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuPoint]);

  useEffect(() => {
    if (!drag) {
      return undefined;
    }
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [drag]);

  const createWorkflow = async (kind: WorkflowKind) => {
    if (!menuPoint || busy) {
      return;
    }
    setBusy(true);
    const api = context.api;
    const appState = api.getAppState();
    const dropPoint = viewportCoordsToSceneCoords(
      { clientX: menuPoint.x, clientY: menuPoint.y },
      appState,
    );
    const width = 360;
    const height = 266;
    const nodeId = crypto.randomUUID();
    const controller = createCanvasController(api);
    try {
      await controller.apply({
        operations: [
          {
            type: "create",
            items: [
              {
                kind: "custom",
                id: nodeId,
                x: dropPoint.x + 56,
                y: dropPoint.y - height / 2,
                width,
                height,
                customType: WORKFLOW_CUSTOM_TYPE,
                rendererId: WORKFLOW_RENDERER_ID,
                schemaVersion: 1,
                previewFileId: WORKFLOW_PREVIEW_FILE_ID,
                data: {
                  name:
                    kind === "image"
                      ? "生图 Workflow 节点"
                      : "生视频 Workflow 节点",
                  workflowKind: kind,
                  devFixture: true,
                },
              },
            ],
          },
          {
            type: "connect",
            from: context.element.id,
            to: nodeId,
            routing: "auto-cubic",
            fromAnchor: { x: 1, y: 0.5 },
            toAnchor: { x: 0, y: 0.5 },
            strokeColor: "#7d8492",
            strokeWidth: 1.35,
            strokeGradient: {
              type: "linear",
              startColor: "#c9ccd4",
              endColor: "#7d8492",
              startOpacity: 0.68,
              endOpacity: 0.82,
            },
          },
          { type: "viewport", select: [nodeId] },
        ],
      });
      close();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "创建 Workflow 节点失败",
      );
      close();
    } finally {
      controller.destroy();
      setBusy(false);
    }
  };

  const menuPosition = menuPoint
    ? {
        left: Math.min(
          Math.max(14, menuPoint.x + 12),
          Math.max(14, window.innerWidth - 250),
        ),
        top: Math.min(
          Math.max(14, menuPoint.y + 12),
          Math.max(14, window.innerHeight - 154),
        ),
      }
    : null;
  const previewPath = drag
    ? getAutoCubicGeometry(drag.start, drag.current).path
    : null;

  return (
    <>
      <button
        type="button"
        className="workflow-connector__point"
        aria-label="从此节点创建工作流连线"
        title="拖拽创建工作流"
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const start = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setMenuPoint(null);
          setDrag({ pointerId: event.pointerId, start, current: start });
          context.patchState<ConnectorState>({ engaged: true });
        }}
        onPointerMove={(event) => {
          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }
          event.preventDefault();
          setDrag({
            ...drag,
            current: { x: event.clientX, y: event.clientY },
          });
        }}
        onPointerUp={(event) => {
          if (!drag || drag.pointerId !== event.pointerId) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDrag(null);
          setMenuPoint({ x: event.clientX, y: event.clientY });
        }}
        onPointerCancel={close}
      >
        <span />
      </button>

      {drag &&
        createPortal(
          <svg className="workflow-connector__preview" aria-hidden="true">
            <defs>
              <linearGradient
                id="workflow-connector-preview-gradient"
                gradientUnits="userSpaceOnUse"
                x1={drag.start.x}
                y1={drag.start.y}
                x2={drag.current.x}
                y2={drag.current.y}
              >
                <stop offset="0" stopColor="#c9ccd4" stopOpacity="0.68" />
                <stop offset="1" stopColor="#7d8492" stopOpacity="0.82" />
              </linearGradient>
            </defs>
            <path
              className="workflow-connector__preview-shadow"
              d={previewPath ?? undefined}
            />
            <path
              className="workflow-connector__preview-line"
              d={previewPath ?? undefined}
            />
            <circle
              className="workflow-connector__preview-end"
              cx={drag.current.x}
              cy={drag.current.y}
              r="5"
            />
          </svg>,
          document.body,
        )}

      {menuPoint &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            className="workflow-connector__menu"
            style={menuPosition}
            role="menu"
            aria-label="新建工作流节点"
          >
            <div className="workflow-connector__menu-title">新建节点</div>
            {(["image", "video"] as const).map((kind) => (
              <button
                type="button"
                role="menuitem"
                key={kind}
                disabled={busy}
                onClick={() => void createWorkflow(kind)}
              >
                <span className="workflow-connector__menu-icon">
                  <WorkflowKindIcon kind={kind} />
                </span>
                <span>
                  <strong>
                    {kind === "image" ? "新建生图" : "新建生视频"}
                  </strong>
                  <small>
                    {kind === "image" ? "Image workflow" : "Video workflow"}
                  </small>
                </span>
                <span className="workflow-connector__menu-arrow">↗</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};

export const customNodeConnectionOverlay: CustomElementOverlayDefinition<
  CustomElementData,
  ConnectorState
> = {
  id: "workflow-connector",
  kind: "popover",
  stateScope: "workflow-connector",
  coordinateSpace: "screen",
  visibility: ({ isHovered, isSelected, state }) =>
    isHovered || isSelected || state?.engaged === true,
  transition: { enterMs: 110, exitMs: 140, easing: "ease-out" },
  interaction: { pointer: "overlay", wheel: "canvas" },
  anchor: ({ element }) => ({
    x: element.width,
    y: element.height / 2,
  }),
  placement: "right",
  offset: 8,
  collision: false,
  style: {
    width: 32,
    height: 32,
    display: "grid",
    placeItems: "center",
  },
  render: (context) => <WorkflowConnector context={context} />,
};
