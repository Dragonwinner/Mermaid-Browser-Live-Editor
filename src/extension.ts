import * as vscode from "vscode";
import { LiveEditPanel, InlineDiagramInfo } from "./liveEditPanel";
import { exportMarkdownAsPdf } from "./markdownPdfPanel";
import { MermaidBrowserPanel, createDiagram } from "./mermaidBrowserPanel";
import { MermaidCodeLensProvider } from "./mermaidCodeLens";

export function activate(context: vscode.ExtensionContext): void {
  // CodeLens provider for mermaid blocks in markdown
  const codeLensProvider = new MermaidCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "markdown", scheme: "file" },
      codeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { language: "markdown", scheme: "untitled" },
      codeLensProvider
    )
  );

  // Refresh CodeLens when markdown files change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "markdown") {
        codeLensProvider.refresh();
      }
    })
  );

  // Existing commands
  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidBrowser.open", () => MermaidBrowserPanel.open(context)),
    vscode.commands.registerCommand("mermaidBrowser.previewDiagram", () =>
      MermaidBrowserPanel.open(context, vscode.window.activeTextEditor?.document.uri)
    ),
    vscode.commands.registerCommand("mermaidBrowser.createDiagram", () => createDiagram()),
    vscode.commands.registerCommand("mermaidBrowser.refresh", () => MermaidBrowserPanel.refreshCurrent()),
    vscode.commands.registerCommand("mermaidBrowser.exportMarkdownPdf", (uri?: vscode.Uri) =>
      exportMarkdownAsPdf(context, uri)
    )
  );

  // Inline CodeLens commands
  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidBrowser.previewInline", (info: InlineDiagramInfo) => {
      void MermaidBrowserPanel.open(context, vscode.Uri.parse(info.uri));
    }),
    vscode.commands.registerCommand("mermaidBrowser.editLive", (info: InlineDiagramInfo) => {
      void LiveEditPanel.open(context, info);
    }),
    vscode.commands.registerCommand("mermaidBrowser.copyInline", (info: InlineDiagramInfo) => {
      void vscode.env.clipboard.writeText(info.code).then(() => {
        void vscode.window.showInformationMessage("Mermaid diagram source copied.");
      });
    }),
    vscode.commands.registerCommand("mermaidBrowser.exportSvgInline", (info: InlineDiagramInfo) => {
      // Open the browser with this diagram to use the built-in SVG export
      void MermaidBrowserPanel.open(context, vscode.Uri.parse(info.uri));
    })
  );
}

export function deactivate(): void {}
