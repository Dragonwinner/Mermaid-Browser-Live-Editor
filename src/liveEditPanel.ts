import * as path from "path";
import * as vscode from "vscode";

interface LiveEditPayload {
  code: string;
  uri: string;
  line: number;
  theme: string;
}

interface LiveEditMessage {
  type?: "save" | "exportSvg";
  code?: string;
  svg?: string;
}

export interface InlineDiagramInfo {
  code: string;
  uri: string;
  line: number;
}

export class LiveEditPanel {
  private static current: LiveEditPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel,
    private info: InlineDiagramInfo
  ) {
    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    panel.webview.onDidReceiveMessage(
      (message: LiveEditMessage) => this.handleMessage(message),
      undefined,
      this.disposables
    );
  }

  public static async open(
    context: vscode.ExtensionContext,
    info: InlineDiagramInfo
  ): Promise<void> {
    if (LiveEditPanel.current) {
      LiveEditPanel.current.info = info;
      LiveEditPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      LiveEditPanel.current.updateContent();
      return;
    }

    const distRoot = vscode.Uri.joinPath(context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel(
      "mermaidBrowser.liveEdit",
      "Mermaid Live Edit",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distRoot],
      }
    );

    LiveEditPanel.current = new LiveEditPanel(context, panel, info);
    LiveEditPanel.current.updateContent();
  }

  private updateContent(): void {
    const config = vscode.workspace.getConfiguration("mermaidBrowser");
    const payload: LiveEditPayload = {
      code: this.info.code,
      uri: this.info.uri,
      line: this.info.line,
      theme: config.get<string>("previewTheme", "default"),
    };
    this.panel.webview.html = liveEditHtml(this.context, this.panel.webview, payload);
  }

  private async handleMessage(message: LiveEditMessage): Promise<void> {
    switch (message.type) {
      case "save":
        if (message.code !== undefined) {
          await this.saveToFile(message.code);
        }
        break;
      case "exportSvg":
        if (message.svg) {
          await this.exportSvg(message.svg);
        }
        break;
    }
  }

  private async saveToFile(newCode: string): Promise<void> {
    try {
      const uri = vscode.Uri.parse(this.info.uri);
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();

      // Find the mermaid fence at the specified line
      const lines = text.split(/\r?\n/);
      const fenceLine = this.info.line - 1; // 0-indexed

      if (fenceLine < 0 || fenceLine >= lines.length) {
        void vscode.window.showErrorMessage("Could not locate the mermaid block in the file.");
        return;
      }

      // Find opening fence
      const openFenceMatch = lines[fenceLine].match(/^(`{3,}|~{3,})\s*mermaid/i);
      if (!openFenceMatch) {
        void vscode.window.showErrorMessage("Could not find the mermaid fence at the expected line.");
        return;
      }

      const fence = openFenceMatch[1];
      // Find closing fence
      let closingLine = -1;
      for (let i = fenceLine + 1; i < lines.length; i++) {
        if (lines[i].trimEnd() === fence) {
          closingLine = i;
          break;
        }
      }

      if (closingLine === -1) {
        void vscode.window.showErrorMessage("Could not find the closing fence for this mermaid block.");
        return;
      }

      const edit = new vscode.WorkspaceEdit();
      const startPos = new vscode.Position(fenceLine + 1, 0);
      const endPos = new vscode.Position(closingLine, 0);
      edit.replace(uri, new vscode.Range(startPos, endPos), newCode + "\n");
      await vscode.workspace.applyEdit(edit);

      // Update stored code
      this.info.code = newCode;

      void vscode.window.showInformationMessage("Diagram saved to file.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Failed to save: ${detail}`);
    }
  }

  private async exportSvg(svg: string): Promise<void> {
    const suggestedName = `mermaid-diagram-line${this.info.line}.svg`;
    const defaultUri = vscode.workspace.workspaceFolders?.[0]
      ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, suggestedName)
      : undefined;
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { "SVG image": ["svg"] },
      saveLabel: "Export SVG",
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(svg));
    void vscode.window.showInformationMessage(
      `Exported ${vscode.workspace.asRelativePath(target, false)}.`
    );
  }

  private dispose(): void {
    LiveEditPanel.current = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

function liveEditHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  payload: LiveEditPayload
): string {
  const nonce = getNonce();
  const mermaidUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "dist", "mermaidRuntime.js")
  );
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${webview.cspSource}; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    :root{color-scheme:light dark;--border:var(--vscode-panel-border,rgba(128,128,128,.35));--muted:var(--vscode-descriptionForeground)}
    *{box-sizing:border-box;margin:0}
    body{height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr);color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}
    .toolbar{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--vscode-editorGroupHeader-tabsBackground);flex-wrap:wrap}
    button{min-height:28px;padding:4px 10px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid transparent;cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:4px}
    button:hover{background:var(--vscode-button-hoverBackground)}
    button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}
    .status{margin-left:auto;color:var(--muted);font-size:12px}
    .zoom-controls{display:flex;gap:4px;align-items:center;border-left:1px solid var(--border);padding-left:8px;margin-left:4px}
    .zoom-label{font-size:11px;color:var(--muted);min-width:40px;text-align:center}
    .split{display:grid;grid-template-columns:1fr 1fr;min-height:0}
    .editor-pane{display:flex;flex-direction:column;border-right:1px solid var(--border);min-height:0}
    .editor-pane textarea{flex:1;resize:none;padding:14px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);border:0;outline:none;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);line-height:1.6;tab-size:4}
    .preview-pane{min-height:0;overflow:auto;scrollbar-gutter:stable both-edges}
    .preview-pane::-webkit-scrollbar{width:12px;height:12px}
    .preview-pane::-webkit-scrollbar-track{background:var(--vscode-scrollbarSlider-background)}
    .preview-pane::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-hoverBackground);border:3px solid transparent;background-clip:padding-box}
    .preview-container{display:flex;align-items:flex-start;justify-content:flex-start;width:max-content;min-width:100%;min-height:100%;padding:20px;transform-origin:top left}
    .preview-container svg{max-width:none!important;height:auto}
    .error{padding:20px;color:#e74c3c}
    .pane-label{padding:6px 14px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);border-bottom:1px solid var(--border);background:var(--vscode-editorGroupHeader-tabsBackground)}
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="save" title="Save changes back to the source file">$(save) Save to File</button>
    <button id="exportSvg" class="secondary" title="Export rendered diagram as SVG">$(export) Export SVG</button>
    <div class="zoom-controls">
      <button id="zoomOut" class="secondary" title="Zoom out">−</button>
      <span class="zoom-label" id="zoomLabel">100%</span>
      <button id="zoomIn" class="secondary" title="Zoom in">+</button>
      <button id="zoomReset" class="secondary" title="Reset zoom">Reset</button>
      <button id="zoomFit" class="secondary" title="Fit to view">Fit</button>
    </div>
    <span class="status" id="status">Ready</span>
  </div>
  <div class="split">
    <div class="editor-pane">
      <div class="pane-label">Mermaid Source</div>
      <textarea id="code" spellcheck="false" autocomplete="off"></textarea>
    </div>
    <div class="preview-pane" id="previewPane">
      <div class="pane-label">Live Preview</div>
      <div class="preview-container" id="preview"></div>
    </div>
  </div>

  <script type="module" nonce="${nonce}">
    import mermaid from "${mermaidUri}";
    const vscode = acquireVsCodeApi();
    const payload = ${data};
    const codeEl = document.getElementById('code');
    const preview = document.getElementById('preview');
    const previewPane = document.getElementById('previewPane');
    const statusEl = document.getElementById('status');
    let renderVersion = 0;
    let zoom = 1;
    const ZOOM_STEP = 0.15;
    const ZOOM_MIN = 0.2;
    const ZOOM_MAX = 4;

    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:payload.theme,suppressErrorRendering:true});
    codeEl.value = payload.code;

    // Debounced render
    let debounceTimer = null;
    codeEl.addEventListener('input', () => {
      statusEl.textContent = 'Typing...';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => renderDiagram(), 300);
    });

    // Tab key support in textarea
    codeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = codeEl.selectionStart;
        const end = codeEl.selectionEnd;
        codeEl.value = codeEl.value.substring(0, start) + '    ' + codeEl.value.substring(end);
        codeEl.selectionStart = codeEl.selectionEnd = start + 4;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => renderDiagram(), 300);
      }
    });

    // Zoom controls
    function updateZoom() {
      preview.style.transform = 'scale(' + zoom + ')';
      document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    }
    document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP); updateZoom(); });
    document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP); updateZoom(); });
    document.getElementById('zoomReset').addEventListener('click', () => { zoom = 1; updateZoom(); });
    document.getElementById('zoomFit').addEventListener('click', () => {
      const svg = preview.querySelector('svg');
      if (svg) {
        const paneWidth = previewPane.clientWidth - 40;
        const svgWidth = svg.getBoundingClientRect().width / zoom;
        if (svgWidth > 0) { zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, paneWidth / svgWidth)); updateZoom(); }
      }
    });

    // Ctrl+scroll zoom
    previewPane.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
        updateZoom();
      }
    }, { passive: false });

    // Save
    document.getElementById('save').addEventListener('click', () => {
      vscode.postMessage({ type: 'save', code: codeEl.value.trim() });
    });

    // Export SVG
    document.getElementById('exportSvg').addEventListener('click', () => {
      const svg = preview.querySelector('svg')?.outerHTML;
      if (svg) { vscode.postMessage({ type: 'exportSvg', svg }); }
      else { statusEl.textContent = 'No diagram to export'; }
    });

    async function renderDiagram() {
      const version = ++renderVersion;
      const source = codeEl.value.trim();
      if (!source) {
        preview.innerHTML = '<div class="error">Enter mermaid code on the left</div>';
        statusEl.textContent = 'Empty';
        return;
      }
      try {
        const result = await mermaid.render('live-edit-' + version, source);
        if (version !== renderVersion) return;
        preview.innerHTML = result.svg;
        const svg = preview.querySelector('svg');
        const box = svg?.viewBox?.baseVal;
        if (svg && box?.width) { svg.style.width = Math.max(400, Math.ceil(box.width)) + 'px'; }
        result.bindFunctions?.(preview);
        statusEl.textContent = 'Rendered ✓';
      } catch (error) {
        if (version !== renderVersion) return;
        preview.innerHTML = '<div class="error"><strong>Render error</strong><p>' + escapeHtml(error?.message || String(error)) + '</p></div>';
        statusEl.textContent = 'Error';
      }
    }

    function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

    renderDiagram();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}
