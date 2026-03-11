import { create } from 'zustand';
import type { Message, ToolCall } from '@claude-agent/core';
import { ChatStreamState, DEFAULT_STREAM_STATE, StreamingBlock } from './types';

// ============================================================================
// Chat Store - Messages and streaming state
// ============================================================================

export interface ChatState {
  messages: Message[];
  // Global streaming state (derived from active chat for backward compat)
  isStreaming: boolean;
  streamingContent: string;
  currentToolCall: ToolCall | null;
  streamingToolCalls: ToolCall[];
  streamingBlocks: StreamingBlock[];
  // Per-chat streaming state
  chatStreams: Record<string, ChatStreamState>;
  activeChatId: string | null;
  updateCount: number;
  draftInput: string;

  // Per-chat streaming actions
  setChatStreaming: (chatId: string, isStreaming: boolean) => void;
  appendChatStreamContent: (chatId: string, content: string) => void;
  setChatToolCall: (chatId: string, toolCall: ToolCall | null) => void;
  addChatStreamingToolCall: (chatId: string, toolCall: ToolCall) => void;
  updateChatStreamingToolCall: (chatId: string, id: string, updates: Partial<ToolCall>) => void;
  clearChatStreamingToolCalls: (chatId: string) => void;
  appendChatStreamBlock: (chatId: string, type: 'text' | 'tool', data: string | ToolCall) => void;
  updateChatStreamToolBlock: (chatId: string, toolId: string, updates: Partial<ToolCall>) => void;
  clearChatStream: (chatId: string) => void;
  getChatStream: (chatId: string | null) => ChatStreamState;
  setActiveChatId: (chatId: string | null) => void;
  handleTextChunk: (chatId: string | undefined, content: string) => void;

  // Backward-compat global streaming actions (operate on activeChatId)
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setStreaming: (isStreaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentToolCall: (toolCall: ToolCall | null) => void;
  addStreamingToolCall: (toolCall: ToolCall) => void;
  updateStreamingToolCall: (id: string, updates: Partial<ToolCall>) => void;
  clearStreamingToolCalls: () => void;
  appendStreamingBlock: (type: 'text' | 'tool', data: string | ToolCall) => void;
  updateStreamingToolBlock: (toolId: string, updates: Partial<ToolCall>) => void;
  clearStreamingBlocks: () => void;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
  truncateAfterMessage: (messageId: string) => void;
  setDraftInput: (content: string) => void;
}

// Helper to get or create chat stream state
function getChatStreamState(chatStreams: Record<string, ChatStreamState>, chatId: string | null): ChatStreamState {
  if (!chatId) return DEFAULT_STREAM_STATE;
  return chatStreams[chatId] || DEFAULT_STREAM_STATE;
}

// Helper to update a specific chat's stream state
function updateChatStream(
  chatStreams: Record<string, ChatStreamState>,
  chatId: string,
  updates: Partial<ChatStreamState>
): Record<string, ChatStreamState> {
  const current = chatStreams[chatId] || { ...DEFAULT_STREAM_STATE };
  return { ...chatStreams, [chatId]: { ...current, ...updates } };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  currentToolCall: null,
  streamingToolCalls: [],
  streamingBlocks: [],
  chatStreams: {},
  activeChatId: null,
  updateCount: 0,
  draftInput: '',

  // --- Per-chat streaming actions ---

  getChatStream: (chatId) => getChatStreamState(get().chatStreams, chatId),

  setActiveChatId: (chatId) =>
    set((state) => {
      const stream = getChatStreamState(state.chatStreams, chatId);
      return {
        activeChatId: chatId,
        // Sync global state to new active chat
        isStreaming: stream.isStreaming,
        streamingContent: stream.streamingContent,
        streamingBlocks: stream.streamingBlocks,
        currentToolCall: stream.currentToolCall,
        streamingToolCalls: stream.streamingToolCalls,
        updateCount: state.updateCount + 1,
      };
    }),

  setChatStreaming: (chatId, isStreaming) =>
    set((state) => {
      const chatStreams = updateChatStream(state.chatStreams, chatId, { isStreaming });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { isStreaming } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  appendChatStreamContent: (chatId, content) =>
    set((state) => {
      const current = getChatStreamState(state.chatStreams, chatId);
      const newContent = current.streamingContent + content;
      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingContent: newContent });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingContent: newContent } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  setChatToolCall: (chatId, toolCall) =>
    set((state) => {
      const chatStreams = updateChatStream(state.chatStreams, chatId, { currentToolCall: toolCall });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { currentToolCall: toolCall } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  addChatStreamingToolCall: (chatId, toolCall) =>
    set((state) => {
      const current = getChatStreamState(state.chatStreams, chatId);
      const newToolCalls = [...current.streamingToolCalls, toolCall];
      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingToolCalls: newToolCalls });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingToolCalls: newToolCalls } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  updateChatStreamingToolCall: (chatId, id, updates) =>
    set((state) => {
      const current = getChatStreamState(state.chatStreams, chatId);
      const newToolCalls = current.streamingToolCalls.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      );
      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingToolCalls: newToolCalls });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingToolCalls: newToolCalls } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  clearChatStreamingToolCalls: (chatId) =>
    set((state) => {
      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingToolCalls: [] });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingToolCalls: [] } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  appendChatStreamBlock: (chatId, type, data) =>
    set((state) => {
      const current = getChatStreamState(state.chatStreams, chatId);
      const blocks = [...current.streamingBlocks];

      if (type === 'text' && typeof data === 'string') {
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + data };
        } else {
          blocks.push({
            type: 'text',
            content: data,
            id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          });
        }
      } else if (type === 'tool' && typeof data !== 'string') {
        blocks.push({
          type: 'tool',
          toolCall: data as ToolCall,
          id: `tool-${(data as ToolCall).id}`,
        });
      }

      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingBlocks: blocks });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingBlocks: blocks } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  updateChatStreamToolBlock: (chatId, toolId, updates) =>
    set((state) => {
      const current = getChatStreamState(state.chatStreams, chatId);
      const blocks = current.streamingBlocks.map((block) => {
        if (block.type === 'tool' && block.toolCall.id === toolId) {
          return { ...block, toolCall: { ...block.toolCall, ...updates } };
        }
        return block;
      });
      const chatStreams = updateChatStream(state.chatStreams, chatId, { streamingBlocks: blocks });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? { streamingBlocks: blocks } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  clearChatStream: (chatId) =>
    set((state) => {
      const chatStreams = updateChatStream(state.chatStreams, chatId, { ...DEFAULT_STREAM_STATE });
      const isActive = chatId === state.activeChatId;
      return {
        chatStreams,
        ...(isActive ? {
          isStreaming: false,
          streamingContent: '',
          streamingBlocks: [],
          currentToolCall: null,
          streamingToolCalls: [],
        } : {}),
        updateCount: state.updateCount + 1,
      };
    }),

  // Batched text chunk handler
  handleTextChunk: (chatId, content) =>
    set((state) => {
      if (chatId) {
        // Per-chat streaming
        const current = getChatStreamState(state.chatStreams, chatId);
        const newContent = current.streamingContent + content;
        const blocks = [...current.streamingBlocks];

        // Update or create text block
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + content };
        } else {
          blocks.push({
            type: 'text',
            content,
            id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          });
        }

        const chatStreams = updateChatStream(state.chatStreams, chatId, {
          isStreaming: true,
          streamingContent: newContent,
          streamingBlocks: blocks,
        });

        const isActive = chatId === state.activeChatId;
        return {
          chatStreams,
          ...(isActive ? {
            isStreaming: true,
            streamingContent: newContent,
            streamingBlocks: blocks,
          } : {}),
          updateCount: state.updateCount + 1,
        };
      } else {
        // Legacy global streaming
        const newContent = state.streamingContent + content;
        const blocks = [...state.streamingBlocks];

        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + content };
        } else {
          blocks.push({
            type: 'text',
            content,
            id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          });
        }

        return {
          isStreaming: true,
          streamingContent: newContent,
          streamingBlocks: blocks,
          updateCount: state.updateCount + 1,
        };
      }
    }),

  // --- Backward-compat global actions ---

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      updateCount: state.updateCount + 1,
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
      updateCount: state.updateCount + 1,
    })),

  setStreaming: (isStreaming) =>
    set((state) => {
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { isStreaming })
        : state.chatStreams;
      return { isStreaming, chatStreams, updateCount: state.updateCount + 1 };
    }),

  appendStreamingContent: (content) =>
    set((state) => {
      const newContent = state.streamingContent + content;
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingContent: newContent })
        : state.chatStreams;
      return { streamingContent: newContent, chatStreams, updateCount: state.updateCount + 1 };
    }),

  clearStreamingContent: () =>
    set((state) => {
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingContent: '' })
        : state.chatStreams;
      return { streamingContent: '', chatStreams, updateCount: state.updateCount + 1 };
    }),

  setCurrentToolCall: (toolCall) =>
    set((state) => {
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { currentToolCall: toolCall })
        : state.chatStreams;
      return { currentToolCall: toolCall, chatStreams, updateCount: state.updateCount + 1 };
    }),

  addStreamingToolCall: (toolCall) =>
    set((state) => {
      const newToolCalls = [...state.streamingToolCalls, toolCall];
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingToolCalls: newToolCalls })
        : state.chatStreams;
      return { streamingToolCalls: newToolCalls, chatStreams, updateCount: state.updateCount + 1 };
    }),

  updateStreamingToolCall: (id, updates) =>
    set((state) => {
      const newToolCalls = state.streamingToolCalls.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      );
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingToolCalls: newToolCalls })
        : state.chatStreams;
      return { streamingToolCalls: newToolCalls, chatStreams, updateCount: state.updateCount + 1 };
    }),

  clearStreamingToolCalls: () =>
    set((state) => {
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingToolCalls: [] })
        : state.chatStreams;
      return { streamingToolCalls: [], chatStreams, updateCount: state.updateCount + 1 };
    }),

  appendStreamingBlock: (type, data) =>
    set((state) => {
      const blocks = [...state.streamingBlocks];

      if (type === 'text' && typeof data === 'string') {
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, content: lastBlock.content + data };
        } else {
          blocks.push({
            type: 'text',
            content: data,
            id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          });
        }
      } else if (type === 'tool' && typeof data !== 'string') {
        blocks.push({
          type: 'tool',
          toolCall: data as ToolCall,
          id: `tool-${(data as ToolCall).id}`,
        });
      }

      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingBlocks: blocks })
        : state.chatStreams;
      return { streamingBlocks: blocks, chatStreams, updateCount: state.updateCount + 1 };
    }),

  updateStreamingToolBlock: (toolId, updates) =>
    set((state) => {
      const blocks = state.streamingBlocks.map((block) => {
        if (block.type === 'tool' && block.toolCall.id === toolId) {
          return { ...block, toolCall: { ...block.toolCall, ...updates } };
        }
        return block;
      });
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingBlocks: blocks })
        : state.chatStreams;
      return { streamingBlocks: blocks, chatStreams, updateCount: state.updateCount + 1 };
    }),

  clearStreamingBlocks: () =>
    set((state) => {
      const chatId = state.activeChatId;
      const chatStreams = chatId
        ? updateChatStream(state.chatStreams, chatId, { streamingBlocks: [] })
        : state.chatStreams;
      return { streamingBlocks: [], chatStreams, updateCount: state.updateCount + 1 };
    }),

  clearMessages: () =>
    set({ messages: [], updateCount: 0 }),

  setMessages: (messages) =>
    set((state) => ({ messages, updateCount: state.updateCount + 1 })),

  truncateAfterMessage: (messageId) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return state;
      return {
        messages: state.messages.slice(0, idx + 1),
        updateCount: state.updateCount + 1,
      };
    }),

  setDraftInput: (content) => set({ draftInput: content }),
}));