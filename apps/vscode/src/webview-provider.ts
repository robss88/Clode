import * as vscode from 'vscode';
import { ClaudeService } from './claude-service';
import { MessageHandler } from './message-handler';

export class ClaudeAgentViewProvider {
  private _panel: vscode.WebviewPanel | null = null;
  private service: ClaudeService | null = null;
  private messageHandler: MessageHandler | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workingDir: string | null
  ) {}

  public createPanel() {
    // If panel already exists, just reveal it
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'claude-agent',
      'Claude Agent',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
        retainContextWhenHidden: true,
      }
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._setupPanel();
  }

  /**
   * Restore a panel that VS Code deserialized after a window reload.
   * The webview already has its previous state via vscodeApi.getState().
   */
  public restorePanel(panel: vscode.WebviewPanel) {
    if (this._panel) {
      this._panel.dispose();
    }
    this._panel = panel;
    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._setupPanel();
  }

  private _setupPanel() {
    if (!this._panel) return;

    // Clean up on panel close
    this._panel.onDidDispose(() => {
      this._panel = null;
      this.service?.dispose();
      this.service = null;
      this.messageHandler = null;
      this.initPromise = null;
      this.isReady = false;
    });

    // Initialize service and message handler
    if (this._workingDir) {
      const postMessage = (msg: any) => {
        if (this._panel) {
          this._panel.webview.postMessage(msg);
        }
      };

      this.service = new ClaudeService(this._workingDir, postMessage);
      this.messageHandler = new MessageHandler(this.service, postMessage);

      // Initialize async — send init:state AFTER initialization completes
      this.initPromise = this.service.initialize().then(async () => {
        this.isReady = true;
        const branch = await this.service!.getCurrentGitBranch();
        if (this._panel) {
          this._panel.webview.postMessage({
            type: 'init:state',
            data: {
              workspacePath: this._workingDir,
              branch: branch || null,
              activeChatSessionId: null,
              isStreaming: false,
            },
          });
        }
      });
    }

    // Handle messages from webview — wait for init before processing
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      // Handle init:request — webview asking for init state (race condition fallback)
      if (msg.type === 'init:request') {
        if (!this.isReady && this.initPromise) {
          await this.initPromise;
        }
        const branch = await this.service?.getCurrentGitBranch();
        const initState = {
          workspacePath: this._workingDir,
          branch: branch || null,
          activeChatSessionId: null,
          isStreaming: false,
        };
        if (this._panel) {
          if (msg.requestId) {
            this._panel.webview.postMessage({
              type: 'init:request',
              requestId: msg.requestId,
              data: initState,
            });
          }
          this._panel.webview.postMessage({ type: 'init:state', data: initState });
        }
        return;
      }

      if (!this.isReady && this.initPromise) {
        await this.initPromise;
      }
      if (this.messageHandler) {
        await this.messageHandler.handle(msg);
      }
    });
  }

  public postMessage(message: any) {
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }

  public getService(): ClaudeService | null {
    return this.service;
  }

  public dispose() {
    this.service?.dispose();
    this._panel?.dispose();
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Claude Agent</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
