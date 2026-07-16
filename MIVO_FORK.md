# Mivo Excalidraw Fork

This document is the canonical overview of the Mivo Excalidraw fork. Read it before designing new canvas, Custom Element, overlay, resource, or agent-facing features.

## Identity and baseline

- Repository: `https://github.com/xindong/mivo-excalidraw`
- Upstream: `https://github.com/excalidraw/excalidraw`
- Fork baseline commit: `acb48c3f454f050353c32819d7a5deded201e9db`
- First consolidated prerelease: `0.18.1-mivo.1`
- Current prerelease: `0.18.1-mivo.4`
- npm package: `@miragari/mivo-excalidraw`
- npm dist-tag: `mivo`

The Mivo package family renames the required upstream workspace packages under the `@miragari/mivo-*` scope while preserving their internal `@excalidraw/*` dependency keys through npm aliases.

## What the fork adds

### Native Custom Elements

`custom` is a first-class Excalidraw element with restore, normalization, selection, hit testing, resizing, export, clipboard, and file collection support. A Custom Element contains:

- `customType`: host-defined semantic type.
- `rendererId` and version fields: Canvas renderer identity.
- `data`: JSON-compatible, scene-persisted business data.
- `resource`: stable host-owned reference to the original asset.
- `previewFileId`: Excalidraw-owned image used by the Canvas renderer.

Custom renderers use `CustomElementPainter`. They may declare a logical `viewBox` and a zoom/source/fixed cache strategy. Painter commands are shared by interactive Canvas rendering and SVG export.

### Custom Element Extension API

The public v1 registration unit is:

```ts
const extension = defineCustomElementExtension({
  definition,
  overlays,
  lifecycle: {
    onSelectionChange,
    onViewportChange,
  },
});

registerCustomElementExtension(extension);
// React hosts may use useRegisterCustomElement(extension).
```

The lower-level `registerCustomElement()` and `registerCustomElementOverlays()` remain available for advanced dynamic registration.

### Resource and Preview lifecycle

The host owns original files through `CustomElementAssetStore`:

```text
original File/Blob -> AssetStore.put() -> element.resource
preview File/Blob  -> Excalidraw BinaryFiles -> element.previewFileId
```

The core never assumes a filesystem, URL scheme, database, or media type. `AssetStore.resolve()` may return a Blob, File, URL string, or null.

Preview results have fixed semantics:

- `FileId`, `File`, or `Blob`: atomically replace the preview.
- `{ type: "clear" }`: explicitly remove the preview.
- `null`: keep the current preview unchanged.

`refreshCustomElementPreview()` is latest-wins per element. A new image is stored and decoded into `ImageCache` before `previewFileId` changes, preventing an image-to-empty-to-image flash.

### Overlay Layer

Interactive DOM is provided by the editor-owned Overlay Layer. The supported kinds are `surface`, `panel`, and `popover`.

- Surface defaults: pointer and wheel input go to the Canvas.
- Panel/Popover defaults: pointer stays in the overlay; wheel goes to Canvas.
- `presence`: `entering`, `present`, or `exiting`.
- `transition`: optional opacity enter/exit timing.
- `visibility`: selected, hovered, active, always, never, or a function.
- `stateScope`: overlays sharing a scope share transient editor state.
- `closeAfter()`: closes only if its captured open generation is still active.

Overlay state is never serialized. Persisted progress or application modes must be written explicitly with `updateCustomElementData()`.

### Imperative APIs

The Excalidraw API adds:

- `insertCustomElementFromFile()`
- `insertCustomElementsFromFiles()`
- `refreshCustomElementPreview()`
- `updateCustomElementData()`
- `activateCustomElement()`
- `customElementOverlays`

Hosts may opt clipboard files into registered Custom Element definitions with `customElementFileImport.paste`. The core routes normalized files before the native image importer, falls back when no definition matches, and exposes a resolver for ambiguous matches.

Batch import is atomic for one `customType` invocation. Mixed media in the fixture is intentionally implemented as multiple type-specific batches; it is not a cross-type transaction.

### React resource hook

React consumers import:

```ts
import { useCustomElementResource } from "@miragari/mivo-excalidraw/custom-elements/react";
```

The hook resolves host resources, handles abort/races, creates Object URLs for Blob/File results, and revokes them during replacement or unmount.

### Canvas Core SDK

The Canvas Core SDK is exported from `@miragari/mivo-excalidraw/canvas`. It provides a stable inspect/apply protocol for applications, agents, and MCP tools:

- scene inspection and pagination
- typed create/patch/transform/layout/connect/delete operations
- revision tracking
- structured errors
- controller extensions and capability discovery

Agent integrations should translate tool calls into Canvas operations. They must not depend on App internals or mutate scene element objects directly.

The `/canvas` runtime is built as an independent entry point. Importing it does not load the React editor entry.

### Host capabilities and rendering controls

The fork also exposes host-facing capability controls used by the isolated fixture, including rotation, per-element-type resize and double-click policy, UI suppression, viewport constraints, and Custom Element cache behavior. Custom renderers may independently configure selection-border padding, color, width, radius, and transform-handle geometry.

## Architecture boundaries

The core must not contain `video`, `audio`, or application-specific card semantics. The correct division is:

| Concern                          | Owner                  |
| -------------------------------- | ---------------------- |
| Serializable node identity/data  | Custom Element core    |
| Deterministic visual preview     | Canvas renderer        |
| Original file persistence        | Host AssetStore        |
| Preview storage/cache            | Excalidraw core        |
| Interactive controls/DOM         | Overlay Layer          |
| Playback/decoding/business rules | Host extension/fixture |
| Agent scene operations           | Canvas Core SDK        |

## Development fixture

Run the repository fixture with:

```bash
npx --yes yarn@1.22.22 start
```

Open `http://localhost:9901/custom-elements.html`. The fixture supports mixed multi-file image/video import, Custom Canvas cards, a video DOM surface, play/pause/progress controls, preview refresh, Overlay transitions, and an in-memory AssetStore.

The in-memory store is intentionally non-persistent. Production hosts must provide their own storage and resource resolution.

## Performance model

- Custom Canvas renderers use cached offscreen canvases.
- Source cache mode keeps a stable high-quality cache across zoom changes.
- Overlay entrance updates are coalesced into one animation-frame state commit.
- Batch Preview files are staged and committed once per import batch.
- Chrome may still report an occasional long animation frame while decoding or drawing many large assets. Repeated warnings during steady-state interaction should be profiled before changing cache policy.

## Release and upstream policy

Mivo releases are prereleases and use the `mivo` npm dist-tag. Every release must identify its exact Git commit and upstream baseline, be built from a clean worktree, pass package-content validation, and be smoke-installed from the generated tarball before publishing.

Keep generally useful Excalidraw fixes isolated where possible so they can be submitted upstream. Mivo-specific public APIs may remain fork-only, but should avoid unnecessary divergence from upstream element and scene invariants.

Detailed API and release documents live in `dev-docs/docs/mivo/`.
