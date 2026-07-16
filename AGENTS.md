# Mivo Excalidraw Agent Guide

This repository is a maintained fork of Excalidraw. It is not an unmodified upstream checkout.

Before changing the fork-specific code, read [MIVO_FORK.md](./MIVO_FORK.md). The document is the source of truth for the public APIs, architecture, serialization boundaries, fixture scope, upstream baseline, and release flow.

## Working rules

- Keep the core abstractions media-agnostic. Video, audio, and image cards are Custom Element consumers, not core element types.
- Canvas renderers must remain deterministic Canvas/SVG commands. Interactive DOM belongs in the Custom Element Overlay Layer.
- `element.data` and `element.resource` are serialized. Overlay runtime state is editor-local and must never be serialized implicitly.
- Original assets are owned by the host `CustomElementAssetStore`. Preview images are owned by Excalidraw `BinaryFiles` and referenced by `previewFileId`.
- MCP/agent integrations should use the Canvas Core SDK exported from `@miragari/mivo-excalidraw/canvas`, not mutate the scene directly.
- `excalidraw-app/dev/customElements*` is a development fixture. Do not move media-specific behavior from it into the core.
- During normal frontend iteration, do not run a full build, full typecheck, or full lint unless the repository owner asks. A release owner must run the release validation gate once from a clean commit before publishing.
- Keep upstream-facing changes separable from Mivo-only integrations whenever practical, so suitable fixes can still be proposed upstream.

## Important entry points

- Custom Element core: `packages/element/src/customElement.ts`
- Overlay public types: `packages/excalidraw/customElementOverlay/types.ts`
- Overlay registry/runtime/layer: `packages/excalidraw/customElementOverlay/`
- Imperative Custom APIs: `packages/excalidraw/components/App.tsx`
- React resource hook: `packages/excalidraw/custom-elements/react.ts`
- Canvas Core SDK: `packages/excalidraw/canvas/`
- Development fixture: `excalidraw-app/dev/customElementsApp.tsx`
- Mivo release staging: `scripts/mivo-release.js`
