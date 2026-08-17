# Mermaid Browser

Mermaid Browser is a local-first VS Code extension for finding, previewing, and
managing Mermaid diagrams across a workspace.

## Features

- Index `.mmd` and `.mermaid` files plus Mermaid code fences in Markdown.
- Search by diagram title, source path, or diagram type.
- Filter the workspace index by diagram type.
- Switch between a live Mermaid preview and source view.
- Scroll large previews horizontally and vertically without shrinking the diagram.
- Open the exact source line for diagrams embedded in Markdown.
- Copy diagram source or its workspace-relative path.
- Export the rendered diagram as SVG.
- Export an active Markdown file as a paginated PDF, including Mermaid fences and local images.
- Create a new Mermaid diagram from the command palette.
- Configure the scan limit, Markdown indexing, and preview theme.

Run **Mermaid Browser: Open Workspace Browser** from the command palette to
open the main workspace view. The editor title action previews the active
`.mmd` or `.mermaid` file directly in the browser.

For Markdown, run **Mermaid Browser: Export Markdown as PDF** from the command
palette or use the PDF action in the editor title. Choose an output path and
the extension renders the current editor contents, including unsaved changes.

## Development

```sh
pnpm install
pnpm run compile
pnpm run package
```

The extension bundles the public `mermaid` npm package at build time and does
not require a cloud account or private package registry.

## License

This project is distributed under the MIT License. The required notice for the
MIT-licensed source from which the repository began is retained in `LICENSE`.
