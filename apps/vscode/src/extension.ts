import * as vscode from 'vscode';
import { ClaudeCodeManager, CheckpointManager } from '@claude-agent/core';

let claudeManager: ClaudeCodeManager | null = null;
let checkpointManager: CheckpointManager | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Agent extension activated');

  // Register webview provider
  const provider = new ClaudeAgentViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claude-agent.mainView', provider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.openPanel', () => {
      vscode.commands.executeCommand('claude-agent.mainView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.createCheckpoint', async () => {
      if (!checkpointManager) {
        vscode.window.showWarningMessage('No project open');
        return;
      }

      const title = await vscode.window.showInputBox({
        prompt: 'Checkpoint title (optional)',
        placeHolder: 'Enter a title for this checkpoint',
      });

      try {
        await checkpointManager.createCheckpoint(title || undefined);
        vscode.window.showInformationMessage('Checkpoint created');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create checkpoint: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.navigateBack', async () => {
      if (!checkpointManager || !checkpointManager.canGoBack) {
        vscode.window.showWarningMessage('Cannot navigate back');
        return;
      }

      try {
        await checkpointManager.navigateBack();
        vscode.window.showInformationMessage('Restored previous checkpoint');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-agent.navigateForward', async () => {
      if (!checkpointManager || !checkpointManager.canGoForward) {
        vscode.window.showWarningMessage('Cannot navigate forward');
        return;
      }

      try {
        await checkpointManager.navigateForward();
        vscode.window.showInformationMessage('Restored next checkpoint');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to navigate: ${error}`);
      }
    })
  );

  // Initialize when workspace is available
  if (vscode.workspace.workspaceFolders?.length) {
    initializeForWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
  }

  // Re-initialize when workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      if (event.added.length > 0) {
        initializeForWorkspace(event.added[0].uri.fsPath);
      }
    })
  );
}

async function initializeForWorkspace(workingDir: string) {
  try {
    // Initialize checkpoint manager
    checkpointManager = new CheckpointManager({ workingDir });
    await checkpointManager.initialize();

    // Initialize Claude Code manager
    claudeManager = new ClaudeCodeManager({
      config: { workingDir },
    });

    console.log('Claude Agent initialized for:', workingDir);
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
}

export function deactivate() {
  if (claudeManager) {
    claudeManager.terminate();
  }
}

class ClaudeAgentViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.handleSendMessage(data.content);
          break;
        case 'createCheckpoint':
          await this.handleCreateCheckpoint(data.title, data.description);
          break;
        case 'restoreCheckpoint':
          await this.handleRestoreCheckpoint(data.checkpointId);
          break;
        case 'navigateForward':
          await this.handleNavigateForward();
          break;
        case 'navigateBack':
          await this.handleNavigateBack();
          break;
        case 'getCheckpoints':
          await this.sendCheckpoints();
          break;
      }
    });

    // Set up Claude event forwarding
    if (claudeManager) {
      claudeManager.on('chunk', (chunk) => {
        this.postMessage({ type: 'chunk', data: chunk });
      });

      claudeManager.on('message', (message) => {
        this.postMessage({ type: 'message', data: message });
      });

      claudeManager.on('tool:start', (toolCall) => {
        this.postMessage({ type: 'toolStart', data: toolCall });
      });

      claudeManager.on('error', (error) => {
        this.postMessage({ type: 'error', data: error.message });
      });
    }

    // Set up checkpoint event forwarding
    if (checkpointManager) {
      checkpointManager.on('checkpoint:created', (checkpoint) => {
        this.postMessage({ type: 'checkpointCreated', data: checkpoint });
        this.sendCheckpoints();
      });

      checkpointManager.on('checkpoint:restored', (checkpoint) => {
        this.postMessage({ type: 'checkpointRestored', data: checkpoint });
        this.sendCheckpoints();
      });
    }

    // Send initial state
    this.sendCheckpoints();
  }

  private postMessage(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private async handleSendMessage(content: string) {
    if (!claudeManager) {
      this.postMessage({ type: 'error', data: 'Claude not initialized' });
      return;
    }

    try {
      await claudeManager.spawn();
      await claudeManager.sendMessage(content);
    } catch (error) {
      this.postMessage({ type: 'error', data: String(error) });
    }
  }

  private async handleCreateCheckpoint(title?: string, description?: string) {
    if (!checkpointManager) return;

    try {
      const checkpoint = await checkpointManager.createCheckpoint(title, description);
      this.postMessage({ type: 'checkpointCreated', data: checkpoint });
    } catch (error) {
      this.postMessage({ type: 'error', data: String(error) });
    }
  }

  private async handleRestoreCheckpoint(checkpointId: string) {
    if (!checkpointManager) return;

    try {
      await checkpointManager.restoreCheckpoint(checkpointId);
    } catch (error) {
      this.postMessage({ type: 'error', data: String(error) });
    }
  }

  private async handleNavigateForward() {
    if (!checkpointManager) return;

    try {
      await checkpointManager.navigateForward();
    } catch (error) {
      this.postMessage({ type: 'error', data: String(error) });
    }
  }

  private async handleNavigateBack() {
    if (!checkpointManager) return;

    try {
      await checkpointManager.navigateBack();
    } catch (error) {
      this.postMessage({ type: 'error', data: String(error) });
    }
  }

  private async sendCheckpoints() {
    if (!checkpointManager) return;

    this.postMessage({
      type: 'checkpoints',
      data: {
        groups: checkpointManager.getGroupedCheckpoints(),
        current: checkpointManager.current,
        canGoForward: checkpointManager.canGoForward,
        canGoBack: checkpointManager.canGoBack,
      },
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Agent</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header h1 {
      font-size: 14px;
      font-weight: 600;
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .message {
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      max-width: 90%;
    }
    .message.user {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      margin-left: auto;
    }
    .message.assistant {
      background: var(--vscode-editor-inactiveSelectionBackground);
    }
    .input-area {
      padding: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .input-wrapper {
      display: flex;
      gap: 8px;
    }
    textarea {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 6px;
      resize: none;
      font-family: inherit;
      font-size: inherit;
    }
    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .checkpoints {
      border-top: 1px solid var(--vscode-panel-border);
      max-height: 200px;
      overflow-y: auto;
    }
    .checkpoint-header {
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      position: sticky;
      top: 0;
    }
    .checkpoint-item {
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkpoint-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .checkpoint-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .checkpoint-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
    }
    .checkpoint-dot.current {
      background: var(--vscode-button-background);
    }
    .nav-buttons {
      display: flex;
      gap: 4px;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .nav-buttons button {
      flex: 1;
      padding: 6px;
      font-size: 12px;
    }
    .streaming {
      opacity: 0.7;
    }
    .streaming::after {
      content: '▋';
      animation: blink 1s infinite;
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Claude Agent</h1>
  </div>

  <div class="messages" id="messages"></div>

  <div class="checkpoints" id="checkpoints"></div>

  <div class="nav-buttons">
    <button id="backBtn" disabled>← Back</button>
    <button id="forwardBtn" disabled>Forward →</button>
  </div>

  <div class="input-area">
    <div class="input-wrapper">
      <textarea id="input" rows="2" placeholder="Message Claude..."></textarea>
      <button id="sendBtn">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const checkpointsEl = document.getElementById('checkpoints');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const backBtn = document.getElementById('backBtn');
    const forwardBtn = document.getElementById('forwardBtn');

    let isStreaming = false;
    let streamingContent = '';

    // Request initial checkpoints
    vscode.postMessage({ type: 'getCheckpoints' });

    // Send message
    sendBtn.addEventListener('click', () => {
      const content = inputEl.value.trim();
      if (!content || isStreaming) return;

      addMessage('user', content);
      vscode.postMessage({ type: 'sendMessage', content });
      inputEl.value = '';
      isStreaming = true;
      updateUI();
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Navigation
    backBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'navigateBack' });
    });

    forwardBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'navigateForward' });
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const { type, data } = event.data;

      switch (type) {
        case 'chunk':
          if (data.type === 'text') {
            streamingContent += data.content;
            updateStreamingMessage();
          }
          break;
        case 'message':
          isStreaming = false;
          streamingContent = '';
          addMessage('assistant', data.content);
          updateUI();
          break;
        case 'error':
          isStreaming = false;
          streamingContent = '';
          addMessage('assistant', 'Error: ' + data);
          updateUI();
          break;
        case 'checkpoints':
          renderCheckpoints(data);
          break;
        case 'checkpointCreated':
        case 'checkpointRestored':
          vscode.postMessage({ type: 'getCheckpoints' });
          break;
      }
    });

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = content;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function updateStreamingMessage() {
      let streamingEl = messagesEl.querySelector('.streaming-message');
      if (!streamingEl) {
        streamingEl = document.createElement('div');
        streamingEl.className = 'message assistant streaming-message streaming';
        messagesEl.appendChild(streamingEl);
      }
      streamingEl.textContent = streamingContent;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderCheckpoints(data) {
      checkpointsEl.innerHTML = '';

      data.groups.forEach(group => {
        const header = document.createElement('div');
        header.className = 'checkpoint-header';
        header.textContent = group.label;
        checkpointsEl.appendChild(header);

        group.checkpoints.forEach(cp => {
          const item = document.createElement('div');
          item.className = 'checkpoint-item' + (cp.id === data.current?.id ? ' active' : '');
          item.innerHTML = \`
            <div class="checkpoint-dot \${cp.id === data.current?.id ? 'current' : ''}"></div>
            <span>\${cp.title}</span>
          \`;
          item.addEventListener('click', () => {
            vscode.postMessage({ type: 'restoreCheckpoint', checkpointId: cp.id });
          });
          checkpointsEl.appendChild(item);
        });
      });

      backBtn.disabled = !data.canGoBack;
      forwardBtn.disabled = !data.canGoForward;
    }

    function updateUI() {
      sendBtn.disabled = isStreaming;
      inputEl.disabled = isStreaming;
    }
  </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
