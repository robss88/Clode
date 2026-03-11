import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { ChatSession, Message } from '@claude-agent/core';
import { createStorage } from './storage';

// ============================================================================
// Chat Session Store - Multi-chat session management
// ============================================================================

export interface ChatSessionState {
  sessions: Record<string, ChatSession>;
  activeChatId: string | null;
  closedChatIds: string[];

  // Session management
  createChat: (branchName: string, name?: string) => ChatSession;
  updateChat: (id: string, updates: Partial<ChatSession>) => void;
  deleteChat: (id: string) => void;
  setActiveChatId: (id: string | null) => void;

  // Message management
  saveMessages: (chatId: string, messages: Message[]) => void;

  // Tab management
  closeChat: (id: string) => void;
  openChat: (id: string) => void;
  permanentlyDeleteChat: (id: string) => void;

  // Queries
  getChatsForBranch: (branchName: string) => ChatSession[];
  getClosedChatsForBranch: (branchName: string) => ChatSession[];
}

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeChatId: null,
      closedChatIds: [],

      createChat: (branchName, name = 'New Chat') => {
        const id = nanoid(12);
        const chat: ChatSession = {
          id,
          name,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          branchName,
        };
        set((state) => ({
          sessions: { ...state.sessions, [id]: chat },
          activeChatId: id,
          closedChatIds: state.closedChatIds.filter(cid => cid !== id),
        }));
        return chat;
      },

      updateChat: (id, updates) =>
        set((state) => {
          if (!state.sessions[id]) return state;
          return {
            sessions: {
              ...state.sessions,
              [id]: { ...state.sessions[id], ...updates, updatedAt: Date.now() },
            },
          };
        }),

      deleteChat: (id) =>
        set((state) => {
          const { [id]: deleted, ...rest } = state.sessions;
          return {
            sessions: rest,
            activeChatId: state.activeChatId === id ? null : state.activeChatId,
            closedChatIds: state.closedChatIds.filter(cid => cid !== id),
          };
        }),

      setActiveChatId: (id) => set({ activeChatId: id }),

      saveMessages: (chatId, messages) =>
        set((state) => {
          if (!state.sessions[chatId]) return state;
          return {
            sessions: {
              ...state.sessions,
              [chatId]: {
                ...state.sessions[chatId],
                messages,
                updatedAt: Date.now(),
              },
            },
          };
        }),

      closeChat: (id) =>
        set((state) => {
          if (!state.sessions[id]) return state;
          return {
            closedChatIds: [...state.closedChatIds, id],
          };
        }),

      openChat: (id) =>
        set((state) => ({
          closedChatIds: state.closedChatIds.filter((cid) => cid !== id),
        })),

      permanentlyDeleteChat: (id) =>
        set((state) => {
          const { [id]: deleted, ...rest } = state.sessions;
          return {
            sessions: rest,
            activeChatId: state.activeChatId === id ? null : state.activeChatId,
            closedChatIds: state.closedChatIds.filter((cid) => cid !== id),
          };
        }),

      getChatsForBranch: (branchName) => {
        const state = get();
        return Object.values(state.sessions)
          .filter(chat => chat.branchName === branchName && !state.closedChatIds.includes(chat.id))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },

      getClosedChatsForBranch: (branchName) => {
        const state = get();
        return Object.values(state.sessions)
          .filter(chat => chat.branchName === branchName && state.closedChatIds.includes(chat.id))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
    }),
    {
      name: 'claude-agent-chat-sessions',
      storage: createStorage(),
    }
  )
);