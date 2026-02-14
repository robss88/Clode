// Components
export { Layout } from './components/Layout';
export { ChatInterface } from './components/Chat';
export { CommitTimeline, CheckpointTimeline } from './components/Checkpoints';
export { FileExplorer } from './components/FileExplorer';
export { DiffViewer } from './components/DiffViewer';
export { EmbeddedTerminal } from './components/Terminal';

// Stores
export {
  useAgentStore,
  useCheckpointStore,
  useSessionStore,
  useProjectStore,
  useUIStore,
} from './stores';

// Hooks
export { useClaudeAgent } from './hooks/useClaudeAgent';
export { useCheckpoints } from './hooks/useCheckpoints';
export { useKeyboardShortcuts, createAgentShortcuts } from './hooks/useKeyboardShortcuts';

// Commands
export { parseSlashCommand, executeCommand, getAvailableCommands } from './commands';

// Types
export type { AgentState, CheckpointState, SessionState, ProjectState, UIState } from './stores';
export type { CommandResult, CommandContext, SendMessageOptions } from './commands';
