/**
 * Main store export file that combines split stores and provides backward compatibility
 */

import type { StateStorage } from 'zustand/middleware';
import { configureStorage as configureStorageBackend } from './storage';

// Re-export all split stores
export { useChatStore } from './chatStore';
export { useDebugStore } from './debugStore';
export { useUIStore } from './uiStore';
export { useChatSessionStore } from './sessionStore';
export { useCheckpointStore } from './checkpointStore';
export { useProjectStore } from './projectStore';

// Re-export types
export type { AgentMode, StreamingBlock, ChatStreamState } from './types';
export { DEFAULT_STREAM_STATE } from './types';

// Re-export specific state types for backward compatibility
export type { ChatState } from './chatStore';
export type { DebugState } from './debugStore';
export type { UIState, PanelState, LayoutState } from './uiStore';
export type { ChatSessionState } from './sessionStore';
export type { CheckpointState } from './checkpointStore';
export type { ProjectState } from './projectStore';

// Import stores for the compatibility layer
import { useChatStore } from './chatStore';
import { useDebugStore } from './debugStore';
import { useUIStore } from './uiStore';
import { useChatSessionStore } from './sessionStore';
import { useProjectStore } from './projectStore';

/**
 * Configure storage for all persisted stores and re-hydrate them.
 * Must be called before the first React render.
 */
export function configureStorage(storage: StateStorage) {
  configureStorageBackend(storage);

  // Re-hydrate all persisted stores
  useChatSessionStore.persist.rehydrate();
  useUIStore.persist.rehydrate();
  useProjectStore.persist.rehydrate();
}

/**
 * Backward compatibility: useAgentStore
 * This merges ChatStore and DebugStore to maintain the old API
 *
 * Note: This is a compatibility shim. For new code, use the specific stores directly.
 */
import { useShallow } from 'zustand/shallow';

// Create a combined store interface for backward compatibility
export const useAgentStore = Object.assign(
  (selector?: any) => {
    // When used as a hook in React components
    const chatState = useChatStore(selector ? (state: any) => state : undefined);
    const debugState = useDebugStore(selector ? (state: any) => state : undefined);

    if (selector) {
      // If a selector is provided, we need to apply it to the combined state
      const combinedState = {
        ...chatState,
        ...debugState,
      };
      return selector(combinedState);
    }

    // Return combined state
    return {
      ...chatState,
      ...debugState,
    };
  },
  {
    // Static methods for non-hook usage
    getState: () => ({
      ...useChatStore.getState(),
      ...useDebugStore.getState(),
    }),
    setState: (partial: any) => {
      // Determine which store to update based on the keys
      const chatKeys = Object.keys(useChatStore.getState());
      const debugKeys = Object.keys(useDebugStore.getState());

      const chatUpdates: any = {};
      const debugUpdates: any = {};

      for (const key in partial) {
        if (chatKeys.includes(key)) {
          chatUpdates[key] = partial[key];
        }
        if (debugKeys.includes(key)) {
          debugUpdates[key] = partial[key];
        }
      }

      if (Object.keys(chatUpdates).length > 0) {
        useChatStore.setState(chatUpdates);
      }
      if (Object.keys(debugUpdates).length > 0) {
        useDebugStore.setState(debugUpdates);
      }
    },
    subscribe: (listener: any) => {
      // Subscribe to both stores
      const unsubChat = useChatStore.subscribe(listener);
      const unsubDebug = useDebugStore.subscribe(listener);
      return () => {
        unsubChat();
        unsubDebug();
      };
    },
  }
);

// For components that use the hook pattern
export function useAgentStoreHook() {
  const chatStore = useChatStore();
  const debugStore = useDebugStore();

  return {
    ...chatStore,
    ...debugStore,
  };
}

/**
 * Backward compatibility: useSessionStore
 * Maps to useCheckpointStore for session management
 */
export const useSessionStore = Object.assign(
  (selector?: any) => {
    const checkpointStore = useCheckpointStore.getState();

    // Create a compatibility layer for session-like API
    const sessionState = {
      sessions: [], // Map checkpoints to sessions if needed
      currentSession: checkpointStore.currentId ? {
        id: checkpointStore.currentId,
        branchName: checkpointStore.currentBranch,
      } : null,

      // Map checkpoint methods to session-like API
      addSession: (session: any) => {
        // This would map to checkpoint creation
        console.warn('useSessionStore.addSession is deprecated, use checkpoint methods');
      },
      updateSession: (id: string, updates: any) => {
        console.warn('useSessionStore.updateSession is deprecated, use checkpoint methods');
      },
    };

    if (selector) {
      return selector(sessionState);
    }
    return sessionState;
  },
  {
    getState: () => {
      const checkpointStore = useCheckpointStore.getState();
      return {
        sessions: [],
        currentSession: checkpointStore.currentId ? {
          id: checkpointStore.currentId,
          branchName: checkpointStore.currentBranch,
        } : null,
      };
    },
  }
);