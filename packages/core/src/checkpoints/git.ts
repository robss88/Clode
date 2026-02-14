import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { nanoid } from 'nanoid';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Checkpoint, FileChange, Message, ICheckpointTree, Session, GitBranch, GitCommit } from '../types';

const CLAUDE_AGENT_DIR = '.claude-agent';
const CHECKPOINTS_FILE = 'checkpoints.json';
const SESSIONS_FILE = 'sessions.json';
const BRANCH_PREFIX = 'claude-session/';

export interface GitCheckpointStorageOptions {
  workingDir: string;
}

/**
 * GitCheckpointStorage - Handles git operations for checkpoint persistence
 *
 * Simplified model:
 * - Session = Branch (one branch per chat session)
 * - Checkpoint = Commit on that branch
 * - Restore = checkout commit (stay on same branch)
 */
export class GitCheckpointStorage {
  private git: SimpleGit;
  private workingDir: string;
  private initialized = false;
  private currentSession: Session | null = null;
  private trackedBranch: string | null = null; // Branch we detached from
  private dirtyFilesSnapshot: Set<string> | null = null; // Files dirty BEFORE Claude runs

  constructor(options: GitCheckpointStorageOptions) {
    this.workingDir = options.workingDir;
    this.git = simpleGit(this.workingDir);
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
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      await this.git.init();
      // Make initial commit
      await this.git.commit('Initial commit', { '--allow-empty': null });
    }

    // Create .claude-agent directory
    const agentDir = path.join(this.workingDir, CLAUDE_AGENT_DIR);
    await fs.mkdir(agentDir, { recursive: true });

    // Add .claude-agent to .gitignore if not already there
    await this.ensureGitignore();

    this.initialized = true;
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
   * Ensure a session exists for the current branch (without creating a new branch).
   * Used for auto-checkpoints so we don't silently move the user off their branch.
   */
  async ensureSession(): Promise<Session> {
    if (this.currentSession) return this.currentSession;

    await this.initialize();

    const branches = await this.git.branchLocal();
    const branchName = branches.detached ? 'HEAD' : branches.current;

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

    const sessionId = nanoid(8);
    const branchName = `${BRANCH_PREFIX}${sessionId}`;

    // Create branch from current HEAD
    await this.git.checkoutLocalBranch(branchName);

    const session: Session = {
      id: sessionId,
      name,
      branch: branchName,
      projectPath: this.workingDir,
      createdAt: Date.now(),
      lastActive: Date.now(),
      checkpointIds: [],
      isActive: true,
    };

    // Save session to sessions file
    await this.saveSession(session);

    this.currentSession = session;
    return session;
  }

  /**
   * Switch to an existing session
   */
  async switchSession(sessionId: string): Promise<Session | null> {
    await this.initialize();

    const sessions = await this.listSessions();
    const session = sessions.find(s => s.id === sessionId);

    if (!session) {
      return null;
    }

    // Stash current changes if any
    const status = await this.git.status();
    if (!status.isClean()) {
      await this.git.stash(['push', '-m', `Switch from session ${this.currentSession?.id || 'unknown'}`]);
    }

    // Checkout the session branch
    await this.git.checkout(session.branch);

    // Update session as active
    session.lastActive = Date.now();
    session.isActive = true;
    await this.updateSession(session);

    // Mark other sessions as inactive
    for (const s of sessions) {
      if (s.id !== sessionId && s.isActive) {
        s.isActive = false;
        await this.updateSession(s);
      }
    }

    this.currentSession = session;
    return session;
  }

  /**
   * Get current branch name.
   * Returns the tracked branch when in detached HEAD state.
   */
  async getCurrentBranch(): Promise<string> {
    if (this.trackedBranch) {
      return this.trackedBranch;
    }
    const branches = await this.git.branchLocal();
    return branches.current;
  }

  /**
   * Snapshot currently dirty files (call before user sends a message).
   * Used to exclude pre-existing dirty files from auto-checkpoints.
   */
  async snapshotDirtyFiles(): Promise<void> {
    await this.initialize();
    const status = await this.git.status();
    const paths = new Set<string>();
    for (const p of status.created) paths.add(p);
    for (const p of status.modified) paths.add(p);
    for (const p of status.deleted) paths.add(p);
    for (const r of status.renamed) {
      paths.add(r.from);
      paths.add(r.to);
    }
    this.dirtyFilesSnapshot = paths;
  }

  /**
   * Clear the dirty files snapshot (called after createCheckpoint uses it).
   */
  private clearDirtyFilesSnapshot(): void {
    this.dirtyFilesSnapshot = null;
  }

  /**
   * Get current HEAD commit hash (short).
   */
  async getCurrentHead(): Promise<string> {
    try {
      const hash = await this.git.revparse(['--short', 'HEAD']);
      return hash.trim();
    } catch {
      return '';
    }
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
    const status = await this.git.status();
    let filesChanged = this.statusToFileChanges(status);

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
      await this.git.add(pathsToAdd);
    } else {
      // Skip checkpoint if no files changed and skipIfEmpty is set
      if (options?.skipIfEmpty && filesChanged.length === 0) {
        return null;
      }

      // Stage all changes
      if (filesChanged.length > 0) {
        await this.git.add('.');
      }
    }

    const currentBranch = await this.getCurrentBranch();

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

    try {
      const result = await this.git.commit(commitMessage, { '--allow-empty': null });
      checkpoint.metadata.commitSha = result.commit || '';
    } catch {
      const result = await this.git.commit(commitMessage, { '--allow-empty': null });
      checkpoint.metadata.commitSha = result.commit || '';
    }

    // Save checkpoint metadata
    await this.saveCheckpointMetadata(checkpoint);

    // Update session with this checkpoint
    this.currentSession.checkpointIds.push(checkpoint.id);
    this.currentSession.lastActive = Date.now();
    await this.updateSession(this.currentSession);

    return checkpoint;
  }

  /**
   * Restore to a checkpoint (simple checkout on same branch)
   */
  async restoreCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.initialize();

    if (!checkpoint.metadata.commitSha) {
      throw new Error('Checkpoint has no commit SHA');
    }

    // Stash current changes if any
    const status = await this.git.status();
    if (!status.isClean()) {
      await this.git.stash(['push', '-m', `Before restore to ${checkpoint.id}`]);
    }

    // Simply checkout the commit (detached HEAD temporarily)
    // Then reset the branch to this commit
    const currentBranch = await this.getCurrentBranch();

    // Reset branch to this commit
    await this.git.reset(['--hard', checkpoint.metadata.commitSha]);

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
        return this.git.diff([parent.metadata.commitSha, commitSha]);
      }
    }

    return this.git.show([commitSha, '--format=']);
  }

  // ========================================================================
  // Git-native methods (simplified UI)
  // ========================================================================

  /**
   * List ALL local git branches, sorted by most recent commit date.
   */
  async listAllBranches(): Promise<GitBranch[]> {
    await this.initialize();

    const branchSummary = await this.git.branchLocal();
    const branches: GitBranch[] = [];

    for (const [, data] of Object.entries(branchSummary.branches)) {
      branches.push({
        name: data.name,
        current: data.current,
        commit: data.commit,
        label: data.label,
      });
    }

    // Get last commit dates for sorting via for-each-ref
    try {
      const raw = await this.git.raw([
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(refname:short)\t%(committerdate:iso)',
        'refs/heads/',
      ]);

      const dateMap = new Map<string, string>();
      for (const line of raw.trim().split('\n')) {
        if (!line) continue;
        const [branchName, ...dateParts] = line.split('\t');
        dateMap.set(branchName, dateParts.join('\t'));
      }

      for (const branch of branches) {
        branch.lastCommitDate = dateMap.get(branch.name) || undefined;
      }
    } catch {
      // Non-fatal
    }

    // Sort: current branch first, then by most recent
    branches.sort((a, b) => {
      if (a.current) return -1;
      if (b.current) return 1;
      const dateA = a.lastCommitDate ? new Date(a.lastCommitDate).getTime() : 0;
      const dateB = b.lastCommitDate ? new Date(b.lastCommitDate).getTime() : 0;
      return dateB - dateA;
    });

    return branches;
  }

  /**
   * List commits on the current branch, newest first.
   * When in detached HEAD state, lists from the tracked branch so all commits are visible.
   */
  async listBranchCommits(maxCount: number = 50): Promise<GitCommit[]> {
    await this.initialize();

    try {
      // Always use an explicit ref — never rely on bare HEAD which may be
      // on a stale claude-session/ branch from a previous run.
      const branches = await this.git.branchLocal();
      const ref = this.trackedBranch || (branches.detached ? 'HEAD' : branches.current);

      const log = await this.git.log([ref, `--max-count=${maxCount}`]);

      return log.all.map((entry) => ({
        hash: entry.hash,
        hashShort: entry.hash.substring(0, 7),
        message: entry.message,
        body: entry.body || '',
        date: entry.date,
        timestamp: new Date(entry.date).getTime(),
        authorName: entry.author_name,
        authorEmail: entry.author_email,
        filesChanged: (entry.diff as any)?.files?.length ?? 0,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Switch to any git branch by name.
   */
  async switchToBranch(branchName: string): Promise<void> {
    await this.initialize();

    const status = await this.git.status();
    if (!status.isClean()) {
      await this.git.stash(['push', '-m', `Auto-stash before switching to ${branchName}`]);
    }

    await this.git.checkout(branchName);
    this.trackedBranch = null; // Re-attached to a branch
  }

  /**
   * Checkout a specific commit (detached HEAD, non-destructive).
   * Remembers which branch we came from so we can list all its commits.
   */
  async checkoutCommit(commitHash: string): Promise<void> {
    await this.initialize();

    // Remember the branch we're detaching from (only if not already detached)
    if (!this.trackedBranch) {
      const branches = await this.git.branchLocal();
      if (branches.current && !branches.detached) {
        this.trackedBranch = branches.current;
      }
    }

    const status = await this.git.status();
    if (!status.isClean()) {
      await this.git.stash(['push', '-m', `Auto-stash before checkout ${commitHash.substring(0, 7)}`]);
    }

    // Check if this commit is the tip of our tracked branch — if so, reattach
    if (this.trackedBranch) {
      try {
        const tipHash = await this.git.revparse([this.trackedBranch]);
        if (tipHash.trim().startsWith(commitHash) || commitHash.startsWith(tipHash.trim().substring(0, 7))) {
          await this.git.checkout(this.trackedBranch);
          this.trackedBranch = null;
          return;
        }
      } catch {
        // Non-fatal
      }
    }

    await this.git.checkout(commitHash);
  }

  /**
   * Reset branch to a specific commit (removes future commits).
   * Use for restore/edit so chat and git stay in sync.
   */
  async resetToCommit(commitHash: string): Promise<void> {
    await this.initialize();

    const status = await this.git.status();
    if (!status.isClean()) {
      await this.git.stash(['push', '-m', `Auto-stash before reset to ${commitHash.substring(0, 7)}`]);
    }

    const branches = await this.git.branchLocal();
    let branchName: string | null = null;

    if (branches.detached && this.trackedBranch) {
      branchName = this.trackedBranch;
      await this.git.checkout(this.trackedBranch);
    } else if (!branches.detached && branches.current) {
      branchName = branches.current;
    } else {
      // Detached with no trackedBranch: find branch containing this commit
      try {
        const raw = await this.git.raw(['branch', '--contains', commitHash]);
        const first = raw.trim().split('\n')[0]?.replace(/^\*\s*/, '').trim();
        if (first) {
          branchName = first;
          await this.git.checkout(branchName);
        }
      } catch {
        // Non-fatal
      }
    }

    await this.git.reset(['--hard', commitHash]);
    this.trackedBranch = null;
  }

  /**
   * Get diff for a specific commit by hash.
   */
  async getCommitDiff(commitHash: string): Promise<string> {
    await this.initialize();
    try {
      return await this.git.show([commitHash, '--format=', '--stat', '-p']);
    } catch {
      return '';
    }
  }

  /**
   * Load checkpoint metadata
   */
  async loadCheckpointMetadata(): Promise<ICheckpointTree> {
    const filePath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        root: null,
        nodes: {},
        currentId: null,
        activeLineage: [],
      };
    }
  }

  /**
   * Ensure .claude-agent is excluded from git tracking.
   * Uses .git/info/exclude (local-only) so we never modify the project's .gitignore.
   */
  private async ensureGitignore(): Promise<void> {
    const excludePath = path.join(this.workingDir, '.git', 'info', 'exclude');

    try {
      // Ensure the info directory exists
      await fs.mkdir(path.join(this.workingDir, '.git', 'info'), { recursive: true });

      let content = '';
      try {
        content = await fs.readFile(excludePath, 'utf-8');
      } catch {
        // File doesn't exist yet
      }

      if (!content.includes(CLAUDE_AGENT_DIR)) {
        content += `\n# Claude Agent checkpoint metadata\n${CLAUDE_AGENT_DIR}/\n`;
        await fs.writeFile(excludePath, content);
      }
    } catch {
      // Non-fatal — worst case .claude-agent shows as untracked
    }
  }

  /**
   * Convert git status to FileChange array
   */
  private statusToFileChanges(status: StatusResult): FileChange[] {
    const changes: FileChange[] = [];

    for (const file of status.created) {
      changes.push({ path: file, type: 'added', additions: 0, deletions: 0 });
    }
    for (const file of status.modified) {
      changes.push({ path: file, type: 'modified', additions: 0, deletions: 0 });
    }
    for (const file of status.deleted) {
      changes.push({ path: file, type: 'deleted', additions: 0, deletions: 0 });
    }
    for (const file of status.renamed) {
      changes.push({ path: file.to, oldPath: file.from, type: 'renamed', additions: 0, deletions: 0 });
    }

    return changes;
  }

  /**
   * Format commit message with checkpoint metadata
   */
  private formatCommitMessage(checkpoint: Checkpoint): string {
    const meta = {
      checkpointId: checkpoint.id,
      parentId: checkpoint.parentId,
      timestamp: checkpoint.timestamp,
    };

    return `${checkpoint.title || 'Checkpoint'}\n\n${checkpoint.description || ''}\n\n---\nCLAUDE_AGENT_META:${JSON.stringify(meta)}`;
  }

  /**
   * Save checkpoint metadata to file
   */
  private async saveCheckpointMetadata(checkpoint: Checkpoint): Promise<void> {
    const filePath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);
    let tree: ICheckpointTree;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      tree = JSON.parse(content);
    } catch {
      tree = { root: null, nodes: {}, currentId: null, activeLineage: [] };
    }

    tree.nodes[checkpoint.id] = checkpoint;

    if (checkpoint.parentId && tree.nodes[checkpoint.parentId]) {
      const parent = tree.nodes[checkpoint.parentId];
      if (!parent.childIds.includes(checkpoint.id)) {
        parent.childIds.push(checkpoint.id);
      }
      parent.metadata.isActive = false;
    }

    if (!tree.root) {
      tree.root = checkpoint.id;
    }

    tree.currentId = checkpoint.id;
    tree.activeLineage = this.computeLineage(tree, checkpoint.id);

    await fs.writeFile(filePath, JSON.stringify(tree, null, 2));
  }

  /**
   * Update which checkpoint is active
   */
  private async updateCheckpointActive(activeId: string): Promise<void> {
    const filePath = path.join(this.workingDir, CLAUDE_AGENT_DIR, CHECKPOINTS_FILE);
    const tree = await this.loadCheckpointMetadata();

    for (const id in tree.nodes) {
      tree.nodes[id].metadata.isActive = false;
    }

    if (tree.nodes[activeId]) {
      tree.nodes[activeId].metadata.isActive = true;
    }

    tree.currentId = activeId;
    tree.activeLineage = this.computeLineage(tree, activeId);

    await fs.writeFile(filePath, JSON.stringify(tree, null, 2));
  }

  /**
   * Compute lineage from root to given checkpoint
   */
  private computeLineage(tree: ICheckpointTree, checkpointId: string): string[] {
    const lineage: string[] = [];
    let current: Checkpoint | undefined = tree.nodes[checkpointId];

    while (current) {
      lineage.unshift(current.id);
      current = current.parentId ? tree.nodes[current.parentId] : undefined;
    }

    return lineage;
  }

  /**
   * Save a session to the sessions file
   */
  private async saveSession(session: Session): Promise<void> {
    const sessions = await this.listSessions();
    const index = sessions.findIndex(s => s.id === session.id);

    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    const filePath = path.join(this.workingDir, CLAUDE_AGENT_DIR, SESSIONS_FILE);
    await fs.writeFile(filePath, JSON.stringify(sessions, null, 2));
  }

  /**
   * Update an existing session
   */
  private async updateSession(session: Session): Promise<void> {
    await this.saveSession(session);
  }
}
