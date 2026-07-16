import { useEffect, useRef, useState } from "react";

import { useCustomElementResource } from "@excalidraw/excalidraw/custom-elements/react";

import type {
  CustomElementLifecycleContext,
  CustomElementOverlayController,
  CustomElementOverlayDefinition,
  CustomElementOverlayVisibilityContext,
  TypedExcalidrawCustomElement,
} from "@excalidraw/excalidraw";

import { getMediaLayout } from "./customElementLayout";

import type { CSSProperties } from "react";

import type { DevMediaData, DevVideoData } from "./customElements";

const VIDEO_STATE_SCOPE = "video-player";

const isOnlySelected = ({
  element,
  appState,
}: CustomElementOverlayVisibilityContext) =>
  appState.selectedElementIds[element.id] === true &&
  Object.values(appState.selectedElementIds).filter(Boolean).length === 1;

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  background: "#6d4aff",
  color: "white",
  font: "600 13px Arial, sans-serif",
};

type VideoPlaybackState = Readonly<{
  currentTime: number;
  duration: number;
  playing: boolean;
}>;

const normalizeVideoPlaybackState = (
  state: Partial<VideoPlaybackState> | undefined,
  element: TypedExcalidrawCustomElement<DevVideoData>,
): VideoPlaybackState => {
  const elementDuration =
    typeof element.data.duration === "number" &&
    Number.isFinite(element.data.duration)
      ? element.data.duration
      : 0;
  return {
    currentTime:
      typeof state?.currentTime === "number" &&
      Number.isFinite(state.currentTime)
        ? state.currentTime
        : 0,
    duration:
      typeof state?.duration === "number" && Number.isFinite(state.duration)
        ? state.duration
        : elementDuration,
    playing: state?.playing === true,
  };
};

const getVideoPlaybackState = (
  runtime: CustomElementOverlayController,
  element: TypedExcalidrawCustomElement<DevVideoData>,
) =>
  normalizeVideoPlaybackState(
    runtime.getState<VideoPlaybackState>(element.id, VIDEO_STATE_SCOPE),
    element,
  );

const refreshAndCloseSurface = (
  context: Pick<
    CustomElementLifecycleContext<DevVideoData>,
    "element" | "api" | "runtime"
  >,
  reason: string,
) => {
  const playback = getVideoPlaybackState(context.runtime, context.element);
  context.runtime.patchState<VideoPlaybackState>(
    context.element.id,
    VIDEO_STATE_SCOPE,
    { ...playback, playing: false },
  );
  const refresh =
    playback.currentTime > 0.01
      ? context.api.refreshCustomElementPreview(context.element.id, {
          request: {
            reason,
            data: { currentTime: playback.currentTime },
          },
        })
      : Promise.resolve();
  void context.runtime.closeAfter(
    context.element.id,
    "video-surface",
    refresh,
    { closeOnError: true },
  );
};

const VideoSurface = ({
  element,
  assets,
  runtime,
  playback,
  onEnded,
}: {
  element: TypedExcalidrawCustomElement<DevVideoData>;
  assets: Parameters<typeof useCustomElementResource>[1];
  runtime: CustomElementOverlayController;
  playback: VideoPlaybackState;
  onEnded: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const resource = useCustomElementResource(element.resource, assets);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [resource.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resource.url) {
      return;
    }
    if (
      video.readyState >= video.HAVE_METADATA &&
      Math.abs(video.currentTime - playback.currentTime) > 0.5
    ) {
      video.currentTime = playback.currentTime;
    }
    if (playback.playing && ready) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playback.currentTime, playback.playing, ready, resource.url]);

  useEffect(
    () => () => {
      const video = videoRef.current;
      runtime.patchState<VideoPlaybackState>(element.id, VIDEO_STATE_SCOPE, {
        ...playbackRef.current,
        currentTime: video?.currentTime ?? playbackRef.current.currentTime,
        duration:
          video && Number.isFinite(video.duration)
            ? video.duration
            : playbackRef.current.duration,
      });
    },
    [element.id, runtime],
  );

  return resource.url ? (
    <video
      ref={videoRef}
      src={resource.url}
      muted
      playsInline
      preload="auto"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity: ready ? 1 : 0,
        transition: "opacity 120ms ease-out",
      }}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        const currentTime = Math.min(playback.currentTime, video.duration || 0);
        if (Math.abs(video.currentTime - currentTime) > 0.01) {
          video.currentTime = currentTime;
        } else if (video.readyState >= video.HAVE_CURRENT_DATA) {
          setReady(true);
        }
        runtime.patchState<VideoPlaybackState>(element.id, VIDEO_STATE_SCOPE, {
          ...playback,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
        });
      }}
      onLoadedData={(event) => {
        if (
          Math.abs(event.currentTarget.currentTime - playback.currentTime) < 0.1
        ) {
          setReady(true);
        }
      }}
      onSeeked={() => setReady(true)}
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        runtime.patchState<VideoPlaybackState>(element.id, VIDEO_STATE_SCOPE, {
          ...playback,
          currentTime: video.currentTime,
          duration: Number.isFinite(video.duration)
            ? video.duration
            : playback.duration,
        });
      }}
      onEnded={onEnded}
    />
  ) : null;
};

export const mediaCustomElementOverlays: readonly CustomElementOverlayDefinition<DevMediaData>[] =
  [
    {
      id: "player",
      kind: "surface",
      coordinateSpace: "element",
      visibility: "active",
      viewport: "keep-mounted",
      clip: true,
      bounds: ({ element }) =>
        getMediaLayout({
          width: element.width,
          height: element.height,
          sourceWidth: element.data.sourceWidth,
          sourceHeight: element.data.sourceHeight,
        }).mediaBounds,
      style: { background: "rgba(17, 17, 24, 0.92)" },
      render: () => (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "white",
            font: "600 16px Arial, sans-serif",
          }}
        >
          <span>Element-space DOM Surface</span>
        </div>
      ),
    },
    {
      id: "controls",
      kind: "panel",
      coordinateSpace: "screen",
      visibility: isOnlySelected,
      placement: "bottom",
      offset: 10,
      collision: { flip: true, shift: true, padding: 12 },
      style: {
        display: "flex",
        gap: 8,
        padding: 8,
        borderRadius: 10,
        background: "white",
        boxShadow: "0 6px 24px rgba(20, 20, 40, 0.18)",
      },
      render: ({ element, runtime }) => (
        <button
          style={buttonStyle}
          onClick={() => runtime.toggle(element.id, "player")}
        >
          切换 DOM Surface
        </button>
      ),
    },
  ];

export const videoCustomElementOverlays: readonly CustomElementOverlayDefinition<
  DevVideoData,
  VideoPlaybackState
>[] = [
  {
    id: "video-surface",
    kind: "surface",
    stateScope: VIDEO_STATE_SCOPE,
    coordinateSpace: "element",
    visibility: "active",
    transition: { enterMs: 160, exitMs: 160, easing: "ease-out" },
    viewport: "keep-mounted",
    clip: true,
    bounds: ({ element }) =>
      getMediaLayout({
        width: element.width,
        height: element.height,
        sourceWidth: element.data.sourceWidth,
        sourceHeight: element.data.sourceHeight,
      }).mediaBounds,
    style: { background: "transparent" },
    render: ({ element, assets, runtime, state, api }) => (
      <VideoSurface
        element={element}
        assets={assets}
        runtime={runtime}
        playback={normalizeVideoPlaybackState(state, element)}
        onEnded={() =>
          refreshAndCloseSurface({ element, api, runtime }, "playback-ended")
        }
      />
    ),
  },
  {
    id: "video-controls",
    kind: "panel",
    stateScope: VIDEO_STATE_SCOPE,
    coordinateSpace: "screen",
    visibility: isOnlySelected,
    placement: "bottom",
    offset: 10,
    collision: { flip: true, shift: true, padding: 12 },
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: 320,
      padding: 8,
      borderRadius: 10,
      background: "white",
      boxShadow: "0 6px 24px rgba(20, 20, 40, 0.18)",
    },
    render: ({ element, runtime, api, state, patchState }) => {
      const playback = normalizeVideoPlaybackState(state, element);
      const duration = Math.max(playback.duration, 0.01);
      return (
        <>
          <button
            style={{ ...buttonStyle, minWidth: 64 }}
            onClick={() => {
              if (!playback.playing) {
                patchState({ ...playback, playing: true, duration });
                runtime.open(element.id, "video-surface");
                return;
              }
              refreshAndCloseSurface(
                { element, api, runtime },
                "playback-paused",
              );
            }}
          >
            {playback.playing ? "暂停" : "播放"}
          </button>
          <input
            aria-label="视频进度"
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={Math.min(playback.currentTime, duration)}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(event) =>
              patchState({
                ...playback,
                currentTime: Number(event.currentTarget.value),
              })
            }
          />
          <span style={{ minWidth: 42, font: "12px Arial, sans-serif" }}>
            {Math.floor(playback.currentTime)}s
          </span>
        </>
      );
    },
  },
];

export const videoCustomElementLifecycle = {
  onSelectionChange: (
    context: CustomElementLifecycleContext<DevVideoData> &
      Readonly<{ isSelected: boolean; previousIsSelected: boolean }>,
  ) => {
    if (
      !context.isSelected &&
      context.runtime.isOpen(context.element.id, "video-surface")
    ) {
      refreshAndCloseSurface(context, "selection-lost");
    }
  },
};
