/**
 * This script is injected into the built-in Markdown Preview by VS Code.
 * It finds all mermaid code blocks and renders them as SVG diagrams
 * with zoom controls, inline editing, copy, and SVG export.
 */
import mermaid from "mermaid";

let renderCounter = 0;

function getPreferredTheme(): "default" | "dark" {
  const body = document.body;
  if (body.classList.contains("vscode-dark") || body.classList.contains("vscode-high-contrast")) {
    return "dark";
  }
  return "default";
}

function createToolbar(container: HTMLElement, source: string): void {
  let zoom = 1;
  const ZOOM_STEP = 0.15;
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 4;
  let isEditing = false;

  const svgWrapper = container.querySelector(".mermaid-svg-wrapper") as HTMLElement;
  if (!svgWrapper) return;

  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-zoom-toolbar";
  toolbar.innerHTML = `
    <button class="mermaid-zoom-btn" data-action="zoomOut" title="Zoom out">−</button>
    <span class="mermaid-zoom-label">100%</span>
    <button class="mermaid-zoom-btn" data-action="zoomIn" title="Zoom in">+</button>
    <button class="mermaid-zoom-btn" data-action="zoomReset" title="Reset zoom">Reset</button>
    <button class="mermaid-zoom-btn" data-action="zoomFit" title="Fit to width">Fit</button>
    <span class="mermaid-toolbar-separator"></span>
    <button class="mermaid-zoom-btn mermaid-action-btn" data-action="edit" title="Edit diagram inline">✏ Edit</button>
    <button class="mermaid-zoom-btn mermaid-action-btn" data-action="copy" title="Copy mermaid source">📋 Copy</button>
    <button class="mermaid-zoom-btn mermaid-action-btn" data-action="exportSvg" title="Download as SVG file">💾 Export SVG</button>
  `;

  const label = toolbar.querySelector(".mermaid-zoom-label") as HTMLElement;

  function updateZoom(): void {
    svgWrapper.style.transform = `scale(${zoom})`;
    label.textContent = `${Math.round(zoom * 100)}%`;
  }

  // Create inline editor (hidden by default)
  const editorPanel = document.createElement("div");
  editorPanel.className = "mermaid-inline-editor";
  editorPanel.style.display = "none";
  editorPanel.innerHTML = `
    <div class="mermaid-editor-header">
      <span class="mermaid-editor-title">Mermaid Source Editor</span>
      <span class="mermaid-editor-status" id="editorStatus">Ready</span>
    </div>
    <textarea class="mermaid-editor-textarea" spellcheck="false" autocomplete="off"></textarea>
    <div class="mermaid-editor-footer">
      <button class="mermaid-zoom-btn mermaid-action-btn" data-action="applyEdit">▶ Apply &amp; Re-render</button>
      <button class="mermaid-zoom-btn" data-action="closeEdit">✕ Close Editor</button>
    </div>
  `;
  const textarea = editorPanel.querySelector("textarea") as HTMLTextAreaElement;
  textarea.value = source;

  toolbar.addEventListener("click", async (e: Event) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!target) return;
    switch (target.dataset.action) {
      case "zoomIn":
        zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
        updateZoom();
        break;
      case "zoomOut":
        zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
        updateZoom();
        break;
      case "zoomReset":
        zoom = 1;
        updateZoom();
        break;
      case "zoomFit": {
        const svg = svgWrapper.querySelector("svg");
        if (svg) {
          const containerWidth = container.clientWidth - 32;
          const svgWidth = svg.getBoundingClientRect().width / zoom;
          if (svgWidth > 0) {
            zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, containerWidth / svgWidth));
            updateZoom();
          }
        }
        break;
      }
      case "edit":
        isEditing = !isEditing;
        editorPanel.style.display = isEditing ? "block" : "none";
        target.textContent = isEditing ? "✏ Editing..." : "✏ Edit";
        if (isEditing) {
          textarea.focus();
        }
        break;
      case "copy":
        try {
          await navigator.clipboard.writeText(textarea.value);
          target.textContent = "✓ Copied!";
          setTimeout(() => { target.textContent = "📋 Copy"; }, 1500);
        } catch {
          // Fallback: select all in a temporary element
          const temp = document.createElement("textarea");
          temp.value = textarea.value;
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          document.body.removeChild(temp);
          target.textContent = "✓ Copied!";
          setTimeout(() => { target.textContent = "📋 Copy"; }, 1500);
        }
        break;
      case "exportSvg": {
        const svgEl = svgWrapper.querySelector("svg");
        if (svgEl) {
          const svgData = svgEl.outerHTML;
          const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `mermaid-diagram-${Date.now()}.svg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          target.textContent = "✓ Exported!";
          setTimeout(() => { target.textContent = "💾 Export SVG"; }, 1500);
        }
        break;
      }
    }
  });

  // Editor panel buttons
  editorPanel.addEventListener("click", async (e: Event) => {
    const target = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!target) return;
    const statusEl = editorPanel.querySelector(".mermaid-editor-status") as HTMLElement;

    if (target.dataset.action === "applyEdit") {
      const newSource = textarea.value.trim();
      if (!newSource) {
        statusEl.textContent = "Empty source";
        return;
      }
      statusEl.textContent = "Rendering...";
      try {
        const newId = `mermaid-preview-${renderCounter++}`;
        const result = await mermaid.render(newId, newSource);
        svgWrapper.innerHTML = result.svg;
        // Re-apply size
        const newSvg = svgWrapper.querySelector("svg");
        if (newSvg) {
          const box = newSvg.viewBox?.baseVal;
          if (box && box.width) {
            const displayWidth = Math.max(800, Math.ceil(box.width));
            newSvg.style.width = displayWidth + "px";
            newSvg.style.height = "auto";
            newSvg.style.maxWidth = "none";
          }
        }
        zoom = 1;
        updateZoom();
        if (result.bindFunctions) {
          result.bindFunctions(svgWrapper);
        }
        statusEl.textContent = "Rendered ✓";
      } catch (err) {
        statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else if (target.dataset.action === "closeEdit") {
      isEditing = false;
      editorPanel.style.display = "none";
      const editBtn = toolbar.querySelector('[data-action="edit"]') as HTMLElement;
      if (editBtn) editBtn.textContent = "✏ Edit";
    }
  });

  // Ctrl+scroll zoom
  container.addEventListener("wheel", (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
      updateZoom();
    }
  }, { passive: false } as AddEventListenerOptions);

  container.insertBefore(toolbar, container.firstChild);
  // Insert editor panel after toolbar, before scroll area
  toolbar.after(editorPanel);
}

function injectStyles(): void {
  if (document.getElementById("mermaid-preview-styles")) return;
  const style = document.createElement("style");
  style.id = "mermaid-preview-styles";
  style.textContent = `
    .mermaid-preview-container {
      position: relative;
      margin: 16px 0;
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-editor-background, #1e1e1e);
    }
    .mermaid-scroll-area {
      overflow: auto;
      max-height: 80vh;
    }
    .mermaid-scroll-area::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .mermaid-scroll-area::-webkit-scrollbar-track {
      background: rgba(128,128,128,.15);
    }
    .mermaid-scroll-area::-webkit-scrollbar-thumb {
      background: rgba(128,128,128,.4);
      border-radius: 5px;
    }
    .mermaid-scroll-area::-webkit-scrollbar-thumb:hover {
      background: rgba(128,128,128,.6);
    }
    .mermaid-svg-wrapper {
      display: inline-block;
      padding: 16px;
      transform-origin: top left;
      min-width: max-content;
    }
    .mermaid-svg-wrapper svg {
      max-width: none !important;
      height: auto;
    }
    .mermaid-zoom-toolbar {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 6px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground, rgba(37,37,38,.9));
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      font-size: 12px;
      flex-wrap: wrap;
    }
    .mermaid-zoom-btn {
      padding: 2px 8px;
      min-height: 22px;
      font-size: 12px;
      cursor: pointer;
      color: var(--vscode-button-secondaryForeground, #ccc);
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      border-radius: 3px;
    }
    .mermaid-zoom-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #505050);
    }
    .mermaid-action-btn {
      color: var(--vscode-button-foreground, #fff);
      background: var(--vscode-button-background, #0e639c);
      border-color: transparent;
    }
    .mermaid-action-btn:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    .mermaid-toolbar-separator {
      width: 1px;
      height: 18px;
      background: var(--vscode-panel-border, rgba(128,128,128,.4));
      margin: 0 4px;
    }
    .mermaid-zoom-label {
      min-width: 40px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #999);
      font-size: 11px;
    }
    .mermaid-inline-editor {
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.3));
      background: var(--vscode-editor-background, #1e1e1e);
    }
    .mermaid-editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #999);
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
    }
    .mermaid-editor-title {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .mermaid-editor-status {
      font-size: 11px;
    }
    .mermaid-editor-textarea {
      display: block;
      width: 100%;
      min-height: 150px;
      max-height: 40vh;
      padding: 10px 14px;
      border: 0;
      outline: none;
      resize: vertical;
      color: var(--vscode-editor-foreground, #d4d4d4);
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      font-family: var(--vscode-editor-font-family, Consolas, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.6;
      tab-size: 4;
      box-sizing: border-box;
    }
    .mermaid-editor-footer {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,.2));
    }
    .mermaid-render-error {
      color: #e74c3c;
      font-size: 12px;
      padding: 8px 12px;
      border-left: 3px solid #e74c3c;
      margin: 8px 16px;
    }
  `;
  document.head.appendChild(style);
}

async function renderMermaidBlocks(): Promise<void> {
  const codeBlocks = document.querySelectorAll<HTMLElement>(
    'code.language-mermaid, pre > code[class*="language-mermaid"]'
  );

  if (codeBlocks.length === 0) {
    return;
  }

  injectStyles();

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: getPreferredTheme(),
    suppressErrorRendering: true,
  });

  for (const codeEl of Array.from(codeBlocks)) {
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE") {
      continue;
    }

    // Skip if already rendered
    if (pre.dataset.mermaidRendered === "true") {
      continue;
    }

    const source = codeEl.textContent?.trim();
    if (!source) {
      continue;
    }

    const id = `mermaid-preview-${renderCounter++}`;

    try {
      const { svg, bindFunctions } = await mermaid.render(id, source);

      // Create container with scroll area and zoom toolbar
      const container = document.createElement("div");
      container.className = "mermaid-preview-container";

      const scrollArea = document.createElement("div");
      scrollArea.className = "mermaid-scroll-area";

      const svgWrapper = document.createElement("div");
      svgWrapper.className = "mermaid-svg-wrapper";
      svgWrapper.innerHTML = svg;

      // Force SVG to render at a readable size
      const svgEl = svgWrapper.querySelector("svg");
      if (svgEl) {
        const box = svgEl.viewBox?.baseVal;
        if (box && box.width) {
          // Use the natural viewBox width, but ensure a minimum of 800px for readability
          const displayWidth = Math.max(800, Math.ceil(box.width));
          svgEl.style.width = displayWidth + "px";
          svgEl.style.height = "auto";
          svgEl.style.maxWidth = "none";
        } else {
          // No viewBox — force a minimum width
          svgEl.style.minWidth = "800px";
        }
      }

      scrollArea.appendChild(svgWrapper);
      container.appendChild(scrollArea);
      pre.replaceWith(container);

      if (bindFunctions) {
        bindFunctions(svgWrapper);
      }

      // Add toolbar with zoom, edit, copy, export
      createToolbar(container, source);
    } catch (error) {
      pre.dataset.mermaidRendered = "true";
      const errorDiv = document.createElement("div");
      errorDiv.className = "mermaid-render-error";
      errorDiv.textContent = `Mermaid render error: ${error instanceof Error ? error.message : String(error)}`;
      pre.after(errorDiv);
    }
  }
}

// Run on initial load
renderMermaidBlocks();

// Re-render when Markdown Preview content updates
const observer = new MutationObserver(() => {
  renderMermaidBlocks();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
