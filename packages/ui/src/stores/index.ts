/**
 * Main store exports - now using split stores for better organization
 * This file provides backward compatibility while using the new modular store structure
 */

// Re-export everything from the split stores
export * from './split';

// For backward compatibility, also export from here directly
export {
  configureStorage,
  useAgentStore,
  useChatSessionStore,
  useCheckpointStore,
  useProjectStore,
  useUIStore,
  useSessionStore,
  useDebugStore,
  useChatStore,
  type AgentMode,
  type StreamingBlock,
  type ChatStreamState,
  DEFAULT_STREAM_STATE,
} from './split';