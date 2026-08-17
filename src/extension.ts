import * as vscode from "vscode";
import { MermaidBrowserPanel, createDiagram } from "./mermaidBrowserPanel";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("mermaidBrowser.open", () => MermaidBrowserPanel.open(context)),
    vscode.commands.registerCommand("mermaidBrowser.previewDiagram", () =>
      MermaidBrowserPanel.open(context, vscode.window.activeTextEditor?.document.uri)
    ),
    vscode.commands.registerCommand("mermaidBrowser.createDiagram", () => createDiagram()),
    vscode.commands.registerCommand("mermaidBrowser.refresh", () => MermaidBrowserPanel.refreshCurrent())
  );
}

export function deactivate(): void {}
