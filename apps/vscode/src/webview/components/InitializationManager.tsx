import { useEffect } from 'react';
import { useAgentStore, useChatSessionStore } from '@claude-agent/ui';
import { useBridge } from '../bridge/context';

interface InitializationManagerProps {
  onInitComplete: (state: {
    fileTree: any;
    currentBranch: string;
    isReady: boolean;
  }) => void;
}

export function InitializationManager({ onInitComplete }: InitializationManagerProps) {
  const bridge = useBridge();

  useEffect(() => {
    let didInit = false;

    async function handleInitState(state: any) {
      if (didInit) return;
      didInit = true;

      try {
        const branchName = state.branch || 'main';

        // Restore last active chat, or pick first for branch, or create new
        const store = useChatSessionStore.getState();
        const persistedId = store.activeChatId;
        const branchChats = store.getChatsForBranch(branchName);

        let chat;
        if (persistedId && store.sessions[persistedId]) {
          chat = store.sessions[persistedId];
        } else if (branchChats.length > 0) {
          chat = branchChats[0];
        } else {
          chat = store.createChat(branchName, 'Chat 1');
        }

        // Fire-and-forget — don't block init on Claude process startup
        bridge.startClaude(chat.id, chat.claudeSessionId);

        // Restore messages from the active chat
        if (chat.messages.length > 0) {
          useAgentStore.getState().setMessages(chat.messages);
        }
        useAgentStore.getState().setActiveChatId(chat.id);
        useChatSessionStore.getState().setActiveChatId(chat.id);

        // Load file tree for @ mentions
        const tree = await bridge.getFileTree();

        onInitComplete({
          fileTree: tree,
          currentBranch: branchName,
          isReady: true,
        });
      } catch (err) {
        console.error('[Webview] Init failed:', err);
        onInitComplete({
          fileTree: null,
          currentBranch: 'main',
          isReady: true,
        });
      }
    }

    // Listen for broadcast (fast path)
    const cleanup = bridge.onInitState(handleInitState);

    // Request init state (handles race condition where broadcast was missed)
    bridge.requestInitState().then(handleInitState).catch(() => {});

    return cleanup;
  }, [bridge, onInitComplete]);

  return null;
}