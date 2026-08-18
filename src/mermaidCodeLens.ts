import * as vscode from "vscode";

/**
 * Provides CodeLens links above every ```mermaid fence in Markdown files.
 * Links: Preview | Edit Live | Copy | Export SVG
 */
export class MermaidCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();
    const pattern = /^(`{3,}|~{3,})\s*mermaid[^\r\n]*$/gim;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text))) {
      const fence = match[1];
      const startOffset = match.index;
      const startPos = document.positionAt(startOffset);
      const line = startPos.line;

      // Find the closing fence
      const closingPattern = new RegExp(`^${fence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
      const afterFence = text.slice(match.index + match[0].length);
      const closingMatch = closingPattern.exec(afterFence);
      if (!closingMatch) {
        continue;
      }

      const codeStart = match.index + match[0].length;
      const codeEnd = codeStart + closingMatch.index;
      const code = text.slice(codeStart, codeEnd).trim();
      if (!code) {
        continue;
      }

      const range = new vscode.Range(line, 0, line, match[0].length);

      const info = {
        code,
        uri: document.uri.toString(),
        line: line + 1,
      };

      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(preview) Preview",
          command: "mermaidBrowser.previewInline",
          arguments: [info],
          tooltip: "Render this diagram in a side panel",
        }),
        new vscode.CodeLens(range, {
          title: "$(edit) Edit Live",
          command: "mermaidBrowser.editLive",
          arguments: [info],
          tooltip: "Open side-by-side code editor with live preview",
        }),
        new vscode.CodeLens(range, {
          title: "$(copy) Copy",
          command: "mermaidBrowser.copyInline",
          arguments: [info],
          tooltip: "Copy mermaid source to clipboard",
        }),
        new vscode.CodeLens(range, {
          title: "$(export) Export SVG",
          command: "mermaidBrowser.exportSvgInline",
          arguments: [info],
          tooltip: "Export this diagram as an SVG file",
        })
      );
    }

    return lenses;
  }

  public refresh(): void {
    this.onDidChangeEmitter.fire();
  }
}
