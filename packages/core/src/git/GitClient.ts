import simpleGit, { SimpleGit, StatusResult, BranchSummary } from 'simple-git';
import type { GitBranch, GitCommit, GitStatus, GitFileStatus } from '../types';

/**
 * GitClient - Low-level git operations wrapper
 *
 * This class provides a clean, testable interface for git operations
 * without any checkpoint or session-specific logic.
 */
export class GitClient {
  private git: SimpleGit;
  private workingDir: string;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
    this.git = simpleGit(workingDir);
  }

  // ============================================================================
  // Repository Management
  // ============================================================================

  /**
   * Check if directory is a git repository
   */
  async isRepository(): Promise<boolean> {
    return this.git.checkIsRepo();
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.git.init();
  }

  /**
   * Get repository status
   */
  async status(): Promise<StatusResult> {
    return this.git.status();
  }

  /**
   * Check if working tree is clean
   */
  async isClean(): Promise<boolean> {
    const status = await this.git.status();
    return status.isClean();
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const branches = await this.git.branchLocal();
    return branches.detached ? 'HEAD' : branches.current;
  }

  /**
   * List all local branches
   */
  async listBranches(): Promise<BranchSummary> {
    return this.git.branchLocal();
  }

  /**
   * Get branches sorted by last commit date
   */
  async listBranchesSorted(): Promise<GitBranch[]> {
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

    // Get last commit dates for sorting
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
        const [branch, date] = line.split('\t');
        dateMap.set(branch, date);
      }

      // Sort branches by date
      branches.sort((a, b) => {
        const dateA = dateMap.get(a.name) || '';
        const dateB = dateMap.get(b.name) || '';
        return dateB.localeCompare(dateA);
      });
    } catch {
      // Fallback: current branch first
      branches.sort((a, b) => {
        if (a.current) return -1;
        if (b.current) return 1;
        return 0;
      });
    }

    return branches;
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string): Promise<void> {
    await this.git.checkoutBranch(name, 'HEAD');
  }

  /**
   * Switch to an existing branch
   */
  async switchBranch(name: string): Promise<void> {
    await this.git.checkout(name);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string, force = false): Promise<void> {
    await this.git.deleteLocalBranch(name, force);
  }

  // ============================================================================
  // Commit Operations
  // ============================================================================

  /**
   * Get current HEAD commit hash
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
   * Stage files for commit
   */
  async add(files: string | string[]): Promise<void> {
    await this.git.add(files);
  }

  /**
   * Stage all changes
   */
  async addAll(): Promise<void> {
    await this.git.add('.');
  }

  /**
   * Create a commit
   */
  async commit(message: string, options?: any): Promise<any> {
    return this.git.commit(message, undefined, options);
  }

  /**
   * List commits with limit
   */
  async listCommits(limit = 50): Promise<GitCommit[]> {
    const log = await this.git.log(['--oneline', `-${limit}`]);

    return log.all.map(commit => ({
      hash: commit.hash.substring(0, 7),
      date: commit.date,
      message: commit.message,
      author: commit.author_name,
    }));
  }

  /**
   * Get commit diff
   */
  async getCommitDiff(hash: string): Promise<string> {
    return this.git.show([hash]);
  }

  /**
   * Get diff between two commits
   */
  async diff(from: string, to: string): Promise<string> {
    return this.git.diff([from, to]);
  }

  // ============================================================================
  // Checkout and Reset Operations
  // ============================================================================

  /**
   * Checkout a commit (detached HEAD)
   */
  async checkoutCommit(hash: string): Promise<void> {
    await this.git.checkout(hash);
  }

  /**
   * Reset to a commit (hard reset)
   */
  async reset(hash: string, mode: 'soft' | 'mixed' | 'hard' = 'hard'): Promise<void> {
    await this.git.reset([`--${mode}`, hash]);
  }

  /**
   * Reattach to a branch after detached HEAD
   */
  async reattachBranch(branchName: string): Promise<void> {
    await this.git.checkout(branchName);
  }

  // ============================================================================
  // Stash Operations
  // ============================================================================

  /**
   * Stash current changes
   */
  async stash(message?: string): Promise<void> {
    const args = ['push'];
    if (message) {
      args.push('-m', message);
    }
    await this.git.stash(args);
  }

  /**
   * Apply latest stash
   */
  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  // ============================================================================
  // Remote Operations
  // ============================================================================

  /**
   * Push to remote
   */
  async push(remote = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.push(remote, branch);
    } else {
      await this.git.push();
    }
  }

  /**
   * Pull from remote
   */
  async pull(remote = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Execute raw git command
   */
  async raw(args: string[]): Promise<string> {
    return this.git.raw(args);
  }

  /**
   * Convert git status to file status array
   */
  statusToFileStatus(status: StatusResult): GitFileStatus[] {
    const fileStatuses: GitFileStatus[] = [];

    for (const path of status.modified) {
      fileStatuses.push({ path, status: 'modified' });
    }
    for (const path of status.created) {
      fileStatuses.push({ path, status: 'added' });
    }
    for (const path of status.deleted) {
      fileStatuses.push({ path, status: 'deleted' });
    }
    for (const renamed of status.renamed) {
      fileStatuses.push({ path: renamed.to, status: 'renamed', from: renamed.from });
    }

    return fileStatuses;
  }

  /**
   * Get comprehensive git status
   */
  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();
    const branch = await this.getCurrentBranch();

    return {
      branch,
      ahead: status.ahead,
      behind: status.behind,
      files: this.statusToFileStatus(status),
      isClean: status.isClean(),
    };
  }
}