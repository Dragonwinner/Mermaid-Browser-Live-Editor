# 🤝 Contributing to Mermaid Browser & Live Editor

Thank you for your interest in contributing to **Mermaid Browser & Live Editor**! We welcome bug fixes, performance optimizations, new diagram syntax support, UI polish, exporter enhancements, and documentation improvements.

---

## 📑 Table of Contents
1. [Code of Conduct](#-code-of-conduct)
2. [Prerequisites](#-prerequisites)
3. [Local Development Setup](#-local-development-setup)
4. [Project Architecture](#-project-architecture)
5. [Development Workflow & Scripts](#-development-workflow--scripts)
6. [Debugging Webviews & Extension](#-debugging-webviews--extension)
7. [Submitting a Pull Request](#-submitting-a-pull-request)
8. [Reporting Issues](#-reporting-issues)

---

## 📜 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment. Please be respectful and constructive in all discussions, issues, and pull requests.

---

## 🛠️ Prerequisites

Before you start, ensure you have the following installed:
- **[Node.js](https://nodejs.org/)** (v18.x or v20.x recommended)
- **[pnpm](https://pnpm.io/)** (v10.x) or **npm**
- **[Visual Studio Code](https://code.visualstudio.com/)** or **Antigravity IDE**

---

## 💻 Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Dragonwinner/Mermaid-Browser-Live-Editor.git
cd Mermaid-Browser-Live-Editor
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Build & Compile Extension
```bash
# Type check and bundle with esbuild
pnpm run compile

# Or start watch mode for active development
pnpm run watch
```

### 4. Run & Debug in VS Code
1. Open the project folder in VS Code / Antigravity IDE.
2. Press **`F5`** (launches an **Extension Development Host** window).
3. In the new window, open any workspace with `.md` or `.mmd` files to test features in real time.

---

## 🏗️ Project Architecture

```
vscode-mermaid-chart/
├── src/
│   ├── extension.ts              # Extension entrypoint & command dispatching
│   ├── mermaidBrowserPanel.ts    # Workspace explorer & fuzzy search panel
│   ├── liveEditPanel.ts          # Interactive 2-way live diagram editor
│   ├── mermaidCodeLens.ts        # In-markdown inline CodeLens buttons
│   ├── markdownPreviewMermaid.ts # Injected floating preview toolbar & renderer
│   ├── markdownPdfPanel.ts       # Markdown-to-PDF compiler with KaTeX math
│   └── mermaidRuntime.ts         # Bundled browser runtime (Mermaid, KaTeX, DOMPurify, jsPDF)
├── assets/                       # Extension icons and logos
├── images/                       # Documentation and preview GIFs
├── syntaxes/                     # TextMate grammar for Mermaid syntax highlighting
└── .github/                      # CI/CD workflows and issue templates
```

---

## ⚙️ Development Workflow & Scripts

| Script | Command | Purpose |
|---|---|---|
| **`pnpm run check`** | `tsc -p . --noEmit` | Validates TypeScript types across the codebase |
| **`pnpm run compile`** | `esbuild ...` | Bundles Node extension, browser runtime & markdown preview |
| **`pnpm run watch`** | `esbuild ... --watch` | Automatically rebuilds upon file changes |
| **`pnpm run package`** | `vsce package ...` | Builds a standalone `.vsix` installer package |

---

## 🔍 Debugging Webviews & Extension

### Debugging Extension Backend
- Use standard `console.log()` or breakpoints in VS Code's debugger window while running via `F5`.

### Debugging Webviews (Live Editor, Diagram Browser, Preview Toolbar)
1. In the Extension Development Host window, press `Ctrl+Shift+P` (or `Cmd+Shift+P`).
2. Run **`Developer: Toggle Developer Tools`**.
3. Inspect console logs, DOM elements, CSS styles, and Webview message passing (`postMessage`).

---

## 🚀 Submitting a Pull Request

1. **Fork & Branch:** Create a feature branch (`git checkout -b feat/my-new-feature` or `fix/issue-description`).
2. **Commit Changes:** Write clear, concise commit messages.
3. **Verify Build:** Ensure `pnpm run check` and `pnpm run compile` pass with 0 errors.
4. **Test Features:** Verify both `.mmd` standalone files and embedded Markdown ```mermaid blocks.
5. **Open a PR:** Submit a Pull Request targeting the `main` branch with a clear description of the changes.

---

## 🔒 Security & Privacy Guidelines

- **100% Offline Guarantee:** Do not introduce external HTTP requests, analytics trackers, or cloud dependencies.
- **CSP Compliance:** Ensure all webview scripts adhere to strict nonced Content Security Policies.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE.txt).
