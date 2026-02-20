import * as vscode from 'vscode';
import { ClaudeService } from './claude-service';

export class MessageHandler {
  constructor(
    private service: ClaudeService,
    private postMessage: (msg: any) => void
  ) {}

  async handle(msg: { type: string; data?: any; requestId?: string }) {
    const { type, data, requestId } = msg;

    try {
      let result: any;

      switch (type) {
        // Claude operations
        case 'claude:start':
          // Fire-and-forget — respond immediately, errors come via events
          this.service.startClaude(data?.chatSessionId).catch((err) => {
            this.postMessage({ type: 'claude:error', data: String(err) });
          });
          result = true;
          break;

        case 'claude:send':
          // Fire-and-forget — streaming results come through broadcast events
          this.service.sendMessage(data?.content, data?.options).catch((err) => {
            this.postMessage({ type: 'claude:error', data: String(err) });
          });
          result = true;
          break;

        case 'claude:set-model':
          result = await this.service.setModel(data?.model);
          break;

        case 'claude:interrupt':
          await this.service.interrupt();
          result = true;
          break;

        // Checkpoint operations
        case 'checkpoint:create':
          result = await this.service.createCheckpoint(
            data?.title,
            data?.description,
            data?.messages,
            data?.options
          );
          break;

        case 'checkpoint:snapshot-dirty':
          await this.service.snapshotDirtyFiles();
          result = true;
          break;

        // Git operations
        case 'git:current-head':
          result = await this.service.getCurrentGitHead();
          break;

        case 'git:current-branch':
          result = await this.service.getCurrentGitBranch();
          break;

        case 'git:reset-to-commit':
          await this.service.resetGitToCommit(data?.hash);
          result = true;
          break;

        case 'git:reattach-branch':
          result = await this.service.reattachBranch();
          break;

        case 'git:list-branches':
          result = await this.service.listGitBranches();
          break;

        case 'git:list-commits':
          result = await this.service.listGitCommits(data?.maxCount);
          break;

        case 'git:checkout-commit':
          await this.service.checkoutGitCommit(data?.hash);
          result = true;
          break;

        case 'git:commit-diff':
          result = await this.service.getGitCommitDiff(data?.hash);
          break;

        case 'git:switch-branch':
          await this.service.switchGitBranch(data?.branchName);
          result = true;
          break;

        case 'git:create-branch':
          await this.service.createGitBranch(data?.name);
          result = true;
          break;

        case 'git:push':
          await this.service.pushToRemote();
          result = true;
          break;

        case 'git:status':
          result = await this.service.getGitStatus();
          break;

        case 'git:commit-all':
          result = await this.service.gitCommitAll(data?.message);
          break;

        // Chat session
        case 'chat:switch':
          await this.service.switchChatSession(data?.chatSessionId);
          result = true;
          break;

        // File operations
        case 'file:read':
          result = await this.service.readFile(data?.path);
          break;

        case 'file:tree':
          result = await this.service.getFileTree();
          break;

        case 'file:open':
          if (data?.path) {
            const uri = vscode.Uri.file(data.path);
            await vscode.window.showTextDocument(uri, { preview: true });
          }
          result = true;
          break;

        default:
          console.warn('[MessageHandler] Unknown message type:', type);
          result = null;
      }

      // Send response back to webview
      if (requestId) {
        this.postMessage({ type, requestId, data: result });
      }
    } catch (error) {
      console.error(`[MessageHandler] Error handling ${type}:`, error);
      if (requestId) {
        this.postMessage({
          type,
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
