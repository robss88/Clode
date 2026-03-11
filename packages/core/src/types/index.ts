/**
 * Main type exports for Claude Agent
 * Now organized by domain for better maintainability
 */

// Re-export everything from domain-organized types
export * from './domain';

// For backward compatibility, also export from here directly
export {
  // Message types
  type MessageRole,
  type ContextItemType,
  type ContextItem,
  type Message,
  type ToolCall,
  type ToolResult,

  // File types
  type FileChangeType,
  type FileChange,
  type FileNode,

  // Checkpoint types
  type Checkpoint,
  type CheckpointMetadata,
  type ICheckpointTree,
  type CheckpointTreeData,
  type CheckpointGroup,

  // Git types
  type GitBranch,
  type GitCommit,
  type GitFileStatusCode,
  type GitFileStatus,
  type GitStatus,

  // Session types
  type Session,
  type ChatSession,

  // Project types
  type Project,
  type ProjectSettings,

  // Claude types
  type ClaudeConfig,
  type ClaudeEventType,
  type TextContentBlock,
  type ToolUseContentBlock,
  type ToolResultContentBlock,
  type ContentBlock,
  type ClaudeSystemEvent,
  type ClaudeAssistantEvent,
  type ClaudeUserEvent,
  type ClaudeResultEvent,
  type ClaudeStreamEvent,
} from './domain';