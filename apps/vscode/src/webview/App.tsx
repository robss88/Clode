import type { ContextItem, FileNode, Message } from '@claude-agent/core';
import {
  configureStorage,
  executeCommand,
  getModeFlags,
  useAgentStore,
  useChatSessionStore,
  useUIStore,
} from '@claude-agent/ui';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useBridge } from './bridge/context';
import { vscodeStorage } from './bridge/vscode-bridge';
import { ChatTabs } from './ChatTabs';
import { CommandPalette } from '@claude-agent/ui';
import { Settings } from '@claude-agent/ui';

// Component imports
import { InitializationManager } from './components/InitializationManager';
import { EventHandlers } from './components/EventHandlers';
import { ChatPanel } from './components/ChatPanel';
import { DebugPanel } from './components/DebugPanel';
import { createCommands } from './components/CommandPaletteConfig';

// Configure Zustand persistence to use VS Code webview state (survives reloads)
configureStorage(vscodeStorage);

export default function App() {
  const bridge = useBridge();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [restoredAtMessageId, setRestoredAtMessageId] = useState<string | null>(null);
  const [checkpointMessageIds, setCheckpointMessageIds] = useState<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);

  // Message queue for handling multiple messages while streaming
  // Using ref for immediate updates without React state batching delays
  const messageQueueRef = useRef<Array<{content: string; context?: ContextItem[]}>>([]);
  const [messageQueueVersion, setMessageQueueVersion] = useState(0); // Trigger for queue processing

  const { showCommandPalette, toggleCommandPalette, showSettings, toggleSettings } = useUIStore();

  const {
    messages,
    isStreaming,
    streamingContent,
    currentToolCall,
    addMessage,
    setStreaming,
    clearStreamingContent,
    setCurrentToolCall,
  } = useAgentStore();

  // Handle initialization completion
  const handleInitComplete = useCallback((state: {
    fileTree: any;
    currentBranch: string;
    isReady: boolean;
  }) => {
    setFileTree(state.fileTree);
    setCurrentBranch(state.currentBranch);
    setIsReady(state.isReady);
  }, []);

  // Handle checkpoint creation
  const handleCheckpointCreated = useCallback((messageId: string) => {
    setCheckpointMessageIds((prev) => new Set([...prev, messageId]));
  }, []);


  // Auto-save messages to active chat session
  useEffect(() => {
    const chatId = useChatSessionStore.getState().activeChatId;
    if (chatId && messages.length > 0) {
      useChatSessionStore.getState().saveMessages(chatId, messages);
    }
  }, [messages]);

  // Add system message helper
  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    addMessage(msg);
  }, [addMessage]);

  // Get command palette commands
  const commands = createCommands(bridge);

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCommandPalette]);

  // Helper function to update chat title if needed
  const updateChatTitle = useCallback(() => {
    const chatId = useChatSessionStore.getState().activeChatId;
    if (!chatId) return;

    const chat = useChatSessionStore.getState().sessions[chatId];
    const allMessages = useAgentStore.getState().messages;

    // Update title if it's still "New Chat" and we have some messages
    if (chat && chat.name === 'New Chat') {
      const userMessages = allMessages.filter((m: Message) => m.role === 'user');

      if (userMessages.length > 0) {
        // Extract content from first substantial user message
        let titleContent = '';
        for (const msg of userMessages) {
          const cleaned = msg.content
            .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
            .replace(/^\n+/, '')
            .trim();
          if (cleaned.length > 10) {
            titleContent = cleaned;
            break;
          }
        }

        if (titleContent) {
          // Extract a clean title
          const firstLine = titleContent.split(/[\n.!?]/)[0]?.trim() || titleContent;
          let name = firstLine.slice(0, 50).trim();

          // Clean up common patterns
          name = name.replace(/^(please |can you |help me |i need |i want |i'm |i am )/gi, '');
          name = name.replace(/['"]/g, '');

          // Capitalize first letter
          if (name.length > 0) {
            name = name.charAt(0).toUpperCase() + name.slice(1);
          }

          name = name || 'Chat Session';
          useChatSessionStore.getState().updateChat(chatId, { name });
        }
      }
    }
  }, []);

  // Send message (with slash command interception)
  const handleSendMessage = useCallback(async (content: string, context?: ContextItem[]) => {
    // Check if the ACTIVE CHAT is streaming (not just global isStreaming)
    const activeChatId = useChatSessionStore.getState().activeChatId;
    const chatStream = activeChatId ? useAgentStore.getState().getChatStream(activeChatId) : null;
    const chatIsStreaming = chatStream?.isStreaming || isStreaming;

    // If this chat is streaming, queue the message
    if (chatIsStreaming) {
      messageQueueRef.current.push({ content, context });
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
        context: context && context.length > 0 ? context : undefined,
      };
      addMessage(userMessage);
      setMessageQueueVersion(v => v + 1);
      return;
    }

    // If we were in a restored state, truncate faded messages before sending
    if (restoredAtMessageId) {
      const currentMessages = useAgentStore.getState().messages;
      const restoreIndex = currentMessages.findIndex((m) => m.id === restoredAtMessageId);
      if (restoreIndex >= 0) {
        useAgentStore.getState().truncateAfterMessage(restoredAtMessageId);
      }
      setRestoredAtMessageId(null);
    }
    const modeFlags = getModeFlags(useUIStore.getState().mode);

    // Check for slash commands
    if (content.startsWith('/')) {
      const result = executeCommand(content, {
        onClearMessages: () => useAgentStore.getState().clearMessages(),
        onSendMessage: (prompt, options) => {
          setStreaming(true);
          const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          };
          addMessage(userMsg);
          updateChatTitle(); // Update title after user message
          const currentModel = useUIStore.getState().model;
          const mergedFlags = [...(options?.extraFlags || []), ...modeFlags];
          bridge.sendMessage(prompt, {
            ...options,
            model: currentModel || undefined,
            extraFlags: mergedFlags.length > 0 ? mergedFlags : undefined,
          });
        },
        onSetModel: (model) => {
          useUIStore.getState().setModel(model);
          bridge.setModel(model);
        },
        onSetMode: (mode) => {
          useUIStore.getState().setMode(mode as 'ask' | 'plan' | 'agent' | 'yolo');
        },
        onAddSystemMessage: addSystemMessage,
      });

      if (result) {
        if (result.type === 'error') {
          addSystemMessage(result.message || 'Unknown error');
          return;
        }
        if (result.type === 'local') {
          if (result.message && !result.clearConversation) {
            addSystemMessage(result.message);
          }
          return;
        }
        if (result.type === 'cli' && result.cliPrompt) {
          setStreaming(true);
          const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: Date.now(),
          };
          addMessage(userMsg);
          updateChatTitle(); // Update title after user message
          if (result.message) {
            addSystemMessage(result.message);
          }
          const currentModel = useUIStore.getState().model;
          const mergedFlags = [...(result.cliFlags || []), ...modeFlags];
          bridge.sendMessage(result.cliPrompt, {
            model: currentModel || undefined,
            extraFlags: mergedFlags.length > 0 ? mergedFlags : undefined,
          });
          return;
        }
      }
    }

    // Normal message
    setStreaming(true);
    const currentModel = useUIStore.getState().model;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      context: context && context.length > 0 ? context : undefined,
    };

    // Log outgoing message to debug panel
    useAgentStore.getState().pushDebugRawLine({
      _event: 'user:send',
      content: content.slice(0, 500),
      contextItems: context?.length || 0,
      model: currentModel,
      mode: useUIStore.getState().mode,
      flags: modeFlags,
    });

    addMessage(userMessage);
    updateChatTitle(); // Update title after user message
    bridge.sendMessage(content, {
      model: currentModel || undefined,
      extraFlags: modeFlags.length > 0 ? modeFlags : undefined,
    }).catch((err) => {
      setStreaming(false);
      addSystemMessage(`Failed to send: ${err?.message || err}`);
    });
  }, [bridge, addMessage, setStreaming, addSystemMessage, restoredAtMessageId, updateChatTitle, isStreaming]);

  // Process message queue when streaming ends
  useEffect(() => {
    if (!isStreaming && messageQueueRef.current.length > 0) {
      // Get and remove the first message from queue
      const nextMessage = messageQueueRef.current.shift();

      if (nextMessage) {
        // Small delay to ensure UI updates and prevent rapid-fire
        const timer = setTimeout(() => {
          // Process the queued message
          handleSendMessage(nextMessage.content, nextMessage.context);
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [isStreaming, messageQueueVersion, handleSendMessage]);

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    await bridge.interruptClaude();
    setStreaming(false);
    clearStreamingContent();
    setCurrentToolCall(null);
    useAgentStore.getState().clearStreamingToolCalls();
    // Clear message queue on interrupt
    messageQueueRef.current = [];
    setMessageQueueVersion(v => v + 1);
  }, [bridge, setStreaming, clearStreamingContent, setCurrentToolCall]);

  // Restore to message — restores file checkpoint and fades subsequent messages
  const handleRestoreToMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];

    // Each checkpoint stores post-modification state (after that turn completed).
    // To undo "turn N", restore the checkpoint from the assistant message before user message N.
    // For the first user message, use the 'initial' checkpoint.
    let checkpointMessageId: string | undefined;
    if (message.role === 'user') {
      // Find the assistant message BEFORE this user message (the previous turn's checkpoint)
      let foundAssistant = false;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'assistant') {
          checkpointMessageId = currentMessages[i].id;
          foundAssistant = true;
          break;
        }
      }
      // If no previous assistant message, this is the first user message — use initial checkpoint
      if (!foundAssistant) {
        checkpointMessageId = 'initial';
      }
    } else if (message.role === 'assistant') {
      checkpointMessageId = message.id;
    }

    // Restore file checkpoint
    if (checkpointMessageId) {
      const success = await bridge.restoreFileCheckpoint(checkpointMessageId);
      if (!success) {
        console.error('[Webview] Checkpoint restore failed — no checkpoint found for:', checkpointMessageId);
      }
    }

    // If restoring to the last message, clear the restore state (unfade everything)
    if (messageIndex === currentMessages.length - 1) {
      setRestoredAtMessageId(null);
    } else {
      // Fade out messages after this point
      setRestoredAtMessageId(messageId);
    }
  }, []);

  // Edit message and continue — restores checkpoint, truncates messages, then resends
  const handleEditMessageAndContinue = useCallback(async (messageId: string, newContent: string, context?: ContextItem[]) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Restore the checkpoint to undo code changes from this point forward
    let checkpointId: string | undefined;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (currentMessages[i].role === 'assistant') {
        checkpointId = currentMessages[i].id;
        break;
      }
    }
    if (!checkpointId) checkpointId = 'initial';
    await bridge.restoreFileCheckpoint(checkpointId).catch(() => {});

    // Truncate everything from this message onwards
    if (messageIndex > 0) {
      useAgentStore.getState().truncateAfterMessage(currentMessages[messageIndex - 1].id);
    } else {
      useAgentStore.getState().clearMessages();
    }

    setRestoredAtMessageId(null);
    await handleSendMessage(newContent, context);
  }, [handleSendMessage, bridge]);

  // New chat on current branch — does NOT interrupt running sessions
  const handleNewChat = useCallback(() => {
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    const branch = currentBranch || 'main';
    const newChat = useChatSessionStore.getState().createChat(branch, 'New Chat');

    // Switch display to new chat without clearing old chat's streaming state
    useAgentStore.getState().setMessages([]);
    useAgentStore.getState().setActiveChatId(newChat.id);
    bridge.switchChatSession(newChat.id);
  }, [bridge, currentBranch]);

  // Switch to an existing chat — does NOT interrupt running sessions
  const handleSwitchChat = useCallback((chatId: string) => {
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    const targetChat = useChatSessionStore.getState().sessions[chatId];
    if (targetChat) {
      useAgentStore.getState().setMessages(targetChat.messages);
      // setActiveChatId syncs global streaming state from chatStreams[chatId]
      useAgentStore.getState().setActiveChatId(chatId);
      useChatSessionStore.getState().setActiveChatId(chatId);
      bridge.switchChatSession(chatId, targetChat.claudeSessionId);
    }
  }, [bridge]);

  // Close a chat tab (hide it, don't delete)
  const handleCloseChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    const branch = currentBranch || 'main';
    const openChats = store.getChatsForBranch(branch);

    store.closeChat(chatId);

    if (store.activeChatId === chatId) {
      if (openChats.length > 1) {
        const otherChat = openChats.find((c) => c.id !== chatId);
        if (otherChat) {
          useAgentStore.getState().setMessages(otherChat.messages);
          useAgentStore.getState().setActiveChatId(otherChat.id);
          store.setActiveChatId(otherChat.id);
          bridge.switchChatSession(otherChat.id, otherChat.claudeSessionId);
        }
      } else {
        const newChat = store.createChat(branch, 'New Chat');
        useAgentStore.getState().setMessages([]);
        useAgentStore.getState().setActiveChatId(newChat.id);
        bridge.switchChatSession(newChat.id);
      }
    }
  }, [bridge, currentBranch]);

  // Reopen a closed chat
  const handleReopenChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    store.openChat(chatId);

    const chat = store.sessions[chatId];
    if (chat) {
      const currentId = store.activeChatId;
      if (currentId) {
        useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
      }
      useAgentStore.getState().setMessages(chat.messages);
      useAgentStore.getState().setActiveChatId(chatId);
      store.setActiveChatId(chatId);
      bridge.switchChatSession(chatId, chat.claudeSessionId);
    }
  }, [bridge]);

  // Permanently delete a chat
  const handlePermanentlyDeleteChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    const branch = currentBranch || 'main';

    if (store.activeChatId === chatId) {
      const openChats = store.getChatsForBranch(branch);
      const otherChat = openChats.find((c) => c.id !== chatId);
      if (otherChat) {
        useAgentStore.getState().setMessages(otherChat.messages);
        useAgentStore.getState().setActiveChatId(otherChat.id);
        store.setActiveChatId(otherChat.id);
        bridge.switchChatSession(otherChat.id, otherChat.claudeSessionId);
      } else {
        const newChat = store.createChat(branch, 'New Chat');
        useAgentStore.getState().setMessages([]);
        useAgentStore.getState().setActiveChatId(newChat.id);
        bridge.switchChatSession(newChat.id);
      }
    }

    store.permanentlyDeleteChat(chatId);
  }, [bridge, currentBranch]);

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Initializing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Initialize app state */}
      <InitializationManager onInitComplete={handleInitComplete} />

      {/* Set up event handlers */}
      <EventHandlers onCheckpointCreated={handleCheckpointCreated} />

      <ChatTabs
        currentBranch={currentBranch}
        onSwitchChat={handleSwitchChat}
        onNewChat={handleNewChat}
        onCloseChat={handleCloseChat}
        onReopenChat={handleReopenChat}
        onPermanentlyDeleteChat={handlePermanentlyDeleteChat}
      />

      <div className="flex-1 overflow-hidden">
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          currentToolCall={currentToolCall}
          fileTree={fileTree}
          checkpointMessageIds={checkpointMessageIds}
          restoredAtMessageId={restoredAtMessageId}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onRestoreToMessage={handleRestoreToMessage}
          onEditMessageAndContinue={handleEditMessageAndContinue}
        />
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={toggleCommandPalette}
        commands={commands}
      />

      {/* Settings Panel */}
      <Settings
        isOpen={showSettings}
        onClose={toggleSettings}
      />

      {/* Debug Panel */}
      <DebugPanel />
    </div>
  );
}
