# Mivo Excalidraw

[![npm mivo version](https://img.shields.io/npm/v/%40miragari%2Fmivo-excalidraw/mivo?label=npm%20mivo)](https://www.npmjs.com/package/@miragari/mivo-excalidraw)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mivo Excalidraw is a maintained fork of [Excalidraw](https://github.com/excalidraw/excalidraw) for applications that need native business elements, interactive DOM overlays, host-owned assets, and a stable canvas automation API.

The fork stays compatible with the upstream React editor while publishing the Mivo-specific SDK as [`@miragari/mivo-excalidraw`](https://www.npmjs.com/package/@miragari/mivo-excalidraw). The current prerelease line is `0.18.1-mivo.x` and is published under the npm `mivo` dist-tag.

## Why this fork exists

Application-specific media cards and agent-driven canvas operations should not depend on private editor internals. Mivo Excalidraw adds public, reusable primitives for those integrations while keeping media decoding, storage, playback, and business workflows in the host application.

| Capability | What it provides |
| --- | --- |
| Native Custom Elements | Serializable host-defined elements with deterministic Canvas/SVG rendering, selection, resize, clipboard, restore, and export support. |
| Custom Element extensions | One registration unit for definitions, overlays, collection lifecycle, selection changes, and viewport changes. |
| Overlay Layer | Editor-owned `surface`, `panel`, and `popover` DOM overlays with coordinate, pointer, wheel, presence, transition, and shared-state handling. |
| Asset and Preview lifecycle | Host-owned original resources through `CustomElementAssetStore`, plus Excalidraw-owned static previews through `previewFileId`. |
| Canvas Core SDK | Typed inspect/apply operations, pagination, revisions, structured errors, extensions, and capability discovery for apps, agents, and MCP tools. |
| Host capabilities | Explicit control over editor UI, viewport behavior, Custom Element selection, resize, rotation, double-click, and renderer caching. |

## Install

Install the fork directly:

```bash
npm install @miragari/mivo-excalidraw@0.18.1-mivo.10 react react-dom
```

```tsx
import { Excalidraw } from "@miragari/mivo-excalidraw";
import "@miragari/mivo-excalidraw/index.css";
```

Existing applications can preserve their `@excalidraw/excalidraw` imports with an npm alias:

```json
{
  "dependencies": {
    "@excalidraw/excalidraw": "npm:@miragari/mivo-excalidraw@0.18.1-mivo.10"
  }
}
```

## Public entry points

```ts
import {
  Excalidraw,
  defineCustomElement,
  defineCustomElementExtension,
  defineCustomElementAssetStore,
} from "@miragari/mivo-excalidraw";

import {
  createCanvasController,
  type CanvasOperation,
} from "@miragari/mivo-excalidraw/canvas";

import {
  useCustomElementResource,
} from "@miragari/mivo-excalidraw/custom-elements/react";
```

Custom Elements persist business identity and stable resource references in the scene. Interactive playback state remains editor-local in the Overlay Layer. Original files remain owned by the host; Excalidraw only owns renderable previews.

## Architecture

```text
Host application
  ├─ business workflows and persistence
  ├─ CustomElementAssetStore
  └─ Custom Element extensions
       ├─ deterministic Canvas/SVG renderer
       ├─ editor-owned interactive overlays
       └─ lifecycle callbacks

Application / Agent / MCP
  └─ CanvasController.inspect() / apply()
       └─ Excalidraw scene and imperative API
```

The core is intentionally media-agnostic. Video, audio, image, workflow, and storage behavior belong in host extensions rather than new hard-coded Excalidraw element types.

## Documentation

- [Fork architecture, baseline, and public API inventory](./MIVO_FORK.md)
- [Custom Elements](./dev-docs/docs/mivo/custom-elements.mdx)
- [Canvas Core SDK](./dev-docs/docs/mivo/canvas-core.mdx)
- [Release process](./dev-docs/docs/mivo/release.mdx)
- [Published package README](./packages/excalidraw/README.md)

## Development

This repository keeps the upstream monorepo layout and Yarn 1 toolchain.

```bash
npx --yes yarn@1.22.22 install
npx --yes yarn@1.22.22 start
```

Open `http://localhost:9901/custom-elements.html` for the isolated Custom Element fixture. It demonstrates mixed media imports, cached Canvas cards, interactive overlays, preview refresh, and an in-memory AssetStore.

Before changing fork-specific APIs or architecture, read [`MIVO_FORK.md`](./MIVO_FORK.md) and [`AGENTS.md`](./AGENTS.md).

## Releases

Mivo builds are prereleases published under the npm `mivo` dist-tag. Every release is built from a clean commit, validates staged package contents, and smoke-installs the generated tarballs before publication.

```bash
npm install @miragari/mivo-excalidraw@mivo
```

See the [release guide](./dev-docs/docs/mivo/release.mdx) for the complete validation and publishing flow.

## Upstream and license

Mivo Excalidraw is based on the open-source [Excalidraw](https://github.com/excalidraw/excalidraw) project. Generally useful fixes should remain separable so they can be proposed upstream, while Mivo-specific APIs stay isolated behind documented extension points.

Licensed under the [MIT License](./LICENSE). Excalidraw and its original contributors retain attribution for the upstream work.
