import React, { useEffect, useState, useCallback } from 'react';
import {
  ChatInterface,
  useAgentStore,
  useUIStore,
  useChatSessionStore,
  executeCommand,
  getModeFlags,
  configureStorage,
} from '@claude-agent/ui';
import type { Message, FileNode, ContextItem } from '@claude-agent/core';
import { useBridge } from './bridge/context';
import { ChatTabs } from './ChatTabs';
import { vscodeStorage } from './bridge/vscode-bridge';

// Configure Zustand persistence to use VS Code webview state (survives reloads)
configureStorage(vscodeStorage);

export default function App() {
  const bridge = useBridge();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<{ messages: Message[]; headHash: string } | null>(null);
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

  // Initialize: wait for extension host to be ready via init:state event
  useEffect(() => {
    const cleanup = bridge.onInitState(async (state: any) => {
      try {
        const branchName = state.branch || 'main';
        setCurrentBranch(branchName);

        // Restore last active chat, or pick first for branch, or create new
        const store = useChatSessionStore.getState();
        const persistedId = store.activeChatId;
        const branchChats = store.getChatsForBranch(branchName);
        let chat;
        if (persistedId && store.sessions[persistedId]) {
          // Restore the last active chat from the persisted store
          chat = store.sessions[persistedId];
        } else if (branchChats.length > 0) {
          chat = branchChats[0];
        } else {
          chat = store.createChat(branchName, 'Chat 1');
        }

        // Fire-and-forget — don't block init on Claude process startup
        // Pass stored Claude session ID for --resume support across reloads
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
        setIsReady(true); // Show UI even on error
      }
    });
    return cleanup;
  }, [bridge]);

  // Set up event listeners
  useEffect(() => {
    const cleanupChunk = bridge.onClaudeChunk((chunk) => {
      const { appendStreamingContent, setCurrentToolCall, setStreaming, clearStreamingContent, addMessage } = useAgentStore.getState();

      if (chunk.type === 'init' && chunk.sessionId) {
        // Persist Claude CLI session ID for resume across reloads
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
      const { clearStreamingContent, setCurrentToolCall, addMessage, setStreaming, updateMessage, streamingContent } = useAgentStore.getState();

      if (!message.content && streamingContent) {
        message.content = streamingContent;
      }

      clearStreamingContent();
      setCurrentToolCall(null);
      addMessage(message);
      setStreaming(false);

      // Auto-create checkpoint after each assistant response
      const currentMessages = useAgentStore.getState().messages;
      const checkpoint = await bridge.createCheckpoint(undefined, undefined, currentMessages, { skipIfEmpty: true });

      const commitHash = checkpoint?.metadata?.commitSha || await bridge.getCurrentGitHead();
      if (commitHash) {
        updateMessage(message.id, { checkpointCommitHash: commitHash });
      }

      // Auto-name the chat session from first user message + AI summary
      const chatId = useChatSessionStore.getState().activeChatId;
      if (chatId) {
        const chat = useChatSessionStore.getState().sessions[chatId];
        if (chat && chat.messages.length === 0) {
          const firstUser = currentMessages.find((m) => m.role === 'user');
          if (firstUser) {
            // Strip <file> tags and extract meaningful text
            const stripped = firstUser.content
              .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
              .replace(/^\n+/, '')
              .trim();
            // Use first line/sentence, capped at 40 chars
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
    setEditSnapshot(null);
    const modeFlags = getModeFlags(useUIStore.getState().mode);

    // Reattach branch if in detached HEAD (fire-and-forget)
    bridge.reattachBranch();

    // Check for slash commands
    if (content.startsWith('/')) {
      const result = executeCommand(content, {
        onClearMessages: () => useAgentStore.getState().clearMessages(),
        onSendMessage: (prompt, options) => {
          bridge.snapshotDirtyFiles(); // fire-and-forget
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
          bridge.snapshotDirtyFiles(); // fire-and-forget
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
    bridge.snapshotDirtyFiles(); // fire-and-forget
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
  }, [bridge, addMessage, setStreaming, addSystemMessage]);

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

  // Restore to message
  const handleRestoreToMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];
    let truncateToId: string | null = null;
    let checkpointHash: string | undefined;

    if (message.role === 'user') {
      if (messageIndex > 0) {
        truncateToId = currentMessages[messageIndex - 1].id;
      }
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'assistant' && currentMessages[i].checkpointCommitHash) {
          checkpointHash = currentMessages[i].checkpointCommitHash;
          break;
        }
      }
    } else if (message.role === 'assistant') {
      truncateToId = message.id;
      checkpointHash = message.checkpointCommitHash;
    }

    if (checkpointHash) {
      await bridge.resetGitToCommit(checkpointHash);
    }

    if (truncateToId) {
      useAgentStore.getState().truncateAfterMessage(truncateToId);
    } else {
      useAgentStore.getState().clearMessages();
    }
  }, [bridge]);

  // Edit message
  const handleEditMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];
    if (message.role !== 'user') return;

    const editContent = message.content;
    const currentHeadHash = await bridge.getCurrentGitHead();
    setEditSnapshot({
      messages: [...currentMessages],
      headHash: currentHeadHash || '',
    });

    let checkpointHash: string | undefined;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (currentMessages[i].role === 'assistant' && currentMessages[i].checkpointCommitHash) {
        checkpointHash = currentMessages[i].checkpointCommitHash;
        break;
      }
    }

    if (checkpointHash) {
      try {
        await bridge.resetGitToCommit(checkpointHash);
      } catch (err) {
        console.error('[Edit] Git reset failed:', err);
      }
    }

    if (messageIndex > 0) {
      useAgentStore.getState().truncateAfterMessage(currentMessages[messageIndex - 1].id);
    } else {
      useAgentStore.getState().clearMessages();
    }

    useAgentStore.getState().setDraftInput(editContent);
  }, [bridge]);

  // Edit message and continue without reverting git
  const handleEditMessageAndContinue = useCallback(async (messageId: string, newContent: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Truncate everything after this message
    if (messageIndex > 0) {
      useAgentStore.getState().truncateAfterMessage(currentMessages[messageIndex - 1].id);
    } else {
      useAgentStore.getState().clearMessages();
    }

    // Send the new content as a fresh message
    await handleSendMessage(newContent);
  }, [handleSendMessage]);

  // Cancel edit
  const handleCancelEdit = useCallback(async () => {
    if (!editSnapshot) return;

    useAgentStore.getState().setMessages(editSnapshot.messages);

    if (editSnapshot.headHash) {
      await bridge.resetGitToCommit(editSnapshot.headHash);
      await bridge.reattachBranch();
    }

    useAgentStore.getState().setDraftInput('');
    setEditSnapshot(null);
  }, [bridge, editSnapshot]);

  // New chat on current branch
  const handleNewChat = useCallback(() => {
    // Save current messages to active chat
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    // Create new chat
    const branch = currentBranch || 'main';
    const chatCount = useChatSessionStore.getState().getChatsForBranch(branch).length;
    const newChat = useChatSessionStore.getState().createChat(branch, 'New Chat');
    // Clear messages
    useAgentStore.getState().clearMessages();
    // Notify extension host
    bridge.switchChatSession(newChat.id);
  }, [bridge, currentBranch]);

  // Switch to an existing chat
  const handleSwitchChat = useCallback((chatId: string) => {
    // Save current messages to active chat
    const currentId = useChatSessionStore.getState().activeChatId;
    if (currentId) {
      useChatSessionStore.getState().saveMessages(currentId, useAgentStore.getState().messages);
    }
    // Load target chat messages
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
          isEditing={!!editSnapshot}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onRestoreToMessage={handleRestoreToMessage}
          onEditMessage={handleEditMessage}
          onEditMessageAndContinue={handleEditMessageAndContinue}
          onCancelEdit={handleCancelEdit}
          onReadFile={(path) => bridge.readFile(path)}
          onImplementPlan={handleImplementPlan}
          onModelChange={(model) => bridge.setModel(model)}
        />
      </div>
    </div>
  );
}
