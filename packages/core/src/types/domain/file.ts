/**
 * File and filesystem-related types for Claude Agent
 */

export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed' | 'created';

export interface FileChange {
  path: string;
  type: FileChangeType;
  oldPath?: string; // For renames
  additions?: number;
  deletions?: number;
  diff?: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  changeType?: FileChangeType;
}