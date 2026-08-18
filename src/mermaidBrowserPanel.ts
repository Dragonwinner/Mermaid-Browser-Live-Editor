import * as path from "path";
import * as vscode from "vscode";

type DiagramSource = "file" | "markdown";

interface DiagramEntry {
  id: string;
  uri: string;
  relativePath: string;
  source: DiagramSource;
  diagramType: string;
  title: string;
  line: number;
  code: string;
  charCount: number;
}

interface BrowserPayload {
  diagrams: DiagramEntry[];
  workspaceName: string;
  indexedAt: string;
  limitReached: boolean;
  theme: string;
  preferredId?: string;
}

interface DiagramIndex {
  diagrams: DiagramEntry[];
  limitReached: boolean;
}

interface BrowserMessage {
  type?: "refresh" | "open" | "copySource" | "copyPath" | "copySvg" | "exportSvg" | "exportPng";
  id?: string;
  svg?: string;
  png?: string;
}

export class MermaidBrowserPanel {
  private static current: MermaidBrowserPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private diagrams: DiagramEntry[] = [];
  private preferredUri: vscode.Uri | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: vscode.WebviewPanel
  ) {
    panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    panel.webview.onDidReceiveMessage(
      (message: BrowserMessage) => this.handleMessage(message),
      undefined,
      this.disposables
    );
  }

  public static async open(context: vscode.ExtensionContext, preferredUri?: vscode.Uri): Promise<void> {
    if (MermaidBrowserPanel.current) {
      MermaidBrowserPanel.current.preferredUri = preferredUri;
      MermaidBrowserPanel.current.panel.reveal(vscode.ViewColumn.One);
      await MermaidBrowserPanel.current.refresh();
      return;
    }

    const mermaidRoot = vscode.Uri.joinPath(context.extensionUri, "dist");
    const panel = vscode.window.createWebviewPanel(
      "mermaidBrowser.workspace",
      "Mermaid Browser",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mermaidRoot],
      }
    );

    MermaidBrowserPanel.current = new MermaidBrowserPanel(context, panel);
    MermaidBrowserPanel.current.preferredUri = preferredUri;
    await MermaidBrowserPanel.current.refresh();
  }

  public static async refreshCurrent(): Promise<void> {
    if (!MermaidBrowserPanel.current) {
      await vscode.commands.executeCommand("mermaidBrowser.open");
      return;
    }
    await MermaidBrowserPanel.current.refresh();
  }

  private async refresh(): Promise<void> {
    this.panel.webview.html = loadingHtml();
    const config = vscode.workspace.getConfiguration("mermaidBrowser");
    const fileLimit = config.get<number>("fileLimit", 2500);
    const includeMarkdown = config.get<boolean>("includeMarkdown", true);
    const index = await collectDiagrams(fileLimit, includeMarkdown);
    this.diagrams = index.diagrams;

    const preferredId = this.preferredUri
      ? this.diagrams.find((entry) => entry.uri === this.preferredUri?.toString())?.id
      : undefined;
    const payload: BrowserPayload = {
      diagrams: this.diagrams,
      workspaceName: getWorkspaceName(),
      indexedAt: new Date().toLocaleString(),
      limitReached: index.limitReached,
      theme: config.get<string>("previewTheme", "default"),
      preferredId,
    };
    this.panel.webview.html = browserHtml(this.context, this.panel.webview, payload);
  }

  private async handleMessage(message: BrowserMessage): Promise<void> {
    if (message.type === "refresh") {
      await this.refresh();
      return;
    }

    const entry = this.diagrams.find((item) => item.id === message.id);
    if (!entry) {
      void vscode.window.showWarningMessage("The selected diagram is no longer in the workspace index.");
      return;
    }

    switch (message.type) {
      case "open":
        await openEntry(entry);
        break;
      case "copySource":
        await vscode.env.clipboard.writeText(entry.code);
        void vscode.window.showInformationMessage("Diagram source copied.");
        break;
      case "copyPath":
        await vscode.env.clipboard.writeText(entry.relativePath);
        void vscode.window.showInformationMessage("Diagram path copied.");
        break;
      case "copySvg":
        if (message.svg) {
          await vscode.env.clipboard.writeText(message.svg);
          void vscode.window.showInformationMessage("Rendered SVG copied.");
        }
        break;
      case "exportSvg":
        if (message.svg) {
          await exportSvg(entry, message.svg);
        }
        break;
      case "exportPng":
        if (message.png) {
          await exportPng(entry, message.png);
        }
        break;
    }
  }

  private dispose(): void {
    MermaidBrowserPanel.current = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }
}

export async function createDiagram(): Promise<void> {
  const content = `flowchart LR
    idea[New idea] --> build[Build diagram]
    build --> share[Share result]
`;
  const document = await vscode.workspace.openTextDocument({ language: "mermaid", content });
  await vscode.window.showTextDocument(document);
}

async function collectDiagrams(fileLimit: number, includeMarkdown: boolean): Promise<DiagramIndex> {
  const extensions = includeMarkdown ? "{mmd,mermaid,md,markdown}" : "{mmd,mermaid}";
  const pattern = `**/*.${extensions}`;
  const exclude = "{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/coverage/**}";
  const uris = await vscode.workspace.findFiles(pattern, exclude, fileLimit);
  const decoder = new TextDecoder("utf-8");
  const entries: DiagramEntry[] = [];

  await Promise.all(
    uris.map(async (uri) => {
      try {
        const text = decoder.decode(await vscode.workspace.fs.readFile(uri));
        const extension = path.extname(uri.fsPath).toLowerCase();
        if (extension === ".mmd" || extension === ".mermaid") {
          if (text.trim()) {
            entries.push(createEntry(uri, text.trim(), 1, "file", 0));
          }
          return;
        }
        entries.push(...extractMarkdownEntries(uri, text));
      } catch (error) {
        console.warn("Mermaid Browser could not index", uri.toString(), error);
      }
    })
  );

  return {
    diagrams: entries.sort(
      (left, right) => left.relativePath.localeCompare(right.relativePath) || left.line - right.line
    ),
    limitReached: uris.length >= fileLimit,
  };
}

function extractMarkdownEntries(uri: vscode.Uri, text: string): DiagramEntry[] {
  const entries: DiagramEntry[] = [];
  const pattern = /^(`{3,}|~{3,})\s*mermaid[^\r\n]*\r?\n([\s\S]*?)^\1\s*$/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const code = match[2].trim();
    if (!code) {
      continue;
    }
    const line = lineCount(text.slice(0, match.index)) + 2;
    entries.push(createEntry(uri, code, line, "markdown", entries.length));
  }
  return entries;
}

function createEntry(
  uri: vscode.Uri,
  code: string,
  line: number,
  source: DiagramSource,
  index: number
): DiagramEntry {
  const relativePath = vscode.workspace.asRelativePath(uri, false);
  const diagramType = detectDiagramType(code);
  return {
    id: `${uri.toString()}#${line}-${index}`,
    uri: uri.toString(),
    relativePath,
    source,
    diagramType,
    title: detectTitle(code) ?? `${formatType(diagramType)} - ${path.basename(uri.fsPath)}`,
    line,
    code,
    charCount: code.length,
  };
}

function detectTitle(code: string): string | undefined {
  const frontmatter = code.match(/^---[\s\S]*?^title:\s*["']?(.+?)["']?\s*$[\s\S]*?^---/im)?.[1];
  const directive = code.match(/^\s*title\s+(.+)$/im)?.[1];
  const title = (frontmatter ?? directive)?.trim().replace(/^["']|["']$/g, "");
  return title ? title.slice(0, 100) : undefined;
}

function detectDiagramType(code: string): string {
  const withoutFrontmatter = code.replace(/^---[\s\S]*?^---\s*/m, "");
  const firstLine = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%"));
  if (!firstLine) {
    return "unknown";
  }
  const token = firstLine.split(/\s+/)[0].replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (token === "graph") {
    return "flowchart";
  }
  return token || "unknown";
}

function formatType(value: string): string {
  return value.replace(/diagram$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function lineCount(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}

function getWorkspaceName(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return "No workspace folder";
  }
  return folders.length === 1 ? folders[0].name : `${folders.length} workspace folders`;
}

async function openEntry(entry: DiagramEntry): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(entry.uri));
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
  const position = new vscode.Position(Math.max(0, entry.line - 1), 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function exportSvg(entry: DiagramEntry, svg: string): Promise<void> {
  const suggestedName = `${path.parse(entry.relativePath).name}-${entry.line}.svg`;
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
  void vscode.window.showInformationMessage(`Exported ${vscode.workspace.asRelativePath(target, false)}.`);
}

async function exportPng(entry: DiagramEntry, base64: string): Promise<void> {
  const suggestedName = `${path.parse(entry.relativePath).name}-${entry.line}.png`;
  const defaultUri = vscode.workspace.workspaceFolders?.[0]
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, suggestedName)
    : undefined;
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { "PNG image": ["png"] },
    saveLabel: "Export PNG",
  });
  if (!target) {
    return;
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(base64, "base64"));
  void vscode.window.showInformationMessage(`Exported ${vscode.workspace.asRelativePath(target, false)}.`);
}

function loadingHtml(): string {
  const nonce = getNonce();
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'"><style nonce="${nonce}">body{padding:24px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}h1{font-size:20px;letter-spacing:0}</style></head><body><h1>Mermaid Browser</h1><p>Indexing workspace diagrams...</p></body></html>`;
}

function browserHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  payload: BrowserPayload
): string {
  const nonce = getNonce();
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  const mermaidUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "dist", "mermaidRuntime.js")
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${webview.cspSource}; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    :root{color-scheme:light dark;--border:var(--vscode-panel-border,rgba(128,128,128,.35));--muted:var(--vscode-descriptionForeground);--sidebar-width:320px;--toolbar-bg:var(--vscode-editorGroupHeader-tabsBackground);--side-bg:var(--vscode-sideBar-background);--focus:var(--vscode-focusBorder)}
    *{box-sizing:border-box}body{margin:0;overflow:hidden;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}button,input,select{font:inherit}button{min-height:30px;padding:5px 10px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid transparent;border-radius:2px;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:1px solid var(--focus);outline-offset:1px}button:disabled{cursor:default;opacity:.55}
    .shell{display:grid;grid-template-rows:auto auto minmax(0,1fr);height:100vh}.app-header{display:flex;justify-content:space-between;gap:16px;min-height:66px;padding:12px 18px;border-bottom:1px solid var(--border);background:var(--side-bg)}h1{margin:0 0 3px;font-size:20px;letter-spacing:0}.sub,.meta,.empty,.error,.dimension{color:var(--muted)}.stats{display:flex;gap:18px;align-items:center}.stat{min-width:44px}.stat strong,.stat span{display:block}.stat strong{font-size:17px}.stat span{font-size:11px}
    .toolbar-band{border-bottom:1px solid var(--border);background:var(--toolbar-bg)}.toolbar{display:grid;grid-template-columns:32px minmax(180px,1fr) minmax(150px,210px) auto;gap:8px;padding:9px 12px}input,select{width:100%;min-height:32px;padding:5px 8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--border));border-radius:2px}.icon-button{display:inline-grid;place-items:center;width:32px;min-width:32px;height:30px;padding:0;font-size:17px}.limit{padding:6px 12px;color:var(--vscode-inputValidation-warningForeground);background:var(--vscode-inputValidation-warningBackground);border-top:1px solid var(--vscode-inputValidation-warningBorder)}
    .workspace{display:grid;grid-template-columns:minmax(220px,var(--sidebar-width)) 4px minmax(0,1fr);min-height:0}.workspace.list-collapsed{grid-template-columns:minmax(0,1fr)}.workspace.list-collapsed .list-pane,.workspace.list-collapsed .splitter{display:none}.workspace.list-collapsed .detail{grid-column:1}.list-pane{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0;background:var(--side-bg)}.list-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:36px;padding:5px 8px 5px 12px;border-bottom:1px solid var(--border);font-size:12px}.list{min-height:0;overflow:auto}.item{display:block;width:100%;padding:10px 12px;text-align:left;color:inherit;background:transparent;border:0;border-bottom:1px solid var(--border);border-radius:0}.item:hover,.item.active{background:var(--vscode-list-hoverBackground)}.item.active{box-shadow:inset 3px 0 var(--focus)}.item-title{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;font-weight:600}.item-title>span:first-child{min-width:0;overflow-wrap:anywhere}.badge{flex:none;padding:1px 5px;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background);border-radius:3px;font-size:11px;font-weight:400}.meta{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.splitter{position:relative;background:var(--border);cursor:col-resize}.splitter:hover,.splitter.dragging{background:var(--focus)}
    .detail{display:grid;grid-column:3;grid-template-rows:auto auto minmax(0,1fr);min-width:0;min-height:0}.detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px 14px;border-bottom:1px solid var(--border)}.detail-copy{min-width:0}.detail-copy .meta{max-width:min(70vw,900px)}h2{margin:0 0 4px;overflow-wrap:anywhere;font-size:17px;letter-spacing:0}.head-actions,.view-actions,.tabs,.zoom-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.head-actions{justify-content:flex-end}.view-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:6px 12px;border-bottom:1px solid var(--border);background:var(--toolbar-bg)}.tabs{flex:none;padding-right:7px;border-right:1px solid var(--border)}.tabs button{min-height:28px}.tabs button[aria-selected=true]{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.zoom-controls button{min-height:28px;padding:3px 8px}.zoom-label{min-width:48px;text-align:center;font-variant-numeric:tabular-nums}.theme-select{width:auto;min-width:98px;min-height:28px}.dimension{margin-left:4px;font-size:11px;white-space:nowrap}
    .viewer{position:relative;min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;background:var(--diagram-surface,var(--vscode-editor-background));overscroll-behavior:contain}.viewer.can-pan{cursor:grab}.viewer.panning{cursor:grabbing;user-select:none}.viewer::-webkit-scrollbar,.list::-webkit-scrollbar{width:12px;height:12px}.viewer::-webkit-scrollbar-track,.list::-webkit-scrollbar-track{background:var(--vscode-scrollbarSlider-background)}.viewer::-webkit-scrollbar-thumb,.list::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-hoverBackground);border:3px solid transparent;background-clip:padding-box}.stage{display:grid;place-items:center;width:max-content;height:max-content;min-width:100%;min-height:100%;padding:28px}.preview-host{line-height:0}.preview-host svg{display:block;max-width:none!important;max-height:none!important;overflow:visible}.rendering{padding:22px;color:var(--muted)}.source{margin:0;padding:18px;min-width:max-content;min-height:100%;overflow:visible;color:var(--vscode-editor-foreground);background:var(--vscode-textCodeBlock-background,var(--vscode-editor-background));font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);line-height:1.5;white-space:pre}.empty,.error{padding:22px}.error strong{color:var(--vscode-errorForeground)}
    @media(max-width:980px){:root{--sidebar-width:270px}.detail-head{display:block}.head-actions{justify-content:flex-start;margin-top:9px}.view-toolbar{align-items:flex-start}.view-actions{justify-content:flex-end}}
    @media(max-width:720px){body{overflow:auto}.shell{height:100dvh}.app-header{align-items:center}.sub{max-width:52vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.stats{gap:10px}.stat{min-width:34px}.toolbar{grid-template-columns:32px minmax(0,1fr) auto}.toolbar select{grid-column:2/4}.workspace,.workspace.list-collapsed{grid-template-columns:1fr;grid-template-rows:minmax(130px,30vh) minmax(0,1fr)}.workspace.list-collapsed{grid-template-rows:minmax(0,1fr)}.workspace.list-collapsed .list-pane{display:none}.list-pane{border-bottom:1px solid var(--border)}.splitter{display:none}.detail{grid-column:1}.view-toolbar{display:block}.view-actions{margin-top:6px;justify-content:flex-start}.stage{padding:20px}.dimension{display:none}}
    @media(max-width:480px){.app-header{min-height:58px;padding:9px 12px}.stats .stat:nth-child(2),.stats .stat:nth-child(3){display:none}.toolbar{padding:7px}.detail-head{padding:10px}.head-actions button[data-action=copyPath]{display:none}.view-toolbar{padding:6px 8px}.zoom-controls{gap:3px}.zoom-controls button{padding:3px 6px}}
  </style>
</head>
<body>
  <div class="shell">
    <header class="app-header"><div><h1>Mermaid Browser</h1><div class="sub" id="workspace"></div></div><div class="stats"><div class="stat"><strong id="count">0</strong><span>diagrams</span></div><div class="stat"><strong id="files">0</strong><span>files</span></div><div class="stat"><strong id="types">0</strong><span>types</span></div></div></header>
    <section class="toolbar-band"><div class="toolbar"><button id="toggleList" class="icon-button secondary" type="button" title="Toggle diagram list" aria-label="Toggle diagram list">☰</button><input id="search" type="search" placeholder="Search diagrams, files, or types" aria-label="Search diagrams"><select id="filter" aria-label="Filter by type"></select><button id="refresh" type="button" title="Refresh workspace index">Refresh</button></div><div id="limit"></div></section>
    <main class="workspace" id="workspaceView"><aside class="list-pane" id="listPane"><div class="list-head"><strong id="resultCount">0 diagrams</strong><button id="collapseList" class="icon-button secondary" type="button" title="Hide diagram list" aria-label="Hide diagram list">‹</button></div><section class="list" id="list" aria-label="Workspace diagrams"></section></aside><div class="splitter" id="splitter" role="separator" aria-label="Resize diagram list" aria-orientation="vertical" tabindex="0"></div><section class="detail" id="detail"></section></main>
  </div>
  <script type="module" nonce="${nonce}">
    import mermaid from "${mermaidUri}";
    const vscode = acquireVsCodeApi();
    const payload = ${data};
    const cspNonce = "${nonce}";
    const saved = vscode.getState() || {};
    const byId = new Map(payload.diagrams.map(item => [item.id,item]));
    const validThemes = ['default','neutral','dark','forest','base'];
    const search = document.getElementById('search');
    const filter = document.getElementById('filter');
    const list = document.getElementById('list');
    const detail = document.getElementById('detail');
    const workspaceView = document.getElementById('workspaceView');
    const splitter = document.getElementById('splitter');
    let selectedId = payload.preferredId || (byId.has(saved.selectedId) ? saved.selectedId : payload.diagrams[0]?.id) || null;
    let mode = saved.mode === 'source' ? 'source' : 'preview';
    let previewTheme = validThemes.includes(saved.previewTheme) ? saved.previewTheme : (validThemes.includes(payload.theme) ? payload.theme : 'default');
    let listCollapsed = saved.listCollapsed === true;
    let sidebarWidth = clamp(Number(saved.sidebarWidth) || 320,220,520);
    let renderVersion = 0;
    let resizeObserver;
    let resizeFrame = 0;
    let zoom = 1;
    let intrinsicWidth = 0;
    let intrinsicHeight = 0;
    let viewMode = 'smart';

    document.documentElement.style.setProperty('--sidebar-width',sidebarWidth+'px');
    document.getElementById('workspace').textContent = payload.workspaceName + ' | indexed ' + payload.indexedAt;
    document.getElementById('count').textContent = String(payload.diagrams.length);
    document.getElementById('files').textContent = String(new Set(payload.diagrams.map(item => item.uri)).size);
    document.getElementById('types').textContent = String(new Set(payload.diagrams.map(item => item.diagramType)).size);
    document.getElementById('limit').innerHTML = payload.limitReached ? '<div class="limit">The configured index limit was reached. Increase Mermaid Browser: File Limit to scan more files.</div>' : '';
    document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({type:'refresh'}));

    const types = [...new Set(payload.diagrams.map(item=>item.diagramType))].sort();
    filter.innerHTML = '<option value="">All diagram types</option>' + types.map(type=>'<option value="'+attr(type)+'">'+html(formatType(type))+'</option>').join('');
    search.value = typeof saved.search === 'string' ? saved.search : '';
    filter.value = types.includes(saved.filter) ? saved.filter : '';
    applyListState();

    search.addEventListener('input',renderBrowser);
    filter.addEventListener('change',renderBrowser);
    document.getElementById('toggleList').addEventListener('click',toggleList);
    document.getElementById('collapseList').addEventListener('click',toggleList);
    list.addEventListener('keydown',event=>{
      if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
      const items=[...list.querySelectorAll('.item')];
      const current=Math.max(0,items.indexOf(document.activeElement));
      const next=event.key==='ArrowDown'?Math.min(items.length-1,current+1):Math.max(0,current-1);
      items[next]?.focus();event.preventDefault();
    });

    let dragStartX = 0;
    let dragStartWidth = 0;
    splitter.addEventListener('pointerdown',event=>{
      if(window.innerWidth<=720)return;
      dragStartX=event.clientX;dragStartWidth=sidebarWidth;splitter.classList.add('dragging');splitter.setPointerCapture(event.pointerId);event.preventDefault();
    });
    splitter.addEventListener('pointermove',event=>{
      if(!splitter.hasPointerCapture(event.pointerId))return;
      sidebarWidth=clamp(dragStartWidth+event.clientX-dragStartX,220,Math.min(520,window.innerWidth*.55));
      document.documentElement.style.setProperty('--sidebar-width',sidebarWidth+'px');
    });
    splitter.addEventListener('pointerup',event=>{if(splitter.hasPointerCapture(event.pointerId))splitter.releasePointerCapture(event.pointerId);splitter.classList.remove('dragging');persist()});
    splitter.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      sidebarWidth=clamp(sidebarWidth+(event.key==='ArrowRight'?20:-20),220,Math.min(520,window.innerWidth*.55));
      document.documentElement.style.setProperty('--sidebar-width',sidebarWidth+'px');persist();event.preventDefault();
    });

    function toggleList(){listCollapsed=!listCollapsed;applyListState();persist();requestAnimationFrame(()=>refitCurrent())}
    function applyListState(){workspaceView.classList.toggle('list-collapsed',listCollapsed);document.getElementById('toggleList').setAttribute('aria-pressed',String(!listCollapsed))}
    function persist(){vscode.setState({selectedId,mode,previewTheme,listCollapsed,sidebarWidth,search:search.value,filter:filter.value})}
    function filtered(){const query=search.value.trim().toLowerCase();return payload.diagrams.filter(item=>(!filter.value||item.diagramType===filter.value)&&(!query||[item.title,item.relativePath,item.diagramType].join(' ').toLowerCase().includes(query)))}
    function renderBrowser(){
      const items=filtered();
      const selectionChanged=!items.some(item=>item.id===selectedId);
      if(selectionChanged)selectedId=items[0]?.id||null;
      document.getElementById('resultCount').textContent=items.length+(items.length===1?' diagram':' diagrams');
      list.innerHTML=items.length?items.map(item=>'<button class="item'+(item.id===selectedId?' active':'')+'" data-id="'+attr(item.id)+'" aria-current="'+(item.id===selectedId?'true':'false')+'"><span class="item-title"><span>'+html(item.title)+'</span><span class="badge">'+html(formatType(item.diagramType))+'</span></span><span class="meta">'+html(item.relativePath)+':'+item.line+' | '+item.charCount+' chars</span></button>').join(''):'<div class="empty">No diagrams match this view.</div>';
      list.querySelectorAll('[data-id]').forEach(node=>node.addEventListener('click',()=>selectDiagram(node.dataset.id)));
      if(selectionChanged||detail.dataset.id!==String(selectedId))void renderDetail();
      persist();
    }
    function selectDiagram(id){if(id===selectedId)return;selectedId=id;viewMode='smart';renderBrowser()}

    async function renderDetail(){
      const version=++renderVersion;
      resizeObserver?.disconnect();
      const item=byId.get(selectedId);
      detail.dataset.id=String(selectedId);
      if(!item){detail.innerHTML='<div class="empty">Create a .mmd file or add a Mermaid fence to Markdown, then refresh.</div>';return}
      const tabs='<div class="tabs" role="tablist" aria-label="Diagram view"><button type="button" data-mode="preview" class="'+(mode==='preview'?'':'secondary')+'" role="tab" aria-selected="'+(mode==='preview')+'">Preview</button><button type="button" data-mode="source" class="'+(mode==='source'?'':'secondary')+'" role="tab" aria-selected="'+(mode==='source')+'">Source</button></div>';
      const head='<div class="detail-head"><div class="detail-copy"><h2>'+html(item.title)+'</h2><div class="meta" title="'+attr(item.relativePath)+'">'+html(item.relativePath)+':'+item.line+' | '+html(item.source)+' | '+html(formatType(item.diagramType))+'</div></div><div class="head-actions"><button type="button" data-action="open">Open</button><button type="button" data-action="copySource" class="secondary">Copy source</button><button type="button" data-action="copyPath" class="secondary">Copy path</button></div></div>';
      if(mode==='source'){
        detail.innerHTML=head+'<div class="view-toolbar">'+tabs+'<div class="view-actions"><span class="dimension">'+item.charCount+' characters</span></div></div><div class="viewer" id="viewer" tabindex="0"><pre class="source"><code>'+html(item.code)+'</code></pre></div>';
        wireDetailControls(item);return;
      }
      const themeOptions=validThemes.map(value=>'<option value="'+value+'" '+(value===previewTheme?'selected':'')+'>'+formatType(value)+'</option>').join('');
      const tools='<div class="view-toolbar">'+tabs+'<div class="view-actions"><div class="zoom-controls"><button type="button" id="zoomOut" class="icon-button secondary" title="Zoom out" aria-label="Zoom out">−</button><span class="zoom-label" id="zoomLabel">100%</span><button type="button" id="zoomIn" class="icon-button secondary" title="Zoom in" aria-label="Zoom in">+</button><button type="button" id="actualSize" class="secondary" title="Show at actual SVG size">1:1</button><button type="button" id="fitWidth" class="secondary">Fit width</button><button type="button" id="fitPage" class="secondary">Fit page</button></div><select id="previewTheme" class="theme-select" aria-label="Diagram theme" title="Diagram theme">'+themeOptions+'</select><button type="button" data-action="copySvg" class="secondary">Copy SVG</button><button type="button" data-action="exportSvg" class="secondary">Export SVG</button><button type="button" data-action="exportPng" class="secondary">Export PNG</button><span class="dimension" id="diagramSize"></span></div></div>';
      detail.innerHTML=head+tools+'<div class="viewer" id="viewer" tabindex="0"><div class="stage" id="stage"><div class="preview-host" id="preview"><div class="rendering">Rendering diagram...</div></div></div></div>';
      document.getElementById('viewer').style.setProperty('--diagram-surface',previewTheme==='dark'?'#1f2020':'#ffffff');
      wireDetailControls(item);
      wirePreviewControls(item);
      try{
        initializeMermaid();
        const result=await mermaid.render('mermaid-browser-'+version,item.code);
        if(version!==renderVersion)return;
        const preview=document.getElementById('preview');
        installRenderedSvg(preview,result.svg);
        result.bindFunctions?.(preview);
        await document.fonts?.ready;
        await nextFrame();
        if(version!==renderVersion)return;
        const svg=preview.querySelector('svg');
        if(!svg)throw new Error('Mermaid did not return an SVG diagram.');
        normalizeSvgBounds(svg);
        fitDiagram('smart');
        resizeObserver=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>refitCurrent())});
        resizeObserver.observe(document.getElementById('viewer'));
      }catch(error){if(version!==renderVersion)return;document.getElementById('viewer').innerHTML='<div class="error"><strong>Preview failed</strong><p>'+html(error?.message||String(error))+'</p></div>'}
    }

    function wireDetailControls(item){
      detail.querySelectorAll('[data-mode]').forEach(node=>node.addEventListener('click',()=>{const next=node.dataset.mode;if(next===mode)return;mode=next;persist();void renderDetail()}));
      detail.querySelectorAll('[data-action]').forEach(node=>node.addEventListener('click',()=>void runAction(node.dataset.action,item,node)));
    }
    function wirePreviewControls(){
      document.getElementById('zoomIn').addEventListener('click',()=>setZoom(zoom*1.15,true,'custom'));
      document.getElementById('zoomOut').addEventListener('click',()=>setZoom(zoom/1.15,true,'custom'));
      document.getElementById('actualSize').addEventListener('click',()=>setZoom(1,false,'actual'));
      document.getElementById('fitWidth').addEventListener('click',()=>fitDiagram('width'));
      document.getElementById('fitPage').addEventListener('click',()=>fitDiagram('page'));
      document.getElementById('previewTheme').addEventListener('change',event=>{previewTheme=event.target.value;viewMode='smart';persist();void renderDetail()});
      const viewer=document.getElementById('viewer');
      viewer.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();setZoom(zoom*(event.deltaY<0?1.12:1/1.12),true,'custom')},{passive:false});
      viewer.addEventListener('keydown',event=>{if(event.key==='+'||event.key==='='){setZoom(zoom*1.15,true,'custom');event.preventDefault()}else if(event.key==='-'){setZoom(zoom/1.15,true,'custom');event.preventDefault()}else if(event.key==='0'){setZoom(1,false,'actual');event.preventDefault()}else if(event.key.toLowerCase()==='f'){fitDiagram('page');event.preventDefault()}});
      let pan;
      viewer.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('a,button')||!viewer.classList.contains('can-pan'))return;pan={x:event.clientX,y:event.clientY,left:viewer.scrollLeft,top:viewer.scrollTop};viewer.classList.add('panning');viewer.setPointerCapture(event.pointerId)});
      viewer.addEventListener('pointermove',event=>{if(!pan||!viewer.hasPointerCapture(event.pointerId))return;viewer.scrollLeft=pan.left-(event.clientX-pan.x);viewer.scrollTop=pan.top-(event.clientY-pan.y)});
      const stopPan=event=>{pan=undefined;viewer.classList.remove('panning');if(viewer.hasPointerCapture(event.pointerId))viewer.releasePointerCapture(event.pointerId)};
      viewer.addEventListener('pointerup',stopPan);viewer.addEventListener('pointercancel',stopPan);
    }

    function initializeMermaid(){mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:previewTheme,htmlLabels:false,suppressErrorRendering:true,fontFamily:'Arial, Helvetica, sans-serif'})}
    function installRenderedSvg(container,markup){const template=document.createElement('template');template.innerHTML=markup.trim();template.content.querySelectorAll('style').forEach(style=>style.setAttribute('nonce',cspNonce));container.replaceChildren(template.content)}
    function normalizeSvgBounds(svg){
      let box=svg.viewBox?.baseVal;
      try{
        const boxes=[...svg.children].filter(node=>typeof node.getBBox==='function').map(node=>{try{return node.getBBox()}catch{return null}}).filter(value=>value&&value.width>0&&value.height>0);
        if(boxes.length){
          const left=Math.min(...boxes.map(value=>value.x)),top=Math.min(...boxes.map(value=>value.y)),right=Math.max(...boxes.map(value=>value.x+value.width)),bottom=Math.max(...boxes.map(value=>value.y+value.height));
          const width=right-left,height=bottom-top,padding=Math.max(12,Math.min(32,Math.min(width,height)*.04));
          svg.setAttribute('viewBox',[left-padding,top-padding,width+padding*2,height+padding*2].join(' '));box=svg.viewBox.baseVal;
        }
      }catch{}
      intrinsicWidth=Math.max(1,box?.width||svg.getBoundingClientRect().width||640);
      intrinsicHeight=Math.max(1,box?.height||svg.getBoundingClientRect().height||480);
      svg.removeAttribute('width');svg.removeAttribute('height');svg.setAttribute('preserveAspectRatio','xMidYMid meet');
      document.getElementById('diagramSize').textContent=Math.round(intrinsicWidth)+' × '+Math.round(intrinsicHeight);
    }
    function fitDiagram(kind){
      const viewer=document.getElementById('viewer');if(!viewer||!intrinsicWidth||!intrinsicHeight)return;
      const availableWidth=Math.max(80,viewer.clientWidth-56),availableHeight=Math.max(80,viewer.clientHeight-56);
      const widthScale=availableWidth/intrinsicWidth,pageScale=Math.min(widthScale,availableHeight/intrinsicHeight);
      if(kind==='smart')kind=pageScale<.55&&intrinsicHeight*widthScale>availableHeight*1.35?'width':'page';
      const target=kind==='width'?Math.min(2.5,widthScale):Math.min(2.5,pageScale);
      setZoom(target,false,kind);
    }
    function refitCurrent(){if(mode!=='preview'||!intrinsicWidth)return;if(viewMode==='width'||viewMode==='page')fitDiagram(viewMode);else refreshPanState()}
    function setZoom(value,preserveCenter,nextMode){
      const viewer=document.getElementById('viewer'),svg=document.querySelector('#preview svg');if(!viewer||!svg)return;
      const xRatio=viewer.scrollWidth?((viewer.scrollLeft+viewer.clientWidth/2)/viewer.scrollWidth):.5;
      const yRatio=viewer.scrollHeight?((viewer.scrollTop+viewer.clientHeight/2)/viewer.scrollHeight):.5;
      zoom=clamp(value,.05,8);viewMode=nextMode;
      svg.style.width=Math.max(1,Math.round(intrinsicWidth*zoom))+'px';svg.style.height=Math.max(1,Math.round(intrinsicHeight*zoom))+'px';
      document.getElementById('zoomLabel').textContent=Math.round(zoom*100)+'%';updateFitButtons();
      requestAnimationFrame(()=>{if(preserveCenter){viewer.scrollLeft=xRatio*viewer.scrollWidth-viewer.clientWidth/2;viewer.scrollTop=yRatio*viewer.scrollHeight-viewer.clientHeight/2}else{viewer.scrollLeft=Math.max(0,(viewer.scrollWidth-viewer.clientWidth)/2);viewer.scrollTop=0}refreshPanState()});
    }
    function updateFitButtons(){detail.querySelectorAll('[id^=fit],#actualSize').forEach(button=>button.classList.add('secondary'));if(viewMode==='width')document.getElementById('fitWidth')?.classList.remove('secondary');if(viewMode==='page')document.getElementById('fitPage')?.classList.remove('secondary');if(viewMode==='actual')document.getElementById('actualSize')?.classList.remove('secondary')}
    function refreshPanState(){const viewer=document.getElementById('viewer');if(viewer)viewer.classList.toggle('can-pan',viewer.scrollWidth>viewer.clientWidth+2||viewer.scrollHeight>viewer.clientHeight+2)}

    async function runAction(type,item,button){
      if(type==='open'||type==='copySource'||type==='copyPath'){vscode.postMessage({type,id:item.id});return}
      const svg=document.querySelector('#preview svg');if(!svg)return;
      const markup=exportSvgMarkup(svg);
      if(type==='copySvg'||type==='exportSvg'){vscode.postMessage({type,id:item.id,svg:markup});return}
      if(type==='exportPng'){
        const original=button.textContent;button.disabled=true;button.textContent='Exporting...';
        try{const png=await exportPngData(svg);vscode.postMessage({type,id:item.id,png})}catch(error){document.getElementById('diagramSize').textContent='PNG export failed'}finally{button.disabled=false;button.textContent=original}
      }
    }
    function exportSvgMarkup(svg){const clone=svg.cloneNode(true);clone.style.width='';clone.style.height='';clone.setAttribute('width',String(Math.ceil(intrinsicWidth)));clone.setAttribute('height',String(Math.ceil(intrinsicHeight)));clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.querySelectorAll('style[nonce]').forEach(style=>style.removeAttribute('nonce'));return new XMLSerializer().serializeToString(clone)}
    async function exportPngData(svg){
      const clone=svg.cloneNode(true);const box=svg.viewBox.baseVal;const computedBackground=getComputedStyle(document.getElementById('viewer')).backgroundColor;const background=!computedBackground||computedBackground==='rgba(0, 0, 0, 0)'?(previewTheme==='dark'?'#1e1e1e':'#ffffff'):computedBackground;clone.querySelectorAll('style[nonce]').forEach(style=>style.removeAttribute('nonce'));
      clone.style.width='';clone.style.height='';clone.setAttribute('width',String(Math.ceil(intrinsicWidth)));clone.setAttribute('height',String(Math.ceil(intrinsicHeight)));clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
      const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('x',String(box.x));rect.setAttribute('y',String(box.y));rect.setAttribute('width',String(box.width));rect.setAttribute('height',String(box.height));rect.setAttribute('fill',background);clone.insertBefore(rect,clone.firstChild);
      const url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
      const image=await new Promise((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error('Could not rasterize diagram'));value.src=url});
      const scale=Math.max(.1,Math.min(2,8192/Math.max(intrinsicWidth,intrinsicHeight)));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(intrinsicWidth*scale));canvas.height=Math.max(1,Math.ceil(intrinsicHeight*scale));const context=canvas.getContext('2d');context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1];
    }
    function nextFrame(){return new Promise(resolve=>requestAnimationFrame(()=>resolve()))}
    function formatType(value){return String(value).replace(/diagram$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,character=>character.toUpperCase())}
    function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
    function html(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
    function attr(value){return html(value).replace(/\x60/g,'&#96;')}
    renderBrowser();
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}
