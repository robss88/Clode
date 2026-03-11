/**
 * Message-related types for Claude Agent
 */

export type MessageRole = 'user' | 'assistant' | 'system';

export type ContextItemType = 'file' | 'selection' | 'url' | 'image';

export interface ContextItem {
  id: string;
  type: ContextItemType;
  name: string;        // Display name (filename, URL title, etc.)
  path?: string;       // Full path for files
  content?: string;    // File content, selection text, etc. (loaded lazily)
  preview?: string;    // Short preview snippet
  metadata?: Record<string, unknown>; // Line range, language, etc.
  // Image-specific fields:
  imageData?: string;  // base64-encoded image data (without data:image/... prefix)
  mimeType?: string;   // 'image/png', 'image/jpeg', 'image/gif', etc.
  dimensions?: { width: number; height: number };
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  context?: ContextItem[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  isStreaming?: boolean;
  checkpointCommitHash?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
}

export interface ToolResult {
  toolCallId: string;
  output: string;
  isError: boolean;
}