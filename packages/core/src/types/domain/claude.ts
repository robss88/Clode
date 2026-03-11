/**
 * Claude Code integration types for Claude Agent
 */

export interface ClaudeConfig {
  workingDir: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  allowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
}

// Claude Code CLI stream-json event types (actual format from CLI)
export type ClaudeEventType = 'system' | 'assistant' | 'user' | 'result';

// Content block types within assistant messages
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

// Claude Code stream-json event structure
export interface ClaudeSystemEvent {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model?: string;
  permission_mode?: string;
}

export interface ClaudeAssistantEvent {
  type: 'assistant';
  role: 'assistant';
  content: ContentBlock[];
}

export interface ClaudeUserEvent {
  type: 'user';
  role: 'user';
  content: string;
}

export interface ClaudeResultEvent {
  type: 'result';
  status: 'completed' | 'canceled' | 'error';
  error?: string;
}

export type ClaudeStreamEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeResultEvent;