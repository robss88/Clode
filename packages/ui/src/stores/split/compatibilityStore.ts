/**
 * Backward compatibility store that combines ChatStore and DebugStore
 * to maintain the old useAgentStore API
 */

import { useChatStore } from './chatStore';
import { useDebugStore } from './debugStore';

// For hook usage in React components
export function useAgentStore(): any;
export function useAgentStore<T>(selector: (state: any) => T): T;
export function useAgentStore(selector?: any) {
  const chatState = useChatStore();
  const debugState = useDebugStore();

  const combinedState = {
    ...chatState,
    ...debugState,
  };

  if (selector) {
    return selector(combinedState);
  }

  return combinedState;
}

// Add static methods to match Zustand store interface
useAgentStore.getState = () => ({
  ...useChatStore.getState(),
  ...useDebugStore.getState(),
});

useAgentStore.setState = (partial: any) => {
  // Determine which store to update based on the keys
  const chatState = useChatStore.getState();
  const debugState = useDebugStore.getState();

  const chatKeys = Object.keys(chatState);
  const debugKeys = Object.keys(debugState);

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
};

useAgentStore.subscribe = (listener: (state: any) => void) => {
  // Subscribe to both stores and call listener when either changes
  const unsubChat = useChatStore.subscribe(() => {
    listener(useAgentStore.getState());
  });
  const unsubDebug = useDebugStore.subscribe(() => {
    listener(useAgentStore.getState());
  });

  return () => {
    unsubChat();
    unsubDebug();
  };
};