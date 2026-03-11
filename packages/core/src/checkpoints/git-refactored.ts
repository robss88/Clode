import { nanoid } from 'nanoid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitClient } from '../git/GitClient';
import type { Checkpoint, FileChange, Message, ICheckpointTree, Session, GitBranch, GitCommit, GitStatus } from '../types';

const CLAUDE_AGENT_DIR = '.claude-agent';
const CHECKPOINTS_FILE = 'checkpoints.json';
const SESSIONS_FILE = 'sessions.json';
const BRANCH_PREFIX = 'claude-session/';

export interface GitCheckpointStorageOptions {
  workingDir: string;
}

/**
 * GitCheckpointStorage - Handles checkpoint persistence using Git
 * Now uses GitClient for all git operations, focusing only on checkpoint logic
 *
 * Simplified model:
 * - Session = Branch (one branch per chat session)
 * - Checkpoint = Commit on that branch
 * - Restore = checkout commit (stay on same branch)
 */
export class GitCheckpointStorage {
  private gitClient: GitClient;
  private workingDir: string;
  private initialized = false;
  private currentSession: Session | null = null;
  private trackedBranch: string | null = null;
  private dirtyFilesSnapshot: Set<string> | null = null;

  constructor(options: GitCheckpointStorageOptions) {
    this.workingDir = options.workingDir;
    this.gitClient = new GitClient(this.workingDir);
  }

  get session(): Session | null {
    return this.currentSession;
  }

  /**
   * Initialize git storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Check if it's a git repo
    const isRepo = await this.gitClient.isRepository();
    if (!isRepo) {
      await this.gitClient.init();
      // Make initial commit
      await this.gitClient.commit('Initial commit', { '--allow-empty': null });
    }

    // Create .claude-agent directory
    const agentDir = path.join(this.workingDir, CLAUDE_AGENT_DIR);
    await fs.mkdir(agentDir, { recursive: true });

    // Add .claude-agent to .gitignore if not already there
    await this.ensureGitignore();

    this.initialized = true;
  }

  /**
   * Ensure .claude-agent is in .gitignore
   */
  private async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workingDir, '.gitignore');

    try {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      if (!content.includes(CLAUDE_AGENT_DIR)) {
        await fs.appendFile(gitignorePath, `\n${CLAUDE_AGENT_DIR}\n`);
      }
    } catch {
      await fs.writeFile(gitignorePath, `${CLAUDE_AGENT_DIR}\n`);
    }
  }

  /**
   * List all sessions (branches)
   */
  async listSessions(): Promise<Session[]> {
    await this.initialize();

    const sessionsPath = path.join(this.workingDir, CLAUDE_AGENT_DIR, SESSIONS_FILE);
    try {
      const content = await fs.readFile(sessionsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Save session metadata
   */
  private async saveSession(session: Session): Promise<void> {
    const sessions = await this.listSessions();
    const index = sessions.findIndex(s => s.id === session.id);

    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    const sessionsPath = path.join(this.workingDir, CLAUDE_AGENT_DIR, SESSIONS_FILE);
    await fs.writeFile(sessionsPath, JSON.stringify(sessions, null, 2));
  }

  /**
   * Update session metadata
   */
  private async updateSession(session: Session): Promise<void> {
    await this.saveSession(session);
  }

  /**
   * Ensure a session exists for the current branch
   */
  async ensureSession(): Promise<Session> {
    if (this.currentSession) return this.currentSession;

    await this.initialize();

    const branchName = await this.gitClient.getCurrentBranch();

    const session: Session = {
      id: nanoid(8),
      name: branchName,
      branch: branchName,
      projectPath: this.workingDir,
      createdAt: Date.now(),
      lastActive: Date.now(),
      checkpointIds: [],
      isActive: true,
    };

    this.currentSession = session;
    await this.saveSession(session);

    return session;
  }

  /**
   * Create a new session (branch)
   */
  async createSession(name: string): Promise<Session> {
    await this.initialize();

    const branchName = `${BRANCH_PREFIX}${name.toLowerCase().replace(/\s+/g, '-')}`;

    // Create and checkout new branch
    await this.gitClient.createBranch(branchName);

    const session: Session = {
      id: nanoid(8),
      name,
      branch: branchName,
      projectPath: this.workingDir,
      createdAt: Date.now(),
      lastActive: Date.now(),
      checkpointIds: [],
      isActive: true,
    };

    this.currentSession = session;
    await this.saveSession(session);

    return session;
  }

  /**
   * Switch to a session (branch)
   */
  async switchSession(sessionId: string): Promise<void> {
    const sessions = await this.listSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Stash current changes if any
    if (!(await this.gitClient.isClean())) {
      await this.gitClient.stash(`Switching to session ${session.name}`);
    }

    // Switch branch
    await this.gitClient.switchBranch(session.branch);

    this.currentSession = session;
    session.lastActive = Date.now();
    await this.updateSession(session);
  }

  /**
   * Snapshot dirty files before Claude runs
   */
  async snapshotDirtyFiles(): Promise<void> {
    const status = await this.gitClient.status();
    const paths = new Set<string>();

    for (const f of status.modified) paths.add(f);
    for (const f of status.created) paths.add(f);
    for (const f of status.deleted) paths.add(f);
    for (const r of status.renamed) {
      paths.add(r.from);
      paths.add(r.to);
    }

    this.dirtyFilesSnapshot = paths;
  }

  /**
   * Clear the dirty files snapshot
   */
  private clearDirtyFilesSnapshot(): void {
    this.dirtyFilesSnapshot = null;
  }

  /**
   * Convert status to file changes
   */
  private statusToFileChanges(fileStatuses: Array<{ path: string; status: string }>): FileChange[] {
    return fileStatuses.map(fs => ({
      path: fs.path,
      type: fs.status === 'added' ? 'created' :
            fs.status === 'deleted' ? 'deleted' : 'modified',
      diff: '',
    }));
  }

  /**
   * Create a checkpoint (commit)
   */
  async createCheckpoint(
    title: string,
    description: string,
    messages: Message[],
    parentId: string | null,
    options?: { skipIfEmpty?: boolean }
  ): Promise<Checkpoint | null> {
    await this.initialize();

    if (!this.currentSession) {
      throw new Error('No active session. Create or switch to a session first.');
    }

    // Get current changes
    const status = await this.gitClient.status();
    const fileStatuses = this.gitClient.statusToFileStatus(status);
    let filesChanged = this.statusToFileChanges(fileStatuses);

    // When skipIfEmpty + snapshot: only commit files Claude actually changed
    if (options?.skipIfEmpty && this.dirtyFilesSnapshot) {
      const newChanges = filesChanged.filter((fc) => !this.dirtyFilesSnapshot!.has(fc.path));
      filesChanged = newChanges;
      this.clearDirtyFilesSnapshot();

      if (filesChanged.length === 0) {
        return null;
      }

      // Stage only new changes
      const pathsToAdd = filesChanged.map((fc) => fc.path);
      await this.gitClient.add(pathsToAdd);
    } else {
      // Skip checkpoint if no files changed and skipIfEmpty is set
      if (options?.skipIfEmpty && filesChanged.length === 0) {
        return null;
      }

      // Stage all changes
      if (filesChanged.length > 0) {
        await this.gitClient.addAll();
      }
    }

    const currentBranch = await this.gitClient.getCurrentBranch();

    // Create checkpoint metadata
    const checkpoint: Checkpoint = {
      id: nanoid(),
      parentId,
      childIds: [],
      timestamp: Date.now(),
      title,
      description,
      filesChanged,
      conversationSnapshot: messages,
      metadata: {
        branch: currentBranch,
        commitSha: '',
        isActive: true,
        autoGenerated: !title,
      },
    };

    // Commit
    const commitMessage = this.formatCommitMessage(checkpoint);
    const result = await this.gitClient.commit(commitMessage, { '--allow-empty': null });
    checkpoint.metadata.commitSha = result.commit || '';

    // Save checkpoint metadata
    await this.saveCheckpointMetadata(checkpoint);

    // Update session with this checkpoint
    this.currentSession.checkpointIds.push(checkpoint.id);
    this.currentSession.lastActive = Date.now();
    await this.updateSession(this.currentSession);

    return checkpoint;
  }

  /**
   * Restore to a checkpoint
   */
  async restoreCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.initialize();

    if (!checkpoint.metadata.commitSha) {
      throw new Error('Checkpoint has no commit SHA');
    }

    // Stash current changes if any
    if (!(await this.gitClient.isClean())) {
      await this.gitClient.stash(`Before restore to ${checkpoint.id}`);
    }

    // Reset to the checkpoint commit
    await this.gitClient.reset(checkpoint.metadata.commitSha, 'hard');

    // Update checkpoint as active
    await this.updateCheckpointActive(checkpoint.id);
  }

  /**
   * Get diff for a checkpoint
   */
  async getCheckpointDiff(checkpointId: string): Promise<string> {
    const metadata = await this.loadCheckpointMetadata();
    const checkpoint = metadata.nodes[checkpointId];

    if (!checkpoint) {
      throw new Error('Checkpoint not found');
    }

    const commitSha = checkpoint.metadata.commitSha;
    if (!commitSha) {
      return '';
    }

    if (checkpoint.parentId) {
      const parent = metadata.nodes[checkpoint.parentId];
      if (parent?.metadata.commitSha) {
        return this.gitClient.diff(parent.metadata.commitSha, commitSha);
      }
    }

    return this.gitClient.getCommitDiff(commitSha);
  }

  // ========================================================================
  // Git-native methods (delegated to GitClient)
  // ========================================================================

  async listAllBranches(): Promise<GitBranch[]> {
    await this.initialize();
    return this.gitClient.listBranchesSorted();
  }

  async listCommits(limit = 50): Promise<GitCommit[]> {
    await this.initialize();
    return this.gitClient.listCommits(limit);
  }

  async getCurrentBranch(): Promise<string> {
    return this.gitClient.getCurrentBranch();
  }

  async getCurrentHead(): Promise<string> {
    return this.gitClient.getCurrentHead();
  }

  async switchBranch(name: string): Promise<void> {
    await this.initialize();
    await this.gitClient.switchBranch(name);
  }

  async createBranch(name: string): Promise<void> {
    await this.initialize();
    await this.gitClient.createBranch(name);
  }

  async checkoutCommit(hash: string): Promise<void> {
    await this.initialize();
    await this.gitClient.checkoutCommit(hash);
  }

  async resetToCommit(hash: string): Promise<void> {
    await this.initialize();
    await this.gitClient.reset(hash);
  }

  async reattachBranch(): Promise<boolean> {
    if (!this.trackedBranch) return false;
    await this.gitClient.reattachBranch(this.trackedBranch);
    this.trackedBranch = null;
    return true;
  }

  async pushToRemote(): Promise<void> {
    await this.gitClient.push();
  }

  async getGitStatus(): Promise<GitStatus> {
    return this.gitClient.getStatus();
  }

  async gitCommitAll(message: string): Promise<string> {
    await this.gitClient.addAll();
    const result = await this.gitClient.commit(message);
    return result.commit || '';
  }

  // ========================================================================
  // Helper methods (kept from original implementation)
  // ========================================================================

  private formatCommitMessage(checkpoint: Checkpoint): string {
    const lines = [`[Checkpoint] ${checkpoint.title}`];
    if (checkpoint.description) {
      lines.push('', checkpoint.description);
    }
    if (checkpoint.filesChanged.length > 0) {
      lines.push('', 'Files changed:');
      for (const fc of checkpoint.filesChanged) {
        lines.push(`  - ${fc.path} (${fc.type})`);
      }
    }
    lines.push('', `ID: ${checkpoint.id}`);
    return lines.join('\n');
  }

  private async saveCheckpointMetadata(checkpoint: Checkpoint): Promise<void> {
    const metadata = await this.loadCheckpointMetadata();
    metadata.nodes[checkpoint.id] = checkpoint;
    metadata.root = metadata.root || checkpoint.id;

    const metadataPath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async loadCheckpointMetadata(): Promise<ICheckpointTree> {
    const metadataPath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { root: null, nodes: {} };
    }
  }

  private async updateCheckpointActive(checkpointId: string): Promise<void> {
    const metadata = await this.loadCheckpointMetadata();

    // Mark all as inactive
    for (const cp of Object.values(metadata.nodes)) {
      cp.metadata.isActive = false;
    }

    // Mark this one as active
    if (metadata.nodes[checkpointId]) {
      metadata.nodes[checkpointId].metadata.isActive = true;
    }

    const metadataPath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
}