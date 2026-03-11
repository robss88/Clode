/**
 * Project management types for Claude Agent
 */

import type { ICheckpointTree } from './checkpoint';
import type { Session } from './session';

export interface Project {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
  createdAt: number;
  checkpointTree: ICheckpointTree;
  sessions: Session[];
  activeSessionId: string | null;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  autoCheckpoint: boolean;
  checkpointOnToolCall: boolean;
  maxCheckpoints: number;
  gitBranch: string;
}