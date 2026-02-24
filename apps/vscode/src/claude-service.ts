import { ClaudeCodeManager, CheckpointManager } from '@claude-agent/core';
import * as fs from 'fs';
import * as path from 'path';

interface FileSnapshot {
  content: string | null; // null = file didn't exist
}

interface FileCheckpoint {
  messageId: string;
  timestamp: number;
  files: Map<string, FileSnapshot>;
}

export class ClaudeService {
  private claudeManager: ClaudeCodeManager | null = null;
  private checkpointManager: CheckpointManager | null = null;
  private claudeSessionIds = new Map<string, string>();
  private currentChatSessionId: string | null = null;
  private postMessage: (msg: any) => void;

  // File-based checkpoint system (no git)
  private fileCheckpoints = new Map<string, FileCheckpoint>();
  private allTrackedFiles = new Set<string>();
  private pendingFileSnapshots = new Map<string, FileSnapshot>(); // pre-modification snapshots for current turn
  private filesModifiedThisTurn = false; // tracks if the current turn actually modified files

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
        if (chunk.type === 'init' && chunk.sessionId && this.currentChatSessionId) {
          this.claudeSessionIds.set(this.currentChatSessionId, chunk.sessionId);
        }

        // Track file modifications from tool calls — snapshot BEFORE modification
        if (chunk.type === 'tool_call' && chunk.toolCall) {
          const toolName = chunk.toolCall.name?.toLowerCase();
          const input = chunk.toolCall.input || {};
          if ((toolName === 'edit' || toolName === 'write') && input.file_path) {
            this.filesModifiedThisTurn = true;
            this.snapshotFileBeforeModification(String(input.file_path));
          }
        }

        this.postMessage({ type: 'claude:chunk', data: chunk });
      });

      this.claudeManager.on('message', (message) => {
        this.postMessage({ type: 'claude:message', data: message });
      });

      this.claudeManager.on('tool:start', (toolCall) => {
        this.postMessage({ type: 'claude:tool-start', data: toolCall });
      });

      // Backup file tracking via tool:complete — input is guaranteed complete here
      this.claudeManager.on('tool:complete', (toolCall, _result) => {
        const toolName = toolCall.name?.toLowerCase();
        const input = toolCall.input || {};
        if ((toolName === 'edit' || toolName === 'write') && input.file_path) {
          this.filesModifiedThisTurn = true;
          const filePath = this.resolveFilePath(String(input.file_path));
          this.allTrackedFiles.add(filePath);
          // If we missed the pre-modification snapshot (input was empty during tool_call),
          // at least track the file. The file is already modified at this point.
          if (!this.pendingFileSnapshots.has(filePath)) {
            console.warn(`[Checkpoint] Missed pre-modification snapshot for ${filePath}, tracking post-modification state`);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              this.pendingFileSnapshots.set(filePath, { content });
            } catch {
              this.pendingFileSnapshots.set(filePath, { content: null });
            }
          }
        }
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

  async startClaude(chatSessionId?: string, claudeSessionId?: string): Promise<boolean> {
    if (!this.claudeManager) return false;
    try {
      if (chatSessionId) {
        this.currentChatSessionId = chatSessionId;
      }
      if (claudeSessionId) {
        this.claudeManager.setSessionId(claudeSessionId);
        if (chatSessionId) {
          this.claudeSessionIds.set(chatSessionId, claudeSessionId);
        }
      } else if (chatSessionId && this.claudeSessionIds.has(chatSessionId)) {
        this.claudeManager.setSessionId(this.claudeSessionIds.get(chatSessionId)!);
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

  async getGitStatus(): Promise<any> {
    if (!this.checkpointManager) return { files: [], staged: 0, unstaged: 0, untracked: 0, isClean: true };
    try {
      return await this.checkpointManager.getWorkingTreeStatus();
    } catch {
      return { files: [], staged: 0, unstaged: 0, untracked: 0, isClean: true };
    }
  }

  async gitCommitAll(message: string): Promise<string> {
    if (!this.checkpointManager) return '';
    return await this.checkpointManager.commitAll(message);
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

  async switchChatSession(chatSessionId: string, claudeSessionId?: string): Promise<void> {
    if (!this.claudeManager) return;
    this.currentChatSessionId = chatSessionId;

    if (this.claudeManager.running) {
      this.claudeManager.terminate();
    }
    await this.startClaude(chatSessionId, claudeSessionId);
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

  // --- File-based checkpoint system ---
  // Each checkpoint stores the CURRENT state of all tracked files at creation time.
  // Checkpoint N = state after assistant turn N completed.
  // Restoring to "before turn N" = restoring checkpoint N-1.
  // "initial" checkpoint = state before any agent modifications.

  private resolveFilePath(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.join(this.workingDir, filePath);
  }

  /** Snapshot a file's current content BEFORE it gets modified by a tool call */
  private snapshotFileBeforeModification(filePath: string): void {
    const absolute = this.resolveFilePath(filePath);
    this.allTrackedFiles.add(absolute);

    // Only snapshot once per turn (first modification wins)
    if (this.pendingFileSnapshots.has(absolute)) return;

    try {
      const content = fs.readFileSync(absolute, 'utf-8');
      this.pendingFileSnapshots.set(absolute, { content });
    } catch {
      // File doesn't exist yet — record that
      this.pendingFileSnapshots.set(absolute, { content: null });
    }

    // Create the "initial" checkpoint if this is the very first file modification
    if (!this.fileCheckpoints.has('initial')) {
      console.log('[Checkpoint] Creating initial checkpoint (pre-conversation state)');
      const initialFiles = new Map<string, FileSnapshot>();
      // Store the pre-modification state of this first file
      const snap = this.pendingFileSnapshots.get(absolute);
      if (snap) {
        initialFiles.set(absolute, snap);
      }
      this.fileCheckpoints.set('initial', {
        messageId: 'initial',
        timestamp: Date.now() - 1, // Slightly before any real checkpoints
        files: initialFiles,
      });
    } else {
      // Update the initial checkpoint with pre-modification state of any newly tracked file
      const initial = this.fileCheckpoints.get('initial')!;
      if (!initial.files.has(absolute)) {
        const snap = this.pendingFileSnapshots.get(absolute);
        if (snap) {
          initial.files.set(absolute, snap);
        }
      }
    }
  }

  /**
   * Create a checkpoint after an assistant response.
   * Only creates if files were actually modified this turn.
   * Returns true if checkpoint was created, false if skipped.
   */
  async createFileCheckpoint(messageId: string): Promise<boolean> {
    // Skip checkpoint creation if no files were modified this turn
    if (!this.filesModifiedThisTurn) {
      console.log(`[Checkpoint] Skipping checkpoint "${messageId}" — no files modified`);
      this.pendingFileSnapshots.clear();
      this.filesModifiedThisTurn = false;
      return false;
    }

    const files = new Map<string, FileSnapshot>();

    // Read current state of ALL tracked files
    for (const filePath of this.allTrackedFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        files.set(filePath, { content });
      } catch {
        files.set(filePath, { content: null });
      }
    }

    this.fileCheckpoints.set(messageId, {
      messageId,
      timestamp: Date.now(),
      files,
    });

    console.log(`[Checkpoint] Created checkpoint "${messageId}" with ${files.size} files`);

    // Clear pending snapshots for next turn
    this.pendingFileSnapshots.clear();
    this.filesModifiedThisTurn = false;
    return true;
  }

  /** Restore files to the state captured at a checkpoint */
  async restoreFileCheckpoint(messageId: string): Promise<boolean> {
    const checkpoint = this.fileCheckpoints.get(messageId);
    if (!checkpoint) {
      console.error(`[Checkpoint] No checkpoint found for "${messageId}"`);
      return false;
    }

    console.log(`[Checkpoint] Restoring checkpoint "${messageId}" (${checkpoint.files.size} files)`);

    let restoredCount = 0;
    for (const [filePath, snapshot] of checkpoint.files) {
      try {
        if (snapshot.content === null) {
          // File didn't exist at checkpoint time — delete it if it exists now
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            restoredCount++;
          }
        } else {
          // Restore file content
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, snapshot.content, 'utf-8');
          restoredCount++;
        }
      } catch (err) {
        console.error(`[Checkpoint] Failed to restore ${filePath}:`, err);
      }
    }

    console.log(`[Checkpoint] Restored ${restoredCount} files`);

    // Keep all checkpoints (don't delete future ones) — allows forward navigation
    return true;
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
