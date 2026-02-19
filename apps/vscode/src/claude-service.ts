import { ClaudeCodeManager, CheckpointManager } from '@claude-agent/core';
import * as fs from 'fs';
import * as path from 'path';

export class ClaudeService {
  private claudeManager: ClaudeCodeManager | null = null;
  private checkpointManager: CheckpointManager | null = null;
  private claudeSessionIds = new Map<string, string>();
  private currentChatSessionId: string | null = null;
  private postMessage: (msg: any) => void;

  constructor(
    private workingDir: string,
    postMessage: (msg: any) => void
  ) {
    this.postMessage = postMessage;
  }

  async initialize() {
    try {
      this.checkpointManager = new CheckpointManager({ workingDir: this.workingDir });
      await this.checkpointManager.initialize();

      this.claudeManager = new ClaudeCodeManager({
        config: { workingDir: this.workingDir },
      });

      this.setupEventForwarding();
      console.log('[ClaudeService] Initialized for:', this.workingDir);
    } catch (error) {
      console.error('[ClaudeService] Init failed:', error);
    }
  }

  private setupEventForwarding() {
    if (this.claudeManager) {
      this.claudeManager.on('chunk', (chunk) => {
        this.postMessage({ type: 'claude:chunk', data: chunk });
      });

      this.claudeManager.on('message', (message) => {
        this.postMessage({ type: 'claude:message', data: message });
      });

      this.claudeManager.on('tool:start', (toolCall) => {
        this.postMessage({ type: 'claude:tool-start', data: toolCall });
      });

      this.claudeManager.on('error', (error) => {
        this.postMessage({ type: 'claude:error', data: error.message || String(error) });
      });
    }

    if (this.checkpointManager) {
      this.checkpointManager.on('checkpoint:created', (checkpoint) => {
        this.postMessage({ type: 'checkpoint:created', data: checkpoint });
      });

      this.checkpointManager.on('checkpoint:restored', (checkpoint) => {
        this.postMessage({ type: 'checkpoint:restored', data: checkpoint });
      });
    }
  }

  async startClaude(chatSessionId?: string): Promise<boolean> {
    if (!this.claudeManager) return false;
    try {
      if (chatSessionId) {
        this.currentChatSessionId = chatSessionId;
      }
      if (!this.claudeManager.running) {
        await this.claudeManager.spawn();
      }
      return true;
    } catch (error) {
      console.error('[ClaudeService] Start failed:', error);
      return false;
    }
  }

  async sendMessage(content: string, options?: { extraFlags?: string[]; model?: string }): Promise<boolean> {
    if (!this.claudeManager) return false;
    try {
      if (!this.claudeManager.running) {
        await this.claudeManager.spawn();
      }
      await this.claudeManager.sendMessage(content, options);
      return true;
    } catch (error) {
      console.error('[ClaudeService] Send failed:', error);
      return false;
    }
  }

  async setModel(model: string): Promise<boolean> {
    // Model setting is passed through extraFlags on next message
    return true;
  }

  async interrupt(): Promise<void> {
    if (this.claudeManager?.running) {
      this.claudeManager.terminate();
    }
  }

  async createCheckpoint(
    title?: string,
    description?: string,
    messages?: any[],
    options?: { skipIfEmpty?: boolean }
  ): Promise<any> {
    if (!this.checkpointManager) return null;
    try {
      return await this.checkpointManager.createCheckpoint(title, description, messages, options);
    } catch (error) {
      console.error('[ClaudeService] Checkpoint create failed:', error);
      return null;
    }
  }

  async snapshotDirtyFiles(): Promise<void> {
    if (!this.checkpointManager) return;
    try {
      await this.checkpointManager.snapshotDirtyFiles();
    } catch (error) {
      console.error('[ClaudeService] Snapshot failed:', error);
    }
  }

  async getCurrentGitHead(): Promise<string> {
    if (!this.checkpointManager) return '';
    try {
      return await this.checkpointManager.getCurrentHead() || '';
    } catch {
      return '';
    }
  }

  async getCurrentGitBranch(): Promise<string> {
    if (!this.checkpointManager) return '';
    try {
      return await this.checkpointManager.getCurrentBranch() || '';
    } catch {
      return '';
    }
  }

  async resetGitToCommit(hash: string): Promise<void> {
    if (!this.checkpointManager) return;
    await this.checkpointManager.resetToCommit(hash);
  }

  async reattachBranch(): Promise<boolean> {
    if (!this.checkpointManager) return false;
    try {
      return await this.checkpointManager.reattachBranch();
    } catch {
      return false;
    }
  }

  async listGitBranches(): Promise<any[]> {
    if (!this.checkpointManager) return [];
    try {
      return await this.checkpointManager.listAllBranches();
    } catch {
      return [];
    }
  }

  async listGitCommits(maxCount?: number): Promise<any[]> {
    if (!this.checkpointManager) return [];
    try {
      return await this.checkpointManager.listBranchCommits(maxCount);
    } catch {
      return [];
    }
  }

  async checkoutGitCommit(hash: string): Promise<void> {
    if (!this.checkpointManager) return;
    await this.checkpointManager.checkoutCommit(hash);
  }

  async getGitCommitDiff(hash: string): Promise<string> {
    if (!this.checkpointManager) return '';
    try {
      return await this.checkpointManager.getCommitDiff(hash);
    } catch {
      return '';
    }
  }

  async switchGitBranch(branchName: string): Promise<void> {
    if (!this.checkpointManager) return;
    await this.checkpointManager.switchToBranch(branchName);
  }

  async createGitBranch(name: string): Promise<void> {
    if (!this.checkpointManager) return;
    await this.checkpointManager.createSession(name);
  }

  async pushToRemote(): Promise<void> {
    if (!this.checkpointManager) return;
    const { execSync } = require('child_process');
    const branch = await this.getCurrentGitBranch();
    try {
      execSync('git push', { cwd: this.workingDir, stdio: 'pipe' });
    } catch {
      // No upstream — set it automatically
      if (branch) {
        execSync(`git push --set-upstream origin ${branch}`, { cwd: this.workingDir, stdio: 'pipe' });
      } else {
        throw new Error('No branch to push');
      }
    }
  }

  async switchChatSession(chatSessionId: string): Promise<void> {
    if (!this.claudeManager) return;
    this.currentChatSessionId = chatSessionId;

    if (this.claudeManager.running) {
      this.claudeManager.terminate();
    }
    await this.startClaude(chatSessionId);
  }

  async readFile(filePath: string): Promise<string | null> {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.workingDir, filePath);
      return fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async getFileTree(): Promise<any> {
    try {
      return scanDirectory(this.workingDir);
    } catch {
      return null;
    }
  }

  dispose() {
    if (this.claudeManager) {
      this.claudeManager.terminate();
    }
  }
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.claude-agent', 'dist', 'build',
  '.next', '.cache', '__pycache__', '.venv', 'venv', '.tox',
  '.mypy_cache', '.pytest_cache', 'coverage', '.turbo',
]);

function scanDirectory(dirPath: string, depth = 0): any {
  if (depth > 5) return null;

  const name = path.basename(dirPath);
  const node: any = {
    name,
    path: dirPath,
    type: 'directory',
    children: [],
  };

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      if (entry.isDirectory()) {
        const child = scanDirectory(path.join(dirPath, entry.name), depth + 1);
        if (child) node.children.push(child);
      } else {
        node.children.push({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: 'file',
        });
      }
    }
    node.children.sort((a: any, b: any) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    // Permission denied or similar
  }

  return node;
}
