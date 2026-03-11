/**
 * Git-related types for Claude Agent
 */

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  lastCommitDate?: string;
}

export interface GitCommit {
  hash: string;
  hashShort?: string;
  message: string;
  body?: string;
  date: string;
  timestamp?: number;
  author?: string;
  authorName?: string;
  authorEmail?: string;
  filesChanged?: number;
}

export type GitFileStatusCode = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface GitFileStatus {
  path: string;
  status: GitFileStatusCode;
  staged?: boolean;
  from?: string; // For renames
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  staged?: number;
  unstaged?: number;
  untracked?: number;
  isClean: boolean;
}