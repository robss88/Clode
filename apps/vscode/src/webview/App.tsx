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
import { useCallback, useEffect, useState, useRef } from 'react';
import { useBridge } from './bridge/context';
import { vscodeStorage } from './bridge/vscode-bridge';
import { ChatTabs } from './ChatTabs';
import { CommandPalette, CommandItem } from '@claude-agent/ui';
import { Settings } from '@claude-agent/ui';
import { Bot, Map, MessageCircle, Zap, Cpu, FileText, Brain } from 'lucide-react';

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
      const {
        appendStreamingContent, setCurrentToolCall, setStreaming,
        clearStreamingContent, addMessage,
        addStreamingToolCall, updateStreamingToolCall,
      } = useAgentStore.getState();

      if (chunk.type === 'init' && chunk.sessionId) {
        const chatId = useChatSessionStore.getState().activeChatId;
        if (chatId) {
          useChatSessionStore.getState().updateChat(chatId, { claudeSessionId: chunk.sessionId });
        }
      } else if (chunk.type === 'text') {
        appendStreamingContent(chunk.content);
        setCurrentToolCall(null);
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        // Check if this is an update to an existing tool call (input arriving later)
        const existing = useAgentStore.getState().streamingToolCalls.find(
          (t) => t.id === chunk.toolCall.id
        );
        if (existing) {
          updateStreamingToolCall(chunk.toolCall.id, { input: chunk.toolCall.input });
        } else {
          addStreamingToolCall(chunk.toolCall);
        }
        setCurrentToolCall(chunk.toolCall);
      } else if (chunk.type === 'tool_result' && chunk.toolResult) {
        // Update the matching tool call with its result status and output
        updateStreamingToolCall(chunk.toolResult.toolCallId, {
          status: chunk.toolResult.isError ? 'error' : 'completed',
          output: chunk.toolResult.output,
        });
        setCurrentToolCall(null);
      } else if (chunk.type === 'complete') {
        // Just clean up streaming state — the 'message' event handler
        // will add the final message with its proper ID (used for checkpoints)
        setCurrentToolCall(null);
      }
    });

    const cleanupMessage = bridge.onClaudeMessage(async (message) => {
      const { clearStreamingContent, setCurrentToolCall, addMessage, setStreaming, streamingContent, clearStreamingToolCalls } = useAgentStore.getState();

      if (!message.content && streamingContent) {
        message.content = streamingContent;
      }

      clearStreamingContent();
      clearStreamingToolCalls();
      setCurrentToolCall(null);
      addMessage(message);
      setStreaming(false);

      // Create file checkpoint after each assistant response (only if files were modified)
      bridge.createFileCheckpoint(message.id).then((created) => {
        if (created) {
          setCheckpointMessageIds((prev) => new Set([...prev, message.id]));
        }
      }).catch((err) => {
        console.error('[Webview] File checkpoint failed:', err);
      });

      // Auto-name the chat session
      const chatId = useChatSessionStore.getState().activeChatId;
      if (chatId) {
        const chat = useChatSessionStore.getState().sessions[chatId];
        const allMessages = useAgentStore.getState().messages;

        // Update name if it's still "New Chat" or if this is the first message
        if (chat && (chat.name === 'New Chat' || chat.messages.length === 0)) {
          const userMessages = allMessages.filter((m: Message) => m.role === 'user');

          // Update title based on first user message or after 2-3 exchanges
          if (userMessages.length > 0) {
            let titleContent = '';

            // Use first user message primarily
            const firstUser = userMessages[0];
            titleContent = firstUser.content
              .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
              .replace(/^\n+/, '')
              .trim();

            // If we have multiple messages and first was short, consider combining
            if (titleContent.length < 20 && userMessages.length > 1) {
              const secondUser = userMessages[1];
              const secondContent = secondUser.content
                .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
                .replace(/^\n+/, '')
                .trim();
              if (secondContent.length > titleContent.length) {
                titleContent = secondContent;
              }
            }

            // Extract a clean title
            const firstLine = titleContent.split(/[\n.!?]/)[0]?.trim() || titleContent;
            let name = firstLine.slice(0, 50).trim();

            // Clean up common patterns
            name = name.replace(/^(please |can you |help me |i need |i want )/i, '');
            name = name.replace(/['"]/g, '');

            // Capitalize first letter
            if (name.length > 0) {
              name = name.charAt(0).toUpperCase() + name.slice(1);
            }

            // Final fallback
            name = name || 'Chat Session';

            useChatSessionStore.getState().updateChat(chatId, { name });
          }
        }

        useChatSessionStore.getState().saveMessages(chatId, useAgentStore.getState().messages);
      }
    });

    const cleanupError = bridge.onClaudeError((error) => {
      if (!error.startsWith('[Debug]')) {
        useAgentStore.getState().setStreaming(false);
        // Show error to user as a system message
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${error}`,
          timestamp: Date.now(),
        };
        useAgentStore.getState().addMessage(errorMsg);
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

  // Command Palette commands
  const commands: CommandItem[] = [
    // Mode commands
    {
      id: 'mode-ask',
      label: 'Ask Mode',
      description: 'Conversation only, no file changes',
      icon: <MessageCircle className="w-4 h-4" />,
      keywords: ['mode', 'chat', 'talk'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('ask'),
    },
    {
      id: 'mode-plan',
      label: 'Plan Mode',
      description: 'Explore code and create implementation plans',
      icon: <Map className="w-4 h-4" />,
      keywords: ['mode', 'plan', 'design'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('plan'),
    },
    {
      id: 'mode-agent',
      label: 'Agent Mode',
      description: 'Full autonomous agent with all tools',
      icon: <Bot className="w-4 h-4" />,
      keywords: ['mode', 'agent', 'auto'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('agent'),
    },
    {
      id: 'mode-yolo',
      label: 'YOLO Mode',
      description: 'Full autonomy, no guardrails',
      icon: <Zap className="w-4 h-4" />,
      keywords: ['mode', 'yolo', 'fast'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('yolo'),
    },
    // Model commands
    {
      id: 'model-sonnet',
      label: 'Sonnet',
      description: 'Switch to Claude Sonnet (fast & capable)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'sonnet'],
      category: 'model',
      action: () => bridge.setModel('sonnet'),
    },
    {
      id: 'model-opus',
      label: 'Opus',
      description: 'Switch to Claude Opus (most powerful)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'opus'],
      category: 'model',
      action: () => bridge.setModel('opus'),
    },
    {
      id: 'model-haiku',
      label: 'Haiku',
      description: 'Switch to Claude Haiku (fastest & cheapest)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'haiku'],
      category: 'model',
      action: () => bridge.setModel('haiku'),
    },
    // Action commands
    {
      id: 'clear-chat',
      label: 'Clear Conversation',
      description: 'Clear all messages in current chat',
      icon: <FileText className="w-4 h-4" />,
      keywords: ['clear', 'reset', 'delete'],
      category: 'action',
      action: () => useAgentStore.getState().clearMessages(),
    },
    {
      id: 'toggle-thinking',
      label: 'Toggle Extended Thinking',
      description: 'Enable/disable extended reasoning mode',
      icon: <Brain className="w-4 h-4" />,
      keywords: ['thinking', 'reasoning', 'extended'],
      category: 'action',
      action: () => {
        const current = useUIStore.getState().extendedThinking;
        useUIStore.getState().setExtendedThinking(!current);
      },
    },
    // Settings
    {
      id: 'open-settings',
      label: 'Settings',
      description: 'Open settings panel',
      icon: <FileText className="w-4 h-4" />,
      keywords: ['settings', 'config', 'preferences'],
      category: 'settings',
      action: () => useUIStore.getState().toggleSettings(),
    },
  ];

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
    // If streaming, queue the message instead
    if (isStreaming) {
      // Use ref for immediate update without React batching
      messageQueueRef.current.push({ content, context });

      // Add the user message to the UI immediately so user sees it was queued
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now(),
        context: context && context.length > 0 ? context : undefined,
      };
      addMessage(userMessage);

      // Trigger queue processing check
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
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
      context: context && context.length > 0 ? context : undefined,
    };
    addMessage(userMessage);
    updateChatTitle(); // Update title after user message
    const currentModel = useUIStore.getState().model;
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
  const handleEditMessageAndContinue = useCallback(async (messageId: string, newContent: string) => {
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
    await handleSendMessage(newContent);
  }, [handleSendMessage, bridge]);

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

  // Close a chat tab (hide it, don't delete)
  const handleCloseChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    const branch = currentBranch || 'main';
    const openChats = store.getChatsForBranch(branch); // Only returns open chats now

    // Close the chat (mark as closed, don't delete)
    store.closeChat(chatId);

    // If this was the active chat, switch to another open one
    if (store.activeChatId === chatId) {
      if (openChats.length > 1) {
        const otherChat = openChats.find((c) => c.id !== chatId);
        if (otherChat) {
          useAgentStore.getState().setMessages(otherChat.messages);
          store.setActiveChatId(otherChat.id);
          bridge.switchChatSession(otherChat.id, otherChat.claudeSessionId);
        }
      } else {
        // No other open chats, create a new one
        const newChat = store.createChat(branch, 'New Chat');
        useAgentStore.getState().clearMessages();
        bridge.switchChatSession(newChat.id);
      }
    }
  }, [bridge, currentBranch]);

  // Reopen a closed chat
  const handleReopenChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    store.openChat(chatId);

    // Switch to the reopened chat
    const chat = store.sessions[chatId];
    if (chat) {
      useAgentStore.getState().setMessages(chat.messages);
      store.setActiveChatId(chatId);
      bridge.switchChatSession(chatId, chat.claudeSessionId);
    }
  }, [bridge]);

  // Permanently delete a chat
  const handlePermanentlyDeleteChat = useCallback((chatId: string) => {
    const store = useChatSessionStore.getState();
    const branch = currentBranch || 'main';

    // If deleting active chat, switch first
    if (store.activeChatId === chatId) {
      const openChats = store.getChatsForBranch(branch);
      const otherChat = openChats.find((c) => c.id !== chatId);
      if (otherChat) {
        useAgentStore.getState().setMessages(otherChat.messages);
        store.setActiveChatId(otherChat.id);
        bridge.switchChatSession(otherChat.id, otherChat.claudeSessionId);
      } else {
        const newChat = store.createChat(branch, 'New Chat');
        useAgentStore.getState().clearMessages();
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
      <ChatTabs
        currentBranch={currentBranch}
        onSwitchChat={handleSwitchChat}
        onNewChat={handleNewChat}
        onCloseChat={handleCloseChat}
        onReopenChat={handleReopenChat}
        onPermanentlyDeleteChat={handlePermanentlyDeleteChat}
      />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          currentToolCall={currentToolCall}
          fileTree={fileTree}
          checkpointMessageIds={checkpointMessageIds}
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
    </div>
  );
}
