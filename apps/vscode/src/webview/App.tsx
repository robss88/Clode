import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ChatInterface,
  CommitTimeline,
  useAgentStore,
  useUIStore,
  useChatSessionStore,
  executeCommand,
  getModeFlags,
} from '@claude-agent/ui';
import type { Message, FileNode, GitBranch, GitCommit } from '@claude-agent/core';
import { MessageSquare, GitCommitHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useBridge } from './bridge/context';

export default function App() {
  const bridge = useBridge();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [editSnapshot, setEditSnapshot] = useState<{ messages: Message[]; headHash: string } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [currentHead, setCurrentHead] = useState<string | null>(null);
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
    } catch (err) {
      console.error('[Webview] refreshBranches failed:', err);
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
  const handleSendMessage = useCallback(async (content: string) => {
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
          useUIStore.getState().setMode(mode as 'agent' | 'plan' | 'chat');
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
    };
    addMessage(userMessage);
    bridge.sendMessage(content, {
      extraFlags: modeFlags.length > 0 ? modeFlags : undefined,
    });
  }, [bridge, addMessage, setStreaming, addSystemMessage]);

  // Implement plan
  const handleImplementPlan = useCallback(async (planContent: string) => {
    useUIStore.getState().setMode('agent');
    addSystemMessage('Switching to Agent mode to implement plan...');
    await handleSendMessage('Implement the following plan:\n\n' + planContent);
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

  // Auto-refresh when switching to Git tab
  useEffect(() => {
    if (activeTab === 'git') {
      refreshCommits();
      refreshBranches();
    }
  }, [activeTab, refreshCommits, refreshBranches]);

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
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <CommitTimeline
              commits={commits}
              currentBranch={currentBranch}
              currentCommitHash={currentHead}
              onCheckoutCommit={handleCheckoutCommit}
              onPreviewCommit={handlePreviewCommit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
