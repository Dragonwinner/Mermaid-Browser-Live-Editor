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

export async function exportMarkdownAsPdf(context: vscode.ExtensionContext, explorerUri?: vscode.Uri): Promise<void> {
  let document: vscode.TextDocument | undefined;

  // If invoked from explorer context menu, open the file first
  if (explorerUri) {
    document = await vscode.workspace.openTextDocument(explorerUri);
  } else {
    document = vscode.window.activeTextEditor?.document;
  }

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
    *{box-sizing:border-box}body{margin:0;padding:24px;color:#1f2937;background:#d1d5db;color-scheme:light;font-family:Arial,Helvetica,sans-serif}.status{position:sticky;top:0;z-index:2;margin:0 auto 16px;width:760px;padding:10px 14px;color:var(--vscode-notifications-foreground,#fff);background:var(--vscode-notifications-background,#252526);border:1px solid var(--vscode-notifications-border,#454545);font:13px var(--vscode-font-family,Arial)}article{width:760px;margin:0 auto;padding:54px 58px;overflow:hidden;color:#111827;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.2);font-size:15px;line-height:1.6}h1,h2,h3,h4{margin:1.25em 0 .55em;line-height:1.25;letter-spacing:0;color:#111827}h1{margin-top:0;font-size:30px;border-bottom:2px solid #0f766e;padding-bottom:10px}h2{font-size:23px;border-bottom:1px solid #d1d5db;padding-bottom:5px}h3{font-size:19px}p{margin:.65em 0}a{color:#0f766e;text-decoration:underline}blockquote{margin:1em 0;padding:.35em 1em;color:#374151;border-left:4px solid #0f766e;background:#f0fdfa}pre{margin:1em 0;padding:13px;overflow:hidden;border:1px solid #d1d5db;background:#f8fafc;font:12px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word}code{font-family:Consolas,monospace;background:#f3f4f6;padding:1px 4px}pre code{background:transparent;padding:0}table{width:100%;margin:1em 0;border-collapse:collapse;font-size:13px}th,td{padding:7px 9px;border:1px solid #cbd5e1;text-align:left;vertical-align:top}th{background:#f1f5f9}img{display:block;max-width:100%;height:auto;margin:1em auto}.mermaid-pdf-diagram{margin:18px 0;padding:12px;overflow:hidden;border:1px solid #d1d5db;background:#fff;text-align:center}.mermaid-pdf-diagram img{display:block;margin:0 auto;max-width:100%;height:auto;background:#fff}hr{margin:1.5em 0;border:0;border-top:1px solid #cbd5e1}ul,ol{padding-left:24px}article>*{break-inside:avoid}
    .math-display{display:block;text-align:center;margin:1em 0;font-size:1.1em;overflow-x:auto}.math-inline{display:inline}
  </style>
</head>
<body>
  <div class="status" id="status">Preparing Markdown and Mermaid diagrams...</div>
  <article id="document"></article>
  <script type="module" nonce="${nonce}">
    import mermaid, { DOMPurify, html2canvas, jsPDF, katex, marked } from "${runtimeUri}";
    const vscode = acquireVsCodeApi();
    const payload = ${data};
    const article = document.getElementById('document');
    const status = document.getElementById('status');
    const update = msg => { status.textContent = msg; vscode.postMessage({type:'progress',message:msg}); };

    try {
      update('Processing math formulas...');
      await tick();

      // --- Math Pre-processing (skip code blocks) ---
      let md = payload.markdown;
      // Protect fenced code blocks and inline code from math replacement
      const codeHolders = [];
      // Fenced blocks first
      md = md.replace(/(\x60\x60\x60[\\s\\S]*?\x60\x60\x60)/g, (m) => {
        codeHolders.push(m);
        return '\\x00CODE' + (codeHolders.length - 1) + '\\x00';
      });
      // Inline code
      md = md.replace(/(\x60[^\x60\\n]+\x60)/g, (m) => {
        codeHolders.push(m);
        return '\\x00CODE' + (codeHolders.length - 1) + '\\x00';
      });
      const mathHolders = [];
      // Display math $$...$$
      md = md.replace(/\\$\\$([\\s\\S]+?)\\$\\$/g, (_, tex) => {
        try {
          const index = mathHolders.push('<div class="math-display">' + katex.renderToString(tex.trim(), {displayMode:true, output:'mathml', throwOnError:false}) + '</div>') - 1;
          return '\\n<div data-pdf-math="' + index + '"></div>\\n';
        }
        catch(e) { return '$$' + tex + '$$'; }
      });
      // Inline math $...$
      md = md.replace(/(?<!\\$)\\$(?!\\$)([^\\n$]+?)\\$(?!\\$)/g, (_, tex) => {
        try {
          const index = mathHolders.push('<span class="math-inline">' + katex.renderToString(tex.trim(), {displayMode:false, output:'mathml', throwOnError:false}) + '</span>') - 1;
          return '<span data-pdf-math="' + index + '"></span>';
        }
        catch(e) { return '$' + tex + '$'; }
      });
      // Restore code blocks
      md = md.replace(/\\x00CODE(\\d+)\\x00/g, (_, idx) => codeHolders[Number(idx)] || '');

      update('Parsing markdown...');
      await tick();
      const markedHtml = await marked.parse(md, {gfm:true, breaks:false});
      const parsed = markedHtml.replace(/<(div|span) data-pdf-math="(\\d+)"><\\/\\1>/g, (_, _tag, idx) => mathHolders[Number(idx)] || '');
      const mathTags = ['math','semantics','mrow','mi','mo','mn','msub','msup','mfrac','msqrt','mroot','mtext','mspace','mover','munder','munderover','mtable','mtr','mtd','maligngroup','malignmark','mphantom','mpadded','merror','mstyle','menclose','mmultiscripts','mprescripts','annotation'];
      article.innerHTML = DOMPurify.sanitize(parsed, {ADD_ATTR:['data-mermaid-index'], ADD_TAGS:mathTags, ALLOW_UNKNOWN_PROTOCOLS:true});

      // --- Mermaid Diagrams ---
      mermaid.initialize({
        startOnLoad:false,
        securityLevel:'strict',
        theme:'default',
        htmlLabels:false,
        suppressErrorRendering:true,
        fontFamily:'Arial, Helvetica, sans-serif',
        themeVariables:{background:'#ffffff',primaryTextColor:'#111827',secondaryTextColor:'#111827',tertiaryTextColor:'#111827',lineColor:'#374151',textColor:'#111827'}
      });
      const blocks = [...article.querySelectorAll('[data-mermaid-index]')];
      update('Rendering ' + blocks.length + ' diagram(s)...');
      await tick();
      for (let i = 0; i < blocks.length; i++) {
        update('Rendering diagram ' + (i+1) + ' of ' + blocks.length + '...');
        await tick();
        const block = blocks[i];
        const source = payload.diagrams[Number(block.dataset.mermaidIndex)];
        if (!source) continue;
        try {
          const rendered = await mermaid.render('mmpdf-' + i, source);
          block.innerHTML = rendered.svg;
          const svgEl = block.querySelector('svg');
          if (svgEl) {
            const png = await withTimeout(svgToPng(svgEl), 8000);
            if (png) {
              const img = document.createElement('img');
              const availableWidth = Math.max(1, block.clientWidth - 24);
              const printableHeight = 880;
              const fit = Math.min(1, availableWidth / png.width, printableHeight / png.height);
              img.src = png.url;
              img.alt = 'Mermaid diagram';
              img.width = Math.max(1, Math.floor(png.width * fit));
              img.height = Math.max(1, Math.floor(png.height * fit));
              block.innerHTML = '';
              block.appendChild(img);
            }
          }
        } catch (err) {
          block.innerHTML = '<pre><code>' + esc(source) + '</code></pre><p style="color:red">Render error: ' + esc(err?.message || String(err)) + '</p>';
        }
      }

      // Wait for all images to load
      await waitForImages(article);
      await document.fonts?.ready;

      // --- Build PDF ---
      const pdf = new jsPDF({orientation:'portrait', unit:'pt', format:'a4', compress:true, putOnlyUsedFonts:true});
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const m = 32, cw = pw - m*2, ch = ph - m*2;
      const articleRect = article.getBoundingClientRect();
      const captureWidth = Math.ceil(articleRect.width);
      const naturalPageHeight = Math.floor(captureWidth * ch / cw);
      const articleStyle = getComputedStyle(article);
      const verticalPadding = parseFloat(articleStyle.paddingTop) + parseFloat(articleStyle.paddingBottom);
      const availableHeight = Math.max(1, naturalPageHeight - verticalPadding);
      const items = [...article.children].map(node => {
        const style = getComputedStyle(node);
        const margin = Math.max(0, parseFloat(style.marginTop)) + Math.max(0, parseFloat(style.marginBottom));
        return {node, height:Math.ceil(node.getBoundingClientRect().height + margin)};
      });
      const pages = [];
      let page = [], used = 0;
      for (const item of items) {
        if (page.length && used + item.height > availableHeight) {
          let carry = [];
          const previous = page[page.length - 1];
          if (page.length > 1 && previous.node.matches('h1,h2,h3,h4')) {
            carry = [page.pop()];
            used -= carry[0].height;
          }
          pages.push(page);
          page = carry;
          used = carry.reduce((sum, entry) => sum + entry.height, 0);
        }
        page.push(item);
        used += item.height;
      }
      if (page.length || pages.length === 0) pages.push(page);

      let pc = 0;
      for (const pageItems of pages) {
        update('Capturing page ' + (pc + 1) + ' of ' + pages.length + '...');
        await tick();
        const captureArticle = article.cloneNode(false);
        captureArticle.removeAttribute('id');
        captureArticle.setAttribute('aria-hidden', 'true');
        captureArticle.style.position = 'absolute';
        captureArticle.style.left = '0';
        captureArticle.style.top = '0';
        captureArticle.style.margin = '0';
        captureArticle.style.boxShadow = 'none';
        for (const item of pageItems) captureArticle.appendChild(item.node.cloneNode(true));
        document.body.appendChild(captureArticle);
        await waitForImages(captureArticle);
        let pageCanvas;
        try {
          const captureRect = captureArticle.getBoundingClientRect();
          pageCanvas = await html2canvas(captureArticle, {
            scale:1,
            width:Math.ceil(captureRect.width),
            height:Math.ceil(captureRect.height),
            windowWidth:Math.max(document.documentElement.clientWidth, Math.ceil(captureRect.width)),
            windowHeight:Math.max(document.documentElement.clientHeight, Math.ceil(captureRect.height)),
            scrollX:0,
            scrollY:0,
            backgroundColor:'#ffffff',
            logging:false,
            useCORS:true,
            imageTimeout:15000
          });
        } finally {
          captureArticle.remove();
        }
        if (pc > 0) pdf.addPage();
        const fw = Math.min(cw, ch * pageCanvas.width / pageCanvas.height);
        const rh = pageCanvas.height * fw / pageCanvas.width;
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', .92), 'JPEG', (pw-fw)/2, m, fw, rh, undefined, 'FAST');
        pageCanvas.width = 1;
        pageCanvas.height = 1;
        pc++;
      }

      update('Saving PDF...');
      const bytes = new Uint8Array(pdf.output('arraybuffer'));
      let bin = '';
      for (let s = 0; s < bytes.length; s += 32768) bin += String.fromCharCode(...bytes.subarray(s, s + 32768));
      vscode.postMessage({type:'pdfReady', base64:btoa(bin), pageCount:pc});
    } catch (error) {
      const msg = error?.message || String(error);
      status.textContent = 'Export failed: ' + msg;
      vscode.postMessage({type:'error', message:msg});
    }

    function tick() { return new Promise(r => setTimeout(r, 20)); }
    function withTimeout(p, ms) { return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }

    async function svgToPng(svgEl) {
      try {
        const box = svgEl.viewBox?.baseVal;
        const sw = box?.width || svgEl.getBoundingClientRect().width || 800;
        const sh = box?.height || svgEl.getBoundingClientRect().height || 600;
        const sc = 2;
        const w = Math.ceil(sw) * sc, h = Math.ceil(sh) * sc;
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(Math.ceil(sw)));
        clone.setAttribute('height', String(Math.ceil(sh)));
        clone.style.backgroundColor = '#fff';
        clone.style.colorScheme = 'light';
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', 'white');
        clone.insertBefore(bg, clone.firstChild);
        const svgStr = new XMLSerializer().serializeToString(clone);
        const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
        return new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve({url:c.toDataURL('image/png'),width:sw,height:sh});
          };
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        });
      } catch { return null; }
    }

    function waitForImages(root) {
      return Promise.all([...root.querySelectorAll('img')].map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
      ));
    }
    function esc(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
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
