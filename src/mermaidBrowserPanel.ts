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
  type?: "refresh" | "open" | "copySource" | "copyPath" | "exportSvg";
  id?: string;
  svg?: string;
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
      case "exportSvg":
        if (message.svg) {
          await exportSvg(entry, message.svg);
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
    :root{color-scheme:light dark;--border:var(--vscode-panel-border,rgba(128,128,128,.35));--muted:var(--vscode-descriptionForeground)}
    *{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}button,input,select{font:inherit}button{min-height:30px;padding:5px 10px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid transparent;cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}button.secondary{color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground)}
    .shell{display:grid;grid-template-rows:auto auto minmax(0,1fr);height:100vh}header{display:flex;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid var(--border);background:var(--vscode-sideBar-background)}h1{margin:0 0 3px;font-size:20px;letter-spacing:0}.sub,.meta,.empty,.error{color:var(--muted)}.stats{display:flex;gap:18px;align-items:center}.stat strong,.stat span{display:block}.stat strong{font-size:17px}.stat span{font-size:11px}
    .toolbar{display:grid;grid-template-columns:minmax(180px,1fr) 180px auto;gap:8px;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--vscode-editorGroupHeader-tabsBackground)}input,select{width:100%;min-height:32px;padding:5px 8px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--border));outline-color:var(--vscode-focusBorder)}
    main{display:grid;grid-template-columns:minmax(250px,360px) minmax(0,1fr);min-height:0}.list{overflow:auto;border-right:1px solid var(--border);background:var(--vscode-sideBar-background)}.item{display:block;width:100%;padding:10px 13px;text-align:left;color:inherit;background:transparent;border:0;border-bottom:1px solid var(--border)}.item:hover,.item.active{background:var(--vscode-list-hoverBackground)}.item.active{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}.item-title{display:flex;justify-content:space-between;gap:8px;font-weight:600}.badge{flex:none;padding:1px 5px;color:var(--vscode-badge-foreground);background:var(--vscode-badge-background);font-size:11px}.meta{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
    .detail{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0}.detail-head{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)}h2{margin:0 0 4px;font-size:17px;letter-spacing:0}.actions{display:flex;gap:7px;align-items:flex-start;flex-wrap:wrap;justify-content:flex-end}.viewer{min-width:0;min-height:0;overflow:scroll;scrollbar-gutter:stable both-edges}.viewer::-webkit-scrollbar{width:13px;height:13px}.viewer::-webkit-scrollbar-track{background:var(--vscode-scrollbarSlider-background)}.viewer::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-hoverBackground);border:3px solid transparent;background-clip:padding-box}.preview{display:flex;align-items:flex-start;justify-content:flex-start;width:max-content;min-width:100%;min-height:100%;padding:20px;background:var(--vscode-editor-background)}.preview svg{max-width:none!important;height:auto}.source{margin:0;padding:18px;min-width:max-content;min-height:100%;overflow:visible;color:var(--vscode-editor-foreground);background:var(--vscode-textCodeBlock-background,var(--vscode-editor-background));font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);line-height:1.5;white-space:pre}.empty,.error{padding:22px}.limit{padding:6px 20px;color:var(--vscode-inputValidation-warningForeground);background:var(--vscode-inputValidation-warningBackground);border-bottom:1px solid var(--vscode-inputValidation-warningBorder)}
    @media(max-width:760px){header,.detail-head{display:block}.stats,.actions{margin-top:10px;justify-content:flex-start}.toolbar{grid-template-columns:1fr}main{grid-template-columns:1fr;grid-template-rows:minmax(160px,36vh) minmax(0,1fr)}.list{border-right:0;border-bottom:1px solid var(--border)}}
  </style>
</head>
<body>
  <div class="shell">
    <header><div><h1>Mermaid Browser</h1><div class="sub" id="workspace"></div></div><div class="stats"><div class="stat"><strong id="count">0</strong><span>diagrams</span></div><div class="stat"><strong id="files">0</strong><span>files</span></div><div class="stat"><strong id="types">0</strong><span>types</span></div></div></header>
    <section><div class="toolbar"><input id="search" type="search" placeholder="Search diagrams, files, or types" aria-label="Search diagrams"><select id="filter" aria-label="Filter by type"></select><button id="refresh" type="button" title="Refresh workspace index">Refresh</button></div><div id="limit"></div></section>
    <main><section class="list" id="list"></section><section class="detail" id="detail"></section></main>
  </div>
  <script type="module" nonce="${nonce}">
    import mermaid from "${mermaidUri}";
    const vscode = acquireVsCodeApi();
    const payload = ${data};
    let selectedId = payload.preferredId || payload.diagrams[0]?.id || null;
    let mode = 'preview';
    let renderVersion = 0;
    const byId = new Map(payload.diagrams.map(item => [item.id,item]));
    const search = document.getElementById('search');
    const filter = document.getElementById('filter');
    const list = document.getElementById('list');
    const detail = document.getElementById('detail');
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:payload.theme,suppressErrorRendering:true});
    document.getElementById('workspace').textContent = payload.workspaceName + ' | indexed ' + payload.indexedAt;
    document.getElementById('count').textContent = String(payload.diagrams.length);
    document.getElementById('files').textContent = String(new Set(payload.diagrams.map(item => item.uri)).size);
    document.getElementById('types').textContent = String(new Set(payload.diagrams.map(item => item.diagramType)).size);
    document.getElementById('limit').innerHTML = payload.limitReached ? '<div class="limit">The configured index limit was reached. Increase Mermaid Browser: File Limit to scan more files.</div>' : '';
    document.getElementById('refresh').addEventListener('click',()=>vscode.postMessage({type:'refresh'}));
    const types = [...new Set(payload.diagrams.map(item=>item.diagramType))].sort();
    filter.innerHTML = '<option value="">All diagram types</option>' + types.map(type=>'<option value="'+attr(type)+'">'+html(type)+'</option>').join('');
    search.addEventListener('input',render);filter.addEventListener('change',render);
    function filtered(){const query=search.value.trim().toLowerCase();return payload.diagrams.filter(item=>(!filter.value||item.diagramType===filter.value)&&(!query||[item.title,item.relativePath,item.diagramType].join(' ').toLowerCase().includes(query)))}
    function render(){const items=filtered();if(!items.some(item=>item.id===selectedId))selectedId=items[0]?.id||null;list.innerHTML=items.length?items.map(item=>'<button class="item'+(item.id===selectedId?' active':'')+'" data-id="'+attr(item.id)+'"><span class="item-title"><span>'+html(item.title)+'</span><span class="badge">'+html(item.diagramType)+'</span></span><span class="meta">'+html(item.relativePath)+':'+item.line+' | '+item.charCount+' chars</span></button>').join(''):'<div class="empty">No diagrams match this view.</div>';list.querySelectorAll('[data-id]').forEach(node=>node.addEventListener('click',()=>{selectedId=node.dataset.id;render()}));void renderDetail()}
    async function renderDetail(){const version=++renderVersion;const item=byId.get(selectedId);if(!item){detail.innerHTML='<div class="empty">Create a .mmd file or add a Mermaid fence to Markdown, then refresh.</div>';return}detail.innerHTML='<div class="detail-head"><div><h2>'+html(item.title)+'</h2><div class="meta">'+html(item.relativePath)+':'+item.line+' | '+html(item.source)+' | '+html(item.diagramType)+'</div></div><div class="actions"><button data-mode="preview" class="'+(mode==='preview'?'':'secondary')+'">Preview</button><button data-mode="source" class="'+(mode==='source'?'':'secondary')+'">Source</button><button data-action="open" class="secondary">Open</button><button data-action="copySource" class="secondary">Copy</button><button data-action="copyPath" class="secondary">Copy path</button><button data-action="exportSvg" class="secondary" '+(mode==='preview'?'':'disabled')+'>Export SVG</button></div></div><div class="viewer" id="viewer"></div>';detail.querySelectorAll('[data-mode]').forEach(node=>node.addEventListener('click',()=>{mode=node.dataset.mode;void renderDetail()}));detail.querySelectorAll('[data-action]').forEach(node=>node.addEventListener('click',()=>{const type=node.dataset.action;if(type==='exportSvg'){const svg=document.querySelector('#viewer svg')?.outerHTML;if(svg)vscode.postMessage({type,id:item.id,svg})}else vscode.postMessage({type,id:item.id})}));const viewer=document.getElementById('viewer');if(mode==='source'){viewer.innerHTML='<pre class="source"><code>'+html(item.code)+'</code></pre>';return}viewer.innerHTML='<div class="preview" id="preview"><span class="meta">Rendering diagram...</span></div>';try{const result=await mermaid.render('mermaid-browser-'+version,item.code);if(version!==renderVersion)return;const preview=document.getElementById('preview');preview.innerHTML=result.svg;const svg=preview.querySelector('svg');const box=svg?.viewBox?.baseVal;if(svg&&box?.width){svg.style.width=Math.max(640,Math.ceil(box.width))+'px'}result.bindFunctions?.(preview)}catch(error){if(version!==renderVersion)return;viewer.innerHTML='<div class="error"><strong>Preview failed</strong><p>'+html(error?.message||String(error))+'</p></div>'}}
    function html(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}function attr(value){return html(value).replace(/\x60/g,'&#96;')}render();
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
