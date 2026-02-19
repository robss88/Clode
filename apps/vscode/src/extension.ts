import * as vscode from 'vscode';
import { ClaudeAgentViewProvider } from './webview-provider';

let provider: ClaudeAgentViewProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Agent extension activated');

  const workingDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;

  provider = new ClaudeAgentViewProvider(context.extensionUri, workingDir);

  // Open panel command — creates or reveals the editor panel
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.openPanel', () => {
      provider?.createPanel();
    })
  );

  // Auto-open on activation
  provider.createPanel();

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.createCheckpoint', async () => {
      const service = provider?.getService();
      if (!service) {
        vscode.window.showWarningMessage('No project open');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Checkpoint title (optional)',
        placeHolder: 'Enter a title for this checkpoint',
      });

      try {
        await service.createCheckpoint(title || undefined);
        vscode.window.showInformationMessage('Checkpoint created');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create checkpoint: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.navigateBack', () => {
      vscode.window.showInformationMessage('Navigate back — use the Git tab');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.navigateForward', () => {
      vscode.window.showInformationMessage('Navigate forward — use the Git tab');
    })
  );
}

export function deactivate() {
  provider?.dispose();
}
