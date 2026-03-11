import { useEffect } from 'react';
import type { Message } from '@claude-agent/core';
import { useAgentStore, useChatSessionStore, useUIStore } from '@claude-agent/ui';
import { useBridge } from '../bridge/context';

interface EventHandlersProps {
  onCheckpointCreated: (messageId: string) => void;
}

export function EventHandlers({ onCheckpointCreated }: EventHandlersProps) {
  const bridge = useBridge();

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

  // Set up Claude event listeners
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
          onCheckpointCreated(message.id);
        }
      }).catch((err) => {
        console.error('[Webview] File checkpoint failed:', err);
      });

      // Auto-name the chat session
      updateChatTitle(chatId || activeChatId);
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
  }, [bridge, onCheckpointCreated]);

  return null;
}

// Helper function to auto-name chat based on first user message
function updateChatTitle(targetChatId: string | null) {
  if (!targetChatId) return;

  const chat = useChatSessionStore.getState().sessions[targetChatId];
  if (!chat) return;

  const allMessages = targetChatId === useChatSessionStore.getState().activeChatId
    ? useAgentStore.getState().messages
    : chat.messages || [];

  if (chat.name === 'New Chat' || chat.messages.length === 0) {
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