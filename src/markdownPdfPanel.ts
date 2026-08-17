import * as path from "path";
import * as vscode from "vscode";

interface MarkdownPdfPayload {
  markdown: string;
  diagrams: string[];
  sourceName: string;
}

interface PdfMessage {
  type?: "progress" | "pdfReady" | "error";
  base64?: string;
  message?: string;
  pageCount?: number;
}

export async function exportMarkdownAsPdf(context: vscode.ExtensionContext): Promise<void> {
  const document = vscode.window.activeTextEditor?.document;
  if (!document || !isMarkdownDocument(document)) {
    void vscode.window.showWarningMessage("Open a Markdown file before exporting it as PDF.");
    return;
  }

  const target = await vscode.window.showSaveDialog({
    defaultUri: defaultPdfUri(document),
    filters: { "PDF document": ["pdf"] },
    saveLabel: "Export Markdown as PDF",
  });
  if (!target) {
    return;
  }

  const markdownWithImages = await inlineLocalImages(document.getText(), document.uri);
  const payload = extractMermaidFences(markdownWithImages, path.basename(document.fileName));
  const distRoot = vscode.Uri.joinPath(context.extensionUri, "dist");
  const panel = vscode.window.createWebviewPanel(
    "mermaidBrowser.markdownPdf",
    `Exporting ${path.basename(target.fsPath)}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, localResourceRoots: [distRoot] }
  );

  panel.webview.html = markdownPdfHtml(context, panel.webview, payload);
  const subscription = panel.webview.onDidReceiveMessage(async (message: PdfMessage) => {
    if (message.type === "progress" && message.message) {
      panel.title = message.message;
      return;
    }
    if (message.type === "error") {
      void vscode.window.showErrorMessage(`PDF export failed: ${message.message ?? "Unknown error"}`);
      return;
    }
    if (message.type !== "pdfReady" || !message.base64) {
      return;
    }

    try {
      await vscode.workspace.fs.writeFile(target, Buffer.from(message.base64, "base64"));
      const pages = message.pageCount === 1 ? "1 page" : `${message.pageCount ?? 0} pages`;
      const action = await vscode.window.showInformationMessage(
        `Exported ${path.basename(target.fsPath)} (${pages}).`,
        "Open PDF"
      );
      panel.dispose();
      if (action === "Open PDF") {
        await vscode.env.openExternal(target);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not save PDF: ${detail}`);
    }
  });
  panel.onDidDispose(() => subscription.dispose());
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
  const extension = path.extname(document.fileName).toLowerCase();
  return document.languageId === "markdown" || extension === ".md" || extension === ".markdown";
}

function defaultPdfUri(document: vscode.TextDocument): vscode.Uri | undefined {
  const baseName = document.uri.scheme === "untitled"
    ? "markdown-export.pdf"
    : `${path.parse(document.fileName).name}.pdf`;
  if (document.uri.scheme === "file") {
    return vscode.Uri.file(path.join(path.dirname(document.fileName), baseName));
  }
  return vscode.workspace.workspaceFolders?.[0]
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, baseName)
    : undefined;
}

function extractMermaidFences(markdown: string, sourceName: string): MarkdownPdfPayload {
  const diagrams: string[] = [];
  const fencePattern = /^(`{3,}|~{3,})\s*mermaid[^\r\n]*\r?\n([\s\S]*?)^\1\s*$/gim;
  const prepared = markdown.replace(fencePattern, (_match, _fence: string, code: string) => {
    const index = diagrams.push(code.trim()) - 1;
    return `\n<div class="mermaid-pdf-diagram" data-mermaid-index="${index}"></div>\n`;
  });
  return { markdown: prepared, diagrams, sourceName };
}

async function inlineLocalImages(markdown: string, documentUri: vscode.Uri): Promise<string> {
  if (documentUri.scheme !== "file") {
    return markdown;
  }

  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/g;
  const matches = [...markdown.matchAll(pattern)];
  let result = markdown;
  for (const match of matches.reverse()) {
    const rawTarget = match[2].replace(/^<|>$/g, "");
    if (/^(?:https?:|data:)/i.test(rawTarget)) {
      continue;
    }
    try {
      const decoded = decodeURIComponent(rawTarget.split(/[?#]/, 1)[0]);
      const imagePath = path.resolve(path.dirname(documentUri.fsPath), decoded);
      const imageUri = vscode.Uri.file(imagePath);
      const bytes = await vscode.workspace.fs.readFile(imageUri);
      const mimeType = imageMimeType(imagePath);
      if (!mimeType || match.index === undefined) {
        continue;
      }
      const replacement = `![${match[1]}](data:${mimeType};base64,${Buffer.from(bytes).toString("base64")})`;
      result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
    } catch {
      // Keep unresolved image references in the document instead of failing the export.
    }
  }
  return result;
}

function imageMimeType(filePath: string): string | undefined {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    default: return undefined;
  }
}

function markdownPdfHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  payload: MarkdownPdfPayload
): string {
  const nonce = nonceValue();
  const runtimeUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "dist", "mermaidRuntime.js")
  );
  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    *{box-sizing:border-box}body{margin:0;padding:24px;color:#1f2937;background:#d1d5db;font-family:Arial,Helvetica,sans-serif}.status{position:sticky;top:0;z-index:2;margin:0 auto 16px;width:760px;padding:10px 14px;color:var(--vscode-notifications-foreground,#fff);background:var(--vscode-notifications-background,#252526);border:1px solid var(--vscode-notifications-border,#454545);font:13px var(--vscode-font-family,Arial)}article{width:760px;margin:0 auto;padding:54px 58px;overflow:hidden;color:#111827;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.2);font-size:15px;line-height:1.6}h1,h2,h3,h4{margin:1.25em 0 .55em;line-height:1.25;letter-spacing:0;color:#111827}h1{margin-top:0;font-size:30px;border-bottom:2px solid #0f766e;padding-bottom:10px}h2{font-size:23px;border-bottom:1px solid #d1d5db;padding-bottom:5px}h3{font-size:19px}p{margin:.65em 0}a{color:#0f766e;text-decoration:underline}blockquote{margin:1em 0;padding:.35em 1em;color:#374151;border-left:4px solid #0f766e;background:#f0fdfa}pre{margin:1em 0;padding:13px;overflow:hidden;border:1px solid #d1d5db;background:#f8fafc;font:12px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word}code{font-family:Consolas,monospace;background:#f3f4f6;padding:1px 4px}pre code{background:transparent;padding:0}table{width:100%;margin:1em 0;border-collapse:collapse;font-size:13px}th,td{padding:7px 9px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}th{background:#f1f5f9}img{display:block;max-width:100%;height:auto;margin:1em auto}.mermaid-pdf-diagram{margin:18px 0;padding:12px;overflow:hidden;border:1px solid #d1d5db;text-align:center}.mermaid-pdf-diagram svg{max-width:100%;height:auto}hr{margin:1.5em 0;border:0;border-top:1px solid #cbd5e1}ul,ol{padding-left:24px}article>*{break-inside:avoid}
  </style>
</head>
<body>
  <div class="status" id="status">Preparing Markdown and Mermaid diagrams...</div>
  <article id="document"></article>
  <script type="module" nonce="${nonce}">
    import mermaid, { DOMPurify, html2canvas, jsPDF, marked } from "${runtimeUri}";
    const vscode = acquireVsCodeApi();
    const payload = ${data};
    const article = document.getElementById('document');
    const status = document.getElementById('status');
    const update = message => { status.textContent=message; vscode.postMessage({type:'progress',message}); };
    try {
      const parsed = await marked.parse(payload.markdown,{gfm:true,breaks:false});
      article.innerHTML = DOMPurify.sanitize(parsed,{ADD_ATTR:['data-mermaid-index']});
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',suppressErrorRendering:true});
      const blocks = [...article.querySelectorAll('[data-mermaid-index]')];
      for(let index=0;index<blocks.length;index+=1){
        update('Rendering diagram '+(index+1)+' of '+blocks.length+'...');
        const block=blocks[index];const source=payload.diagrams[Number(block.dataset.mermaidIndex)];
        if(!source)continue;
        try{const rendered=await mermaid.render('markdown-pdf-'+index,source);block.innerHTML=rendered.svg;rendered.bindFunctions?.(block)}
        catch(error){block.innerHTML='<pre><code>'+escapeHtml(source)+'</code></pre><p>Diagram preview failed: '+escapeHtml(error?.message||String(error))+'</p>'}
      }
      await waitForImages(article);
      await document.fonts?.ready;
      update('Building PDF pages...');
      if(article.scrollHeight>56000)throw new Error('This Markdown file is too long for a single export. Split it into smaller documents.');
      const scale=Math.max(.55,Math.min(1.7,28000/article.scrollHeight));
      const canvas=await html2canvas(article,{scale,backgroundColor:'#ffffff',logging:false,useCORS:true,imageTimeout:12000});
      const pdf=new jsPDF({orientation:'portrait',unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});
      const pageWidth=pdf.internal.pageSize.getWidth();const pageHeight=pdf.internal.pageSize.getHeight();
      const margin=32;const contentWidth=pageWidth-margin*2;const contentHeight=pageHeight-margin*2;
      const naturalPagePixels=Math.floor(canvas.width*contentHeight/contentWidth);
      const ratio=canvas.width/article.getBoundingClientRect().width;
      const boundaries=[...article.children].map(node=>Math.floor(node.offsetTop*ratio)).filter(value=>value>0);
      const exactPages=canvas.height/naturalPagePixels;const remainder=exactPages-Math.floor(exactPages);
      const plannedPages=Math.max(1,remainder>0&&remainder<.12?Math.floor(exactPages):Math.ceil(exactPages));
      let offset=0;let pageCount=0;
      while(pageCount<plannedPages){
        const pagesLeft=plannedPages-pageCount;const ideal=offset+Math.ceil((canvas.height-offset)/pagesLeft);
        const candidates=boundaries.filter(value=>Math.abs(value-ideal)<=naturalPagePixels*.1&&value>offset+80);
        const end=pageCount===plannedPages-1?canvas.height:(candidates.sort((a,b)=>Math.abs(a-ideal)-Math.abs(b-ideal))[0]??ideal);
        const sliceHeight=end-offset;const pageCanvas=document.createElement('canvas');
        pageCanvas.width=canvas.width;pageCanvas.height=sliceHeight;
        pageCanvas.getContext('2d').drawImage(canvas,0,offset,canvas.width,sliceHeight,0,0,canvas.width,sliceHeight);
        if(pageCount>0)pdf.addPage();
        const fittedWidth=Math.min(contentWidth,contentHeight*canvas.width/sliceHeight);
        const renderedHeight=sliceHeight*fittedWidth/canvas.width;const x=(pageWidth-fittedWidth)/2;
        pdf.addImage(pageCanvas.toDataURL('image/jpeg',.94),'JPEG',x,margin,fittedWidth,renderedHeight,undefined,'FAST');
        offset=end;pageCount+=1;
      }
      update('Saving PDF...');
      const bytes=new Uint8Array(pdf.output('arraybuffer'));let binary='';
      for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
      vscode.postMessage({type:'pdfReady',base64:btoa(binary),pageCount});
    }catch(error){const message=error?.message||String(error);status.textContent='Export failed: '+message;vscode.postMessage({type:'error',message});}
    function waitForImages(root){return Promise.all([...root.querySelectorAll('img')].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true})})))}
    function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  </script>
</body>
</html>`;
}

function nonceValue(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}
