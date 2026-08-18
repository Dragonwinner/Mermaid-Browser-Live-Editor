<div align="center">

![Mermaid Browser Logo](https://raw.githubusercontent.com/Dragonwinner/Mermaid-Browser-Live-Editor/main/assets/logo.png)

# Mermaid Browser & Live Editor

### *The Ultimate Local-First Mermaid Workspace Explorer, Live Visual Editor, Interactive Markdown Preview Toolbar, and Publication-Grade PDF Exporter for VS Code & Antigravity IDE.*

[![VS Code Extension](https://img.shields.io/badge/VS_Code-v1.85.0+-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com)
[![Mermaid Version](https://img.shields.io/badge/Mermaid-v11.16.1-ff3670?logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![KaTeX Math](https://img.shields.io/badge/KaTeX_LaTeX-Enabled-3775a9?logo=latex&logoColor=white)](https://katex.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE.txt)
[![Offline First](https://img.shields.io/badge/Privacy-100%25_Offline_%2F_Zero_Cloud-success.svg)](#privacy--architecture)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/Dragonwinner/Mermaid-Browser-Live-Editor/pulls)
[![Contributing Guide](https://img.shields.io/badge/Contributor-Guide-orange.svg)](./CONTRIBUTING.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blueviolet.svg)](./SECURITY.md)

</div>

---

## 🚀 Overview

**Mermaid Browser** is a powerhouse, **100% local-first** VS Code extension that transforms your markdown and diagramming experience. Whether you are crafting complex system architectures, engineering state machines, documenting database schemas, or writing academic masterclasses, Mermaid Browser provides instant workspace indexing, live visual editing, interactive preview toolbars, and publication-ready Markdown-to-PDF compilation with embedded LaTeX math rendering.

> **💡 Zero External Dependencies:** Unlike other extensions, Mermaid Browser contains its own bundled Mermaid engine, KaTeX math compiler, and PDF generation pipeline. No external Markdown preview extensions or cloud accounts required.

---

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
  - [1. Workspace-Wide Diagram Indexer & Explorer](#1-workspace-wide-diagram-indexer--explorer)
  - [2. Interactive In-Markdown Floating Toolbar](#2-interactive-in-markdown-floating-toolbar)
  - [3. CodeLens & Inline Quick Actions](#3-codelens--inline-quick-actions)
  - [4. Real-Time Two-Way Live Diagram Editor](#4-real-time-two-way-live-diagram-editor)
  - [5. High-Fidelity Markdown-to-PDF Exporter (with KaTeX Math)](#5-high-fidelity-markdown-to-pdf-exporter-with-katex-math)
- [📊 Supported Diagram Types](#-supported-diagram-types)
- [🎯 How to Use & Workflows](#-how-to-use--workflows)
- [⌨️ Commands Reference](#️-commands-reference)
- [⚙️ Configuration & Settings](#️-configuration--settings)
- [🔒 Privacy & Architecture](#-privacy--architecture)
- [🛠️ Build & Contribution](#️-build--contribution)
- [📄 License & Notices](#-license--notices)

---

## ✨ Key Features

### 1. Workspace-Wide Diagram Indexer & Explorer
- **Automatic Discovery:** Instantly parses and indexes all standalone `.mmd` / `.mermaid` files and all ` ```mermaid ` fences embedded across Markdown (`.md`) files in your workspace.
- **Fuzzy Search:** Search instantly by diagram title, type, file name, or relative folder path.
- **Category & Type Filters:** Filter by Flowchart, Sequence, Class, State, Entity Relationship (ER), Gantt, Git Graph, Pie, Mindmap, Requirement, C4, and more.
- **Side-by-Side Inspector:** Split view featuring high-res SVG canvas on one side and editable source with line diagnostics on the other.
- **Theme Switcher:** Switch between `default`, `dark`, `neutral`, `forest`, and `base` themes on the fly.

![Workspace Diagram Browser and Search](https://raw.githubusercontent.com/Dragonwinner/Mermaid-Browser-Live-Editor/main/images/browser.gif)

*Figure 1: Instant workspace-wide diagram catalog, search filtering, and live SVG inspector.*

### 2. Interactive In-Markdown Floating Toolbar
When previewing any Markdown file in VS Code's native Markdown Preview (`Ctrl+Shift+V` / `Cmd+Shift+V`):
- **Embedded Controls:** Every rendered Mermaid diagram gets a sleek, floating glassmorphism toolbar.
- **Zoom & Pan Controls:** Zoom In (`+`), Zoom Out (`-`), Reset Zoom, and Auto-Fit to Width.
- **Oversized Diagram Protection:** Built-in horizontal and vertical scroll containers ensure diagrams never clip or overflow your editor.
- **High-DPI Readability:** Automatic `viewBox` inspection forces crisp typography and high legibility even for giant system flowcharts.
- **Direct Actions:** One-click `✏️ Edit Live`, `📋 Copy Source`, and `💾 Export SVG` directly from the preview!

![In-Markdown Floating Zoom and Pan Toolbar](https://raw.githubusercontent.com/Dragonwinner/Mermaid-Browser-Live-Editor/main/images/zoom-in-zoom-out.gif)

*Figure 2: Native Markdown preview floating toolbar with real-time zoom, pan, and live edit controls.*

### 3. CodeLens & Inline Quick Actions
Right above every ` ```mermaid ` code block inside `.md` files, click dedicated CodeLens buttons:
- **`$(preview) Preview Diagram`** — Jump directly into the diagram browser with this diagram focused.
- **`$(edit) Edit Live`** — Open an interactive live editor panel beside your code with two-way synchronization.
- **`$(copy) Copy Diagram Source`** — Copy clean Mermaid source to your clipboard.
- **`$(export) Export Diagram as SVG`** — Export production-ready vector graphics.

### 4. Real-Time Two-Way Live Diagram Editor
- **Live Side-by-Side Editing:** Edit your Mermaid code in a dedicated panel with instantaneous SVG preview rendering.
- **Real-Time Sync:** Changes made in the live editor seamlessly propagate back to your source Markdown file.
- **Syntax Error Diagnostics:** Live error banners with exact line numbers and helpful error messages prevent broken diagrams.
- **Interactive Canvas:** Smooth drag-to-pan, mouse-wheel zooming, and 1-click center alignment.

### 5. High-Fidelity Markdown-to-PDF Exporter (with KaTeX Math)
Convert comprehensive Markdown documents into stunning, print-ready PDF reports:
- **Mermaid Diagrams Rendered as Vector/PNG:** Clean diagram rasterization eliminates dark/distorted artifacts and preserves crisp SVG styling.
- **LaTeX Math Support (KaTeX):** Full support for inline math (`$E = mc^2$`) and multiline display equations (`$$\sum_{i=1}^n x_i$$`) rendered cleanly via native MathML.
- **Local & Relative Image Inlining:** Automatically resolves and encodes local `.png`, `.jpg`, `.svg`, and `.webp` images as inline base64 assets.
- **Smart A4 Pagination:** Intelligent boundary calculation avoids splitting single code blocks, tables, math formulas, or diagram cards across page breaks.
- **3-Way Trigger Access:**
  1. **File Explorer:** Right-click any `.md` file in the sidebar &rarr; `Mermaid Browser: Export Markdown as PDF`.
  2. **Editor Context:** Right-click inside an active Markdown editor &rarr; `Mermaid Browser: Export Markdown as PDF`.
  3. **Editor Navigation Bar:** Click the `$(file-pdf)` icon at the top right of your markdown editor.

![Markdown to PDF Export with Rendered Diagrams](https://raw.githubusercontent.com/Dragonwinner/Mermaid-Browser-Live-Editor/main/images/pdf-export.gif)

*Figure 3: Seamless Markdown-to-PDF export pipeline with KaTeX LaTeX math and rendered Mermaid diagrams.*

---

## 📊 Supported Diagram Types

Mermaid Browser supports all standard Mermaid syntax flavors:

| Diagram Type | Syntax Starter | Typical Use Case |
|---|---|---|
| **Flowchart** | `flowchart TD` / `graph LR` | System architecture, decision trees, CI/CD pipelines |
| **Sequence Diagram** | `sequenceDiagram` | API request/response flows, microservice interactions |
| **Class Diagram** | `classDiagram` | Object-oriented domain models, TypeScript/Java architectures |
| **State Diagram** | `stateDiagram-v2` | State machines, lifecycle flows, authentication states |
| **Entity Relationship (ER)** | `erDiagram` | Database schemas, SQL table relationships, ORM mapping |
| **Gantt Chart** | `gantt` | Project timelines, sprint roadmaps, release milestones |
| **Git Graph** | `gitGraph` | Git branch models, release workflows, rebase tracking |
| **Pie Chart** | `pie title ...` | Resource allocation, performance breakdowns, metrics |
| **Mindmap** | `mindmap` | Brainstorming, domain exploration, taxonomy mapping |
| **Quadrant Chart** | `quadrantChart` | Priority matrices, technology radars, SWOT analysis |
| **Requirement Diagram** | `requirementDiagram` | Systems engineering, specification verification |
| **C4 Architecture** | `C4Context` / `C4Container` | Cloud infrastructure, microservices ecosystem modeling |

---

## 🎯 How to Use & Workflows

### Browsing Diagrams in Your Workspace
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).
2. Type **`Mermaid Browser: Open Workspace Browser`** and press `Enter`.
3. Use the search bar or category pills to navigate across all diagrams in your project.

### Editing a Diagram Inline from Markdown
1. Open any `.md` file containing a ` ```mermaid ` fence.
2. Click **`Edit Live`** in the CodeLens above the fence (or right-click and select `Mermaid Browser: Edit Live`).
3. Tweak nodes, connections, labels, or themes in real-time.

### Exporting Full Markdown Documents to PDF
1. Right-click any `.md` file in the File Explorer or editor.
2. Select **`Mermaid Browser: Export Markdown as PDF`**.
3. Choose destination file name and save.
4. Once compiled, click **`Open PDF`** in the notification banner to view the result.

---

## ⌨️ Commands Reference

| Command | Title | Context / Keybinding | Description |
|---|---|---|---|
| `mermaidBrowser.open` | **Open Workspace Browser** | Palette, Explorer, Editor Title | Opens the searchable workspace diagram catalogue |
| `mermaidBrowser.previewDiagram` | **Preview Current Diagram** | Palette, Editor Title (`.mmd`) | Previews the currently active `.mmd`/`.mermaid` file |
| `mermaidBrowser.createDiagram` | **Create Diagram** | Command Palette | Scaffolds a new Mermaid diagram template |
| `mermaidBrowser.refresh` | **Refresh Workspace Index** | Palette, Browser Title | Re-scans the workspace for new or updated diagrams |
| `mermaidBrowser.exportMarkdownPdf` | **Export Markdown as PDF** | Palette, Explorer, Editor Title | Converts active Markdown document to formatted PDF |
| `mermaidBrowser.editLive` | **Edit Live** | CodeLens, Editor Context | Launches split-view interactive live editor |
| `mermaidBrowser.copyInline` | **Copy Diagram Source** | CodeLens | Copies raw Mermaid diagram text to clipboard |
| `mermaidBrowser.exportSvgInline` | **Export Diagram as SVG** | CodeLens | Exports isolated diagram to clean SVG format |

---

## ⚙️ Configuration & Settings

Customize Mermaid Browser behavior via VS Code Settings (`Ctrl+,` or `Cmd+,` &rarr; search `Mermaid Browser`):

```json
{
  // Maximum number of workspace files indexed by Mermaid Browser
  "mermaidBrowser.fileLimit": 2500,

  // Index Mermaid code fences found inside Markdown (.md) files
  "mermaidBrowser.includeMarkdown": true,

  // Default Mermaid theme used for diagram rendering
  // Options: "default" | "dark" | "neutral" | "forest" | "base"
  "mermaidBrowser.previewTheme": "default"
}
```

---

## 🔒 Privacy & Architecture

- **100% Offline & Local-First:** No data, telemetry, code snippets, or diagrams are ever transmitted over the network.
- **Strict Content Security Policy (CSP):** Webviews run with hardened security rules preventing unauthorized script execution or remote asset injection.
- **Fast Build Bundle:** Compiled using `esbuild` into high-performance browser and Node.js bundles.
- **Lightweight Footprint:** Memory-efficient AST parsing ensures instantaneous indexing even across repositories with thousands of files.

---

## 🛠️ Build & Contribution

Contributions and feature suggestions are always welcome!

### Prerequisites
- Node.js `v18.0.0` or higher
- `pnpm` or `npm`

### Local Development Setup
```bash
# Clone the repository
git clone https://github.com/Dragonwinner/Mermaid-Browser-Live-Editor.git
cd Mermaid-Browser-Live-Editor

# Install dependencies
pnpm install

# Compile TypeScript and bundle webview assets
pnpm run compile

# Package as a .vsix extension
pnpm run package
```

### Running Extension in Debug Mode
1. Open the project root in VS Code / Antigravity IDE.
2. Press `F5` to launch an **Extension Development Host** window.
3. Test commands, preview markdown files, or export PDFs in real time!

---

## 📄 License & Notices

Distributed under the **MIT License**. See [`LICENSE.txt`](./LICENSE.txt) for full terms.  
Third-party licenses and notices are documented in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

---

<div align="center">
  <b>Crafted with ❤️ by StudyWithGod</b><br/>
  <i>Empowering developers, architects, and researchers with next-generation diagramming tools.</i>
</div>
