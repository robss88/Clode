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
        useAgentStore.getState().setActiveChatId(chat.id);
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

  // Log mode/model changes to debug panel
  useEffect(() => {
    let prevMode = useUIStore.getState().mode;
    let prevModel = useUIStore.getState().model;
    return useUIStore.subscribe((state) => {
      if (state.mode !== prevMode) {
        prevMode = state.mode;
        useAgentStore.getState().pushDebugRawLine({ _event: 'ui:mode-change', mode: state.mode });
      }
      if (state.model !== prevModel) {
        prevModel = state.model;
        useAgentStore.getState().pushDebugRawLine({ _event: 'ui:model-change', model: state.model });
      }
    });
  }, []);

  // Set up event listeners — events are now tagged with chatId from ClaudeService
  useEffect(() => {
    const cleanupChunk = bridge.onClaudeChunk((data: any) => {
      // Capture raw chunk for debug panel
      useAgentStore.getState().pushDebugRawLine(data);

      const chatId = data.chatId as string | undefined;
      const store = useAgentStore.getState();

      if (data.type === 'init') {
        if (data.sessionId) {
          const targetChatId = chatId || useChatSessionStore.getState().activeChatId;
          if (targetChatId) {
            useChatSessionStore.getState().updateChat(targetChatId, { claudeSessionId: data.sessionId });
          }
        }
        // Sync UI state from CLI init event — CLI is the source of truth
        if (data.model) {
          console.log('[Webview] CLI model:', data.model);
        }
        if (data.permissionMode) {
          console.log('[Webview] CLI permission mode:', data.permissionMode);
        }
      } else if (data.type === 'text') {
        store.handleTextChunk(chatId, data.content);
      } else if (data.type === 'tool_call' && data.toolCall) {
        if (chatId) {
          const stream = store.getChatStream(chatId);
          const existingBlock = stream.streamingBlocks.find(
            (b: any) => b.type === 'tool' && b.toolCall.id === data.toolCall.id
          );
          if (existingBlock) {
            store.updateChatStreamToolBlock(chatId, data.toolCall.id, { input: data.toolCall.input });
          } else {
            store.appendChatStreamBlock(chatId, 'tool', data.toolCall);
          }
          store.setChatToolCall(chatId, data.toolCall);
        } else {
          const existingBlock = store.streamingBlocks.find(
            (b) => b.type === 'tool' && b.toolCall.id === data.toolCall.id
          );
          if (existingBlock) {
            store.updateStreamingToolBlock(data.toolCall.id, { input: data.toolCall.input });
          } else {
            store.appendStreamingBlock('tool', data.toolCall);
          }
          store.setCurrentToolCall(data.toolCall);
        }
      } else if (data.type === 'tool_result' && data.toolResult) {
        const resultUpdates = {
          status: (data.toolResult.isError ? 'error' : 'completed') as 'error' | 'completed',
          output: data.toolResult.output,
        };
        if (chatId) {
          store.updateChatStreamToolBlock(chatId, data.toolResult.toolCallId, resultUpdates);
          store.setChatToolCall(chatId, null);
        } else {
          store.updateStreamingToolBlock(data.toolResult.toolCallId, resultUpdates);
          store.setCurrentToolCall(null);
        }
      } else if (data.type === 'complete') {
        if (chatId) {
          store.setChatToolCall(chatId, null);
        } else {
          store.setCurrentToolCall(null);
        }
      }
    });

    const cleanupMessage = bridge.onClaudeMessage(async (data: any) => {
      useAgentStore.getState().pushDebugRawLine({ _event: 'claude:message', ...data });
      const chatId = data.chatId as string | undefined;
      const message = data.message || data; // Handle both tagged and untagged formats
      const store = useAgentStore.getState();
      const activeChatId = useChatSessionStore.getState().activeChatId;

      if (chatId) {
        // Fill in content from streaming if empty
        const stream = store.getChatStream(chatId);
        if (!message.content && stream.streamingContent) {
          message.content = stream.streamingContent;
        }

        // Clear this chat's streaming state
        store.clearChatStream(chatId);
        store.setChatStreaming(chatId, false);

        // Only add to displayed messages if this is the active chat
        if (chatId === activeChatId) {
          store.addMessage(message);
        }

        // Always save to persistent session store
        const chatStore = useChatSessionStore.getState();
        const session = chatStore.sessions[chatId];
        if (session) {
          const msgs = chatId === activeChatId
            ? useAgentStore.getState().messages
            : [...session.messages, message];
          chatStore.saveMessages(chatId, msgs);
        }
      } else {
        // Legacy untagged format
        if (!message.content && store.streamingContent) {
          message.content = store.streamingContent;
        }
        store.clearStreamingContent();
        store.clearStreamingToolCalls();
        store.setCurrentToolCall(null);
        store.addMessage(message);
        store.setStreaming(false);

        if (activeChatId) {
          useChatSessionStore.getState().saveMessages(activeChatId, useAgentStore.getState().messages);
        }
      }

      // Create file checkpoint after each assistant response
      bridge.createFileCheckpoint(message.id).then((created) => {
        if (created) {
          setCheckpointMessageIds((prev) => new Set([...prev, message.id]));
        }
      }).catch((err) => {
        console.error('[Webview] File checkpoint failed:', err);
      });

      // Auto-name the chat session
      const targetChatId = chatId || activeChatId;
      if (targetChatId) {
        const chat = useChatSessionStore.getState().sessions[targetChatId];
        const allMessages = targetChatId === activeChatId
          ? useAgentStore.getState().messages
          : chat?.messages || [];

        if (chat && (chat.name === 'New Chat' || chat.messages.length === 0)) {
          const userMessages = allMessages.filter((m: Message) => m.role === 'user');

          if (userMessages.length > 0) {
            let titleContent = '';
            const firstUser = userMessages[0];
            titleContent = firstUser.content
              .replace(/<file\s+path="[^"]*">\n?[\s\S]*?\n?<\/file>/g, '')
              .replace(/^\n+/, '')
              .trim();

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

            const firstLine = titleContent.split(/[\n.!?]/)[0]?.trim() || titleContent;
            let name = firstLine.slice(0, 50).trim();
            name = name.replace(/^(please |can you |help me |i need |i want )/i, '');
            name = name.replace(/['"]/g, '');
            if (name.length > 0) {
              name = name.charAt(0).toUpperCase() + name.slice(1);
            }
            name = name || 'Chat Session';
            useChatSessionStore.getState().updateChat(targetChatId, { name });
          }
        }
      }
    });

    const cleanupError = bridge.onClaudeError((data: any) => {
      useAgentStore.getState().pushDebugRawLine({ _event: 'claude:error', ...data });
      const chatId = data.chatId as string | undefined;
      const error = data.error || data; // Handle both tagged and untagged

      if (typeof error === 'string' && error.startsWith('[Debug]')) return;

      const store = useAgentStore.getState();
      if (chatId) {
        store.setChatStreaming(chatId, false);
        store.clearChatStream(chatId);
      } else {
        store.setStreaming(false);
      }

      // Show error to user as system message (only for active chat)
      const activeChatId = useChatSessionStore.getState().activeChatId;
      if (!chatId || chatId === activeChatId) {
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${typeof error === 'string' ? error : error?.message || String(error)}`,
          timestamp: Date.now(),
        };
        store.addMessage(errorMsg);
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
          onModelChange={(model) => {
            useUIStore.getState().setModel(model);
            bridge.setModel(model);
          }}
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

      {/* Debug Raw Output Panel */}
      <DebugRawPanel />
    </div>
  );
}

function DebugRawPanel() {
  const { showDebugPanel, toggleDebugPanel } = useUIStore();
  const debugRawLines = useAgentStore((s) => s.debugRawLines);
  const clearDebugRawLines = useAgentStore((s) => s.clearDebugRawLines);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (showDebugPanel && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [debugRawLines, showDebugPanel]);

  return (
    <>
      {/* Toggle button — fixed bottom-right */}
      <button
        type="button"
        onClick={toggleDebugPanel}
        className="fixed bottom-2 right-2 z-50 w-7 h-7 flex items-center justify-center rounded bg-background-tertiary border border-border text-foreground-muted hover:text-foreground text-[10px] font-mono transition-colors"
        title="Toggle raw CLI output"
      >
        {showDebugPanel ? '×' : '{}'}
      </button>

      {/* Panel */}
      {showDebugPanel && (
        <div className="fixed inset-x-0 bottom-0 z-40 h-[40vh] flex flex-col bg-[#0d0d0d] border-t border-border">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[11px]">
            <span className="text-foreground-muted font-mono">Raw CLI Output ({debugRawLines.length} chunks)</span>
            <button
              type="button"
              onClick={clearDebugRawLines}
              className="text-foreground-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          </div>
          <div ref={panelRef} className="flex-1 overflow-y-auto font-mono text-[11px] p-2 space-y-px">
            {debugRawLines.length === 0 ? (
              <div className="text-foreground-muted/50 text-center py-4">No output yet. Send a message to see raw CLI chunks.</div>
            ) : (
              debugRawLines.map((line, i) => {
                const ts = new Date(line.timestamp).toISOString().slice(11, 23);
                const type = line.data?.type || '?';
                return (
                  <div key={i} className="flex gap-2 hover:bg-white/5 px-1 rounded">
                    <span className="text-foreground-muted/40 flex-shrink-0 select-none">{ts}</span>
                    <span className="text-accent flex-shrink-0">{type}</span>
                    <span className="text-foreground-muted whitespace-pre-wrap break-all">
                      {JSON.stringify(line.data, null, 0).slice(0, 500)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
