import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChatInterface,
  GitPanel,
  useAgentStore,
  useUIStore,
  useChatSessionStore,
  executeCommand,
  getModeFlags,
  configureStorage,
} from '@claude-agent/ui';
import type { Message, FileNode, GitBranch, GitCommit, GitStatus, ContextItem } from '@claude-agent/core';
import { MessageSquare, GitCommitHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useBridge } from './bridge/context';
import { ChatSessionDropdown } from './ChatSessionDropdown';
import { vscodeStorage } from './bridge/vscode-bridge';

// Configure Zustand persistence to use VS Code webview state (survives reloads)
configureStorage(vscodeStorage);

export default function App() {
  const bridge = useBridge();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<{ messages: Message[]; headHash: string } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [currentHead, setCurrentHead] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'git'>('chat');

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

  // Refresh git state
  const refreshCommits = useCallback(async () => {
    try {
      const commitList = await bridge.listGitCommits();
      setCommits(commitList);
      const head = await bridge.getCurrentGitHead();
      setCurrentHead(head || null);
    } catch (err) {
      console.error('[Webview] refreshCommits failed:', err);
    }
  }, [bridge]);

  const refreshBranches = useCallback(async () => {
    try {
      const branch = await bridge.getCurrentGitBranch();
      setCurrentBranch(branch || null);
      const branchList = await bridge.listGitBranches();
      setBranches(branchList);
    } catch (err) {
      console.error('[Webview] refreshBranches failed:', err);
    }
  }, [bridge]);

  const refreshGitStatus = useCallback(async () => {
    try {
      const status = await bridge.getGitStatus();
      setGitStatus(status);
    } catch (err) {
      console.error('[Webview] refreshGitStatus failed:', err);
    }
  }, [bridge]);

  // Initialize: wait for extension host to be ready via init:state event
  useEffect(() => {
    const cleanup = bridge.onInitState(async (state: any) => {
      try {
        const branchName = state.branch || 'main';
        setCurrentBranch(branchName);

        // Find or create a chat session for the current branch
        const store = useChatSessionStore.getState();
        const branchChats = store.getChatsForBranch(branchName);
        let chat;
        if (branchChats.length > 0) {
          chat = branchChats[0];
        } else {
          chat = store.createChat(branchName, 'Chat 1');
        }

        // Fire-and-forget — don't block init on Claude process startup
        bridge.startClaude(chat.id);

        // Restore messages from the active chat
        if (chat.messages.length > 0) {
          useAgentStore.getState().setMessages(chat.messages);
        }
        useChatSessionStore.getState().setActiveChatId(chat.id);

        // Load file tree for @ mentions
        const tree = await bridge.getFileTree();
        setFileTree(tree);

        setIsReady(true);

        // Fetch initial git state (fire-and-forget, don't block init)
        refreshCommits();
      } catch (err) {
        console.error('[Webview] Init failed:', err);
        setIsReady(true); // Show UI even on error
      }
    });
    return cleanup;
  }, [bridge, refreshCommits]);

  // Set up event listeners
  useEffect(() => {
    const cleanupChunk = bridge.onClaudeChunk((chunk) => {
      const { appendStreamingContent, setCurrentToolCall, setStreaming, clearStreamingContent, addMessage } = useAgentStore.getState();

      if (chunk.type === 'text') {
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

      // Auto-name the chat session
      const chatId = useChatSessionStore.getState().activeChatId;
      if (chatId) {
        const chat = useChatSessionStore.getState().sessions[chatId];
        if (chat && chat.messages.length === 0) {
          const firstUser = currentMessages.find((m) => m.role === 'user');
          if (firstUser) {
            const name = firstUser.content.slice(0, 50).trim() || 'New Chat';
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

    const cleanupCheckpoint = bridge.onCheckpointCreated(() => {
      refreshCommits();
      refreshBranches();
    });

    const cleanupCheckpointRestored = bridge.onCheckpointRestored(() => {
      refreshCommits();
      refreshBranches();
    });

    return () => {
      cleanupChunk();
      cleanupMessage();
      cleanupError();
      cleanupCheckpoint();
      cleanupCheckpointRestored();
    };
  }, [bridge, refreshCommits, refreshBranches]);

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

  // Git tab handlers
  const handleCheckoutCommit = useCallback(async (commitHash: string) => {
    await bridge.checkoutGitCommit(commitHash);
    await refreshCommits();
  }, [bridge, refreshCommits]);

  const handlePreviewCommit = useCallback(async (_commitHash: string) => {
    // No-op for MVP — could open a VS Code diff editor in the future
  }, []);

  const handleSwitchBranch = useCallback(async (branchName: string) => {
    await bridge.switchGitBranch(branchName);
    await refreshBranches();
    await refreshCommits();
  }, [bridge, refreshBranches, refreshCommits]);

  const handleCreateBranch = useCallback(async (name: string) => {
    await bridge.createGitBranch(name);
    await refreshBranches();
    await refreshCommits();
  }, [bridge, refreshBranches, refreshCommits]);

  const handlePushToRemote = useCallback(async () => {
    await bridge.pushToRemote();
    await refreshGitStatus();
  }, [bridge, refreshGitStatus]);

  const handleCommitAll = useCallback(async (message: string) => {
    await bridge.gitCommitAll(message);
    await refreshCommits();
    await refreshGitStatus();
  }, [bridge, refreshCommits, refreshGitStatus]);

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
    const newChat = useChatSessionStore.getState().createChat(branch, `Chat ${chatCount + 1}`);
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
      bridge.switchChatSession(chatId);
    }
  }, [bridge]);

  // Auto-refresh when switching to Git tab
  useEffect(() => {
    if (activeTab === 'git') {
      refreshCommits();
      refreshBranches();
      refreshGitStatus();
    }
  }, [activeTab, refreshCommits, refreshBranches, refreshGitStatus]);

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
      {/* Tab Switcher */}
      <div className="flex border-b border-border flex-shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'chat'
              ? 'text-accent border-b-2 border-accent'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('git')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'git'
              ? 'text-accent border-b-2 border-accent'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <GitCommitHorizontal className="w-3.5 h-3.5" />
          Git
          {commits.length > 0 && (
            <span className="text-[10px] bg-surface-hover rounded-full px-1.5">{commits.length}</span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <div className="flex flex-col h-full overflow-hidden">
            <ChatSessionDropdown
              currentBranch={currentBranch}
              onSwitchChat={handleSwitchChat}
              onNewChat={handleNewChat}
            />
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
            onCancelEdit={handleCancelEdit}
            onReadFile={(path) => bridge.readFile(path)}
            onImplementPlan={handleImplementPlan}
            onModelChange={(model) => bridge.setModel(model)}
          />
          </div>
        ) : (
          <GitPanel
            branches={branches}
            commits={commits}
            currentBranch={currentBranch}
            currentCommitHash={currentHead}
            gitStatus={gitStatus}
            onSwitchBranch={handleSwitchBranch}
            onCreateBranch={handleCreateBranch}
            onCheckoutCommit={handleCheckoutCommit}
            onPreviewCommit={handlePreviewCommit}
            onPushToRemote={handlePushToRemote}
            onCommitAll={handleCommitAll}
            onRefreshStatus={refreshGitStatus}
          />
        )}
      </div>
    </div>
  );
}
