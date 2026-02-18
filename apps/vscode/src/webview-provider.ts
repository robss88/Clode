import * as vscode from 'vscode';
import { ClaudeService } from './claude-service';
import { MessageHandler } from './message-handler';

export class ClaudeAgentViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private service: ClaudeService | null = null;
  private messageHandler: MessageHandler | null = null;
  private initPromise: Promise<void> | null = null;
  private isReady = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workingDir: string | null
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Initialize service and message handler
    if (this._workingDir) {
      const postMessage = (msg: any) => {
        if (this._view) {
          this._view.webview.postMessage(msg);
        }
      };

      this.service = new ClaudeService(this._workingDir, postMessage);
      this.messageHandler = new MessageHandler(this.service, postMessage);

      // Initialize async — send init:state AFTER initialization completes
      this.initPromise = this.service.initialize().then(async () => {
        this.isReady = true;
        const branch = await this.service!.getCurrentGitBranch();
        webviewView.webview.postMessage({
          type: 'init:state',
          data: {
            workspacePath: this._workingDir,
            branch: branch || null,
            activeChatSessionId: null,
            isStreaming: false,
          },
        });
      });
    }

    // Handle messages from webview — wait for init before processing
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!this.isReady && this.initPromise) {
        await this.initPromise;
      }
      if (this.messageHandler) {
        await this.messageHandler.handle(msg);
      }
    });
  }

  public postMessage(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  public getService(): ClaudeService | null {
    return this.service;
  }

  public dispose() {
    this.service?.dispose();
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
