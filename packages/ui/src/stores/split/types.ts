import type { ToolCall } from '@claude-agent/core';

export type AgentMode = 'ask' | 'plan' | 'agent' | 'yolo';

// Streaming block types for interleaved content
export type StreamingBlock =
  | { type: 'text'; content: string; id: string }
  | { type: 'tool'; toolCall: ToolCall; id: string };

// Per-chat streaming state
export interface ChatStreamState {
  isStreaming: boolean;
  streamingContent: string;
  streamingBlocks: StreamingBlock[];
  currentToolCall: ToolCall | null;
  streamingToolCalls: ToolCall[];
}

export const DEFAULT_STREAM_STATE: ChatStreamState = {
  isStreaming: false,
  streamingContent: '',
  streamingBlocks: [],
  currentToolCall: null,
  streamingToolCalls: [],
};