import type { ContextItem, FileNode, Message } from '@claude-agent/core';
import {
  ChatInterface,
  configureStorage,
  executeCommand,
  getModeFlags,
  useAgentStore,
  useChatSessionStore,
  useUIStore,
} from '@claude-agent/ui';
import { useCallback, useEffect, useState } from 'react';
import { useBridge } from './bridge/context';
import { vscodeStorage } from './bridge/vscode-bridge';
import { ChatTabs } from './ChatTabs';

// Configure Zustand persistence to use VS Code webview state (survives reloads)
configureStorage(vscodeStorage);

export default function App() {
  const bridge = useBridge();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [restoredAtMessageId, setRestoredAtMessageId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

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

  // Initialize: request init state from extension host (handles race condition)
  useEffect(() => {
    let didInit = false;

    async function handleInitState(state: any) {
      if (didInit) return;
      didInit = true;
      try {
        const branchName = state.branch || 'main';
        setCurrentBranch(branchName);

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
        useChatSessionStore.getState().setActiveChatId(chat.id);

        // Load file tree for @ mentions
        const tree = await bridge.getFileTree();
        setFileTree(tree);

        setIsReady(true);
      } catch (err) {
        console.error('[Webview] Init failed:', err);
        setIsReady(true);
      }
    }

    // Listen for broadcast (fast path)
    const cleanup = bridge.onInitState(handleInitState);

    // Request init state (handles race condition where broadcast was missed)
    bridge.requestInitState().then(handleInitState).catch(() => {});

    return cleanup;
  }, [bridge]);

  // Set up event listeners
  useEffect(() => {
    const cleanupChunk = bridge.onClaudeChunk((chunk) => {
      const { appendStreamingContent, setCurrentToolCall, setStreaming, clearStreamingContent, addMessage } = useAgentStore.getState();

      if (chunk.type === 'init' && chunk.sessionId) {
        const chatId = useChatSessionStore.getState().activeChatId;
        if (chatId) {
          useChatSessionStore.getState().updateChat(chatId, { claudeSessionId: chunk.sessionId });
        }
      } else if (chunk.type === 'text') {
        appendStreamingContent(chunk.content);
        setCurrentToolCall(null);
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        setCurrentToolCall(chunk.toolCall);
      } else if (chunk.type === 'tool_result') {
        setCurrentToolCall(null);
      } else if (chunk.type === 'complete') {
        const { streamingContent } = useAgentStore.getState();
        if (streamingContent) {
          addMessage({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: streamingContent,
            timestamp: Date.now(),
          });
        }
        setCurrentToolCall(null);
        setStreaming(false);
        clearStreamingContent();
      }
    });

    const cleanupMessage = bridge.onClaudeMessage(async (message) => {
      const { clearStreamingContent, setCurrentToolCall, addMessage, setStreaming, streamingContent } = useAgentStore.getState();

      if (!message.content && streamingContent) {
        message.content = streamingContent;
      }

      clearStreamingContent();
      setCurrentToolCall(null);
      addMessage(message);
      setStreaming(false);

      // Create file checkpoint after each assistant response (snapshots modified files)
      bridge.createFileCheckpoint(message.id).catch((err) => {
        console.error('[Webview] File checkpoint failed:', err);
      });

      // Auto-name the chat session
      const chatId = useChatSessionStore.getState().activeChatId;
      if (chatId) {
        const chat = useChatSessionStore.getState().sessions[chatId];
        const allMessages = useAgentStore.getState().messages;
        if (chat && chat.messages.length === 0) {
          const firstUser = allMessages.find((m: Message) => m.role === 'user');
          if (firstUser) {
            const stripped = firstUser.content
              .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
              .replace(/^\n+/, '')
              .trim();
            const firstLine = stripped.split(/[\n.!?]/)[0]?.trim() || stripped;
            const name = firstLine.slice(0, 40).trim() || 'New Chat';
            useChatSessionStore.getState().updateChat(chatId, { name });
          }
        }
        useChatSessionStore.getState().saveMessages(chatId, useAgentStore.getState().messages);
      }
    });

    const cleanupError = bridge.onClaudeError((error) => {
      if (!error.startsWith('[Debug]')) {
        useAgentStore.getState().setStreaming(false);
      }
    });

    return () => {
      cleanupChunk();
      cleanupMessage();
      cleanupError();
    };
  }, [bridge]);

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

  // Send message (with slash command interception)
  const handleSendMessage = useCallback(async (content: string, context?: ContextItem[]) => {
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
          const mergedFlags = [...(options?.extraFlags || []), ...modeFlags];
          bridge.sendMessage(prompt, {
            ...options,
            extraFlags: mergedFlags.length > 0 ? mergedFlags : undefined,
          });
        },
        onSetModel: (model) => {
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
          if (result.message) {
            addSystemMessage(result.message);
          }
          const mergedFlags = [...(result.cliFlags || []), ...modeFlags];
          bridge.sendMessage(result.cliPrompt, {
            extraFlags: mergedFlags.length > 0 ? mergedFlags : undefined,
          });
          return;
        }
      }
    }

    // Normal message
    setStreaming(true);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      context: context && context.length > 0 ? context : undefined,
    };
    addMessage(userMessage);
    bridge.sendMessage(content, {
      extraFlags: modeFlags.length > 0 ? modeFlags : undefined,
    });
  }, [bridge, addMessage, setStreaming, addSystemMessage, restoredAtMessageId]);

  // Implement plan — leverages session resumption so Claude has full planning context
  const handleImplementPlan = useCallback(async (planContent: string) => {
    useUIStore.getState().setMode('agent');
    addSystemMessage('Switching to Agent mode to implement plan...');
    await handleSendMessage('Now implement the plan you just created. Follow it step by step.');
  }, [handleSendMessage, addSystemMessage]);

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    await bridge.interruptClaude();
    setStreaming(false);
    clearStreamingContent();
    setCurrentToolCall(null);
  }, [bridge, setStreaming, clearStreamingContent, setCurrentToolCall]);

  // Restore to message — restores file checkpoint and fades subsequent messages
  const handleRestoreToMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];

    // Find the assistant message with a checkpoint to restore to
    let checkpointMessageId: string | undefined;
    if (message.role === 'user') {
      // Look for the previous assistant message's checkpoint
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'assistant') {
          checkpointMessageId = currentMessages[i].id;
          break;
        }
      }
    } else if (message.role === 'assistant') {
      checkpointMessageId = message.id;
    }

    // Restore file checkpoint if one exists
    if (checkpointMessageId) {
      bridge.restoreFileCheckpoint(checkpointMessageId).catch((err) => {
        console.error('[Webview] File checkpoint restore failed:', err);
      });
    }

    // Fade out messages after this point
    setRestoredAtMessageId(messageId);
  }, []);

  // Edit message and continue — truncates messages after this one and resends
  const handleEditMessageAndContinue = useCallback(async (messageId: string, newContent: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Truncate everything from this message onwards
    if (messageIndex > 0) {
      useAgentStore.getState().truncateAfterMessage(currentMessages[messageIndex - 1].id);
    } else {
      useAgentStore.getState().clearMessages();
    }

    setRestoredAtMessageId(null);
    await handleSendMessage(newContent);
  }, [handleSendMessage]);

  // New chat on current branch
  const handleNewChat = useCallback(() => {
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    const branch = currentBranch || 'main';
    const newChat = useChatSessionStore.getState().createChat(branch, 'New Chat');
    useAgentStore.getState().clearMessages();
    bridge.switchChatSession(newChat.id);
  }, [bridge, currentBranch]);

  // Switch to an existing chat
  const handleSwitchChat = useCallback((chatId: string) => {
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    const targetChat = useChatSessionStore.getState().sessions[chatId];
    if (targetChat) {
      useAgentStore.getState().setMessages(targetChat.messages);
      useChatSessionStore.getState().setActiveChatId(chatId);
      bridge.switchChatSession(chatId, targetChat.claudeSessionId);
    }
  }, [bridge]);

  // Delete a chat tab
  const handleDeleteChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    const branch = currentBranch || 'main';
    const branchChats = store.getChatsForBranch(branch);

    if (branchChats.length <= 1) {
      const newChat = store.createChat(branch, 'Chat 1');
      useAgentStore.getState().clearMessages();
      bridge.switchChatSession(newChat.id);
      store.deleteChat(chatId);
    } else {
      if (store.activeChatId === chatId) {
        const otherChat = branchChats.find((c) => c.id !== chatId);
        if (otherChat) {
          useAgentStore.getState().setMessages(otherChat.messages);
          store.setActiveChatId(otherChat.id);
          bridge.switchChatSession(otherChat.id);
        }
      }
      store.deleteChat(chatId);
    }
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
      <ChatTabs
        currentBranch={currentBranch}
        onSwitchChat={handleSwitchChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          currentToolCall={currentToolCall}
          fileTree={fileTree}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onRestoreToMessage={handleRestoreToMessage}
          onEditMessageAndContinue={handleEditMessageAndContinue}
          restoredAtMessageId={restoredAtMessageId}
          onReadFile={(path) => bridge.readFile(path)}
          onImplementPlan={handleImplementPlan}
          onModelChange={(model) => bridge.setModel(model)}
        />
      </div>
    </div>
  );
}
