// Components
export { Layout } from './components/Layout';
export { ChatInterface } from './components/Chat';
export { CommitTimeline, CheckpointTimeline } from './components/Checkpoints';
export { GitPanel } from './components/GitPanel';
export { FileExplorer } from './components/FileExplorer';
export { DiffViewer } from './components/DiffViewer';
export { EmbeddedTerminal } from './components/Terminal';
export { CommandPalette } from './components/CommandPalette';
export { Settings } from './components/Settings';

// Types for new components
export type { CommandItem } from './components/CommandPalette';
export type { MCPServer } from './components/Settings';

// Stores
export {
  useAgentStore,
  useCheckpointStore,
  useSessionStore,
  useProjectStore,
  useUIStore,
  useChatSessionStore,
  configureStorage,
} from './stores';

// Hooks
export { useClaudeAgent } from './hooks/useClaudeAgent';
export { useCheckpoints } from './hooks/useCheckpoints';
export { useKeyboardShortcuts, createAgentShortcuts } from './hooks/useKeyboardShortcuts';

// Commands
export { parseSlashCommand, executeCommand, getAvailableCommands, getModeFlags } from './commands';

// Types
export type { AgentMode } from './stores';
export type { AgentState, CheckpointState, ChatSessionState, SessionState, ProjectState, UIState } from './stores';
export type { CommandResult, CommandContext, SendMessageOptions } from './commands';
