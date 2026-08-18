# 📋 Changelog

All notable changes to the **Mermaid Browser & Live Editor** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.5] - 2026-08-18

### Added
- **High-Fidelity Markdown-to-PDF Exporter:** Full support for LaTeX math equations (`$$...$$` display and `$...$` inline) rendered via embedded **KaTeX** into native MathML without external font dependencies.
- **Automated Local Image Inlining:** Local `.png`, `.jpg`, `.svg`, and `.webp` images are automatically resolved and embedded as base64 data URIs during PDF generation.
- **Smart A4 Pagination:** Intelligent boundary calculations to prevent clipping code blocks, math equations, and diagram cards.
- **In-Markdown Floating Preview Toolbar:** Embedded glassmorphism toolbar in native VS Code Markdown Preview with Zoom In (`+`), Zoom Out (`-`), Reset Zoom, Fit to Width, and direct actions.
- **In-Editor CodeLens Quick Actions:** Quick buttons (`Preview Diagram`, `Edit Live`, `Copy Source`, `Export SVG`) right above all ` ```mermaid ` fences in `.md` files.
- **Two-Way Live Diagram Editor:** Dedicated split-view live editor with real-time bidirectional synchronization back to Markdown source.
- **Custom Brand Logo & Assets:** New glowing dark charcoal and neon magenta brand identity.
- **Open Source Community Infrastructure:** Added GitHub CI/CD workflows, Dependabot, PR templates, Issue templates, `CONTRIBUTING.md`, and `SECURITY.md`.

### Fixed
- Fixed black artifact rendering on complex SVG diagrams during PDF export by introducing high-resolution canvas pre-rasterization.
- Fixed `.vscodeignore` packaging filter to bundle optimized documentation assets.
- Configured `--no-rewrite-relative-links` during VSIX packaging to ensure local image loading in extension details.

---

## [0.1.0] - Initial Release

- Workspace-wide Mermaid diagram scanning and indexing for `.mmd`, `.mermaid`, and Markdown files.
- Fuzzy search across diagram titles, types, and paths.
- Standalone diagram creator and SVG/PNG exporter.
