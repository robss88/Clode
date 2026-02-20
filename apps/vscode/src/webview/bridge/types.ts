import type { GitBranch, GitCommit, GitStatus } from '@claude-agent/core';

export interface PlatformBridge {
  // Claude
  sendMessage(content: string, options?: { extraFlags?: string[]; model?: string }): Promise<boolean>;
  setModel(model: string): Promise<boolean>;
  interruptClaude(): Promise<void>;
  startClaude(chatSessionId?: string): Promise<boolean>;

  // Checkpoints
  createCheckpoint(
    title?: string,
    description?: string,
    messages?: any[],
    options?: { skipIfEmpty?: boolean }
  ): Promise<any>;
  snapshotDirtyFiles(): Promise<void>;

  // Git
  resetGitToCommit(hash: string): Promise<void>;
  reattachBranch(): Promise<boolean>;
  getCurrentGitHead(): Promise<string>;
  getCurrentGitBranch(): Promise<string>;
  listGitBranches(): Promise<GitBranch[]>;
  listGitCommits(maxCount?: number): Promise<GitCommit[]>;
  checkoutGitCommit(hash: string): Promise<void>;
  getGitCommitDiff(hash: string): Promise<string>;
  switchGitBranch(branchName: string): Promise<void>;
  createGitBranch(name: string): Promise<void>;
  pushToRemote(): Promise<void>;
  getGitStatus(): Promise<GitStatus>;
  gitCommitAll(message: string): Promise<string>;

  // Chat sessions
  switchChatSession(id: string): Promise<void>;

  // Files (for @ mentions)
  readFile(path: string): Promise<string | null>;
  getFileTree(): Promise<any>;
  openFile(path: string): Promise<void>;

  // Events (return cleanup function)
  onClaudeChunk(cb: (chunk: any) => void): () => void;
  onClaudeMessage(cb: (msg: any) => void): () => void;
  onClaudeError(cb: (err: string) => void): () => void;
  onCheckpointCreated(cb: (cp: any) => void): () => void;
  onCheckpointRestored(cb: (cp: any) => void): () => void;
  onInitState(cb: (state: InitState) => void): () => void;
}

export interface InitState {
  workspacePath: string;
  branch: string | null;
  activeChatSessionId: string | null;
  isStreaming: boolean;
}
