/**
 * Session and chat-related types for Claude Agent
 */

import type { Message } from './message';

export interface Session {
  id: string;
  name: string;
  branch: string;
  projectPath: string;
  createdAt: number;
  lastActive: number;
  checkpointIds: string[];
  isActive: boolean;
}

export interface ChatSession {
  id: string;
  branch?: string;
  branchName: string;
  name: string;
  messages: Message[];
  createdAt: number;
  updatedAt?: number;
  lastActive?: number;
  claudeSessionId?: string;
  isOpen?: boolean;        // Whether tab is currently open (default: true)
  isPinned?: boolean;      // Whether chat is pinned (optional future feature)
  archivedAt?: number;     // Timestamp when archived (optional)
}