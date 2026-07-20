# Mivo Excalidraw

[![npm mivo 版本](https://img.shields.io/npm/v/%40miragari%2Fmivo-excalidraw/mivo?label=npm%20mivo)](https://www.npmjs.com/package/@miragari/mivo-excalidraw)
[![MIT 许可证](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mivo Excalidraw 是一个持续维护的 [Excalidraw](https://github.com/excalidraw/excalidraw) fork，面向需要原生业务元素、交互式 DOM 覆盖层、宿主资源管理和稳定画布自动化 API 的应用。

本项目保持对上游 React 编辑器的兼容，同时通过 [`@miragari/mivo-excalidraw`](https://www.npmjs.com/package/@miragari/mivo-excalidraw) 发布 Mivo 专用 SDK。当前预发布版本线为 `0.18.1-mivo.x`，通过 npm 的 `mivo` dist-tag 发布。

## 为什么需要这个 fork

应用专属的媒体卡片和 Agent 画布操作不应该依赖编辑器的私有内部实现。Mivo Excalidraw 提供公开、可复用的扩展基础能力，同时将媒体解码、存储、播放和业务工作流继续留在宿主应用中。

| 能力 | 说明 |
| --- | --- |
| 原生 Custom Element | 支持宿主定义可序列化元素，并具备确定性的 Canvas/SVG 渲染、选择、缩放、剪贴板、恢复和导出能力。 |
| Custom Element Extension | 通过一个注册单元统一声明 Definition、Overlay、集合生命周期、选择变化和视口变化。 |
| Overlay Layer | 由编辑器管理 `surface`、`panel` 和 `popover` DOM 覆盖层，统一处理坐标、指针、滚轮、Presence、过渡动画和共享状态。 |
| Resource 与 Preview 生命周期 | 原始资源由宿主通过 `CustomElementAssetStore` 管理，静态预览由 Excalidraw 通过 `previewFileId` 管理。 |
| Canvas Core SDK | 为应用、Agent 和 MCP 工具提供类型化 inspect/apply 操作、分页、revision、结构化错误、扩展和能力发现。 |
| 宿主能力配置 | 显式控制编辑器 UI、视口行为、Custom Element 选择、缩放、旋转、双击和渲染缓存。 |

## 安装

直接安装 fork：

```bash
npm install @miragari/mivo-excalidraw@0.18.1-mivo.10 react react-dom
```

```tsx
import { Excalidraw } from "@miragari/mivo-excalidraw";
import "@miragari/mivo-excalidraw/index.css";
```

已有应用可以通过 npm alias 保留原来的 `@excalidraw/excalidraw` import 路径：

```json
{
  "dependencies": {
    "@excalidraw/excalidraw": "npm:@miragari/mivo-excalidraw@0.18.1-mivo.10"
  }
}
```

## 公开入口

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

Custom Element 将业务身份和稳定资源引用持久化到场景中；交互式播放状态只保存在编辑器本地的 Overlay Layer。原始文件始终由宿主管理，Excalidraw 只负责可渲染的静态 Preview。

## 架构

```text
宿主应用
  ├─ 业务工作流与持久化
  ├─ CustomElementAssetStore
  └─ Custom Element Extension
       ├─ 确定性的 Canvas/SVG Renderer
       ├─ 编辑器管理的交互式 Overlay
       └─ 生命周期回调

应用 / Agent / MCP
  └─ CanvasController.inspect() / apply()
       └─ Excalidraw 场景与 Imperative API
```

核心层刻意保持媒体无关。视频、音频、图片、工作流和存储逻辑属于宿主扩展，不应成为硬编码的新 Excalidraw 元素类型。

## 文档

- [Fork 架构、上游基线与公开 API 清单](./MIVO_FORK.md)
- [Custom Element 开发文档](./dev-docs/docs/mivo/custom-elements.mdx)
- [Canvas Core SDK 文档](./dev-docs/docs/mivo/canvas-core.mdx)
- [发布流程](./dev-docs/docs/mivo/release.mdx)
- [npm 包 README](./packages/excalidraw/README.md)

## 开发

本仓库保留上游 monorepo 结构，并继续使用 Yarn 1 工具链。

```bash
npx --yes yarn@1.22.22 install
npx --yes yarn@1.22.22 start
```

打开 `http://localhost:9901/custom-elements.html` 可以访问独立的 Custom Element 开发夹具。该页面演示混合媒体导入、带缓存的 Canvas 卡片、交互式 Overlay、Preview 刷新和内存 AssetStore。

修改 fork 专属 API 或架构前，请先阅读 [`MIVO_FORK.md`](./MIVO_FORK.md) 和 [`AGENTS.md`](./AGENTS.md)。

## 发布

Mivo 构建以预发布版本形式通过 npm 的 `mivo` dist-tag 发布。每次发布都必须基于干净提交构建，校验暂存包内容，并在正式发布前对生成的 tarball 执行安装 smoke test。

```bash
npm install @miragari/mivo-excalidraw@mivo
```

完整校验和发布流程见[发布指南](./dev-docs/docs/mivo/release.mdx)。

## 上游与许可证

Mivo Excalidraw 基于开源项目 [Excalidraw](https://github.com/excalidraw/excalidraw)。具有通用价值的修复应尽量保持独立，以便回馈上游；Mivo 专属 API 则通过明确记录的扩展点与上游实现隔离。

本项目遵循 [MIT 许可证](./LICENSE)。Excalidraw 及其原始贡献者保留对上游工作的署名权。
