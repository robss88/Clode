import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type {
  Message,
  Checkpoint,
  ChatSession,
  Project,
  ToolCall,
  Session,
} from '@claude-agent/core';

// ============================================================================
// Configurable Storage Backend
// ============================================================================
// Defaults to a safe no-op. Call `configureStorage()` before the first render
// to set the real backend (e.g. vscodeStorage for VS Code webviews).

let _storageBackend: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const storageProxy: StateStorage = {
  getItem: (name) => _storageBackend.getItem(name),
  setItem: (name, value) => _storageBackend.setItem(name, value),
  removeItem: (name) => _storageBackend.removeItem(name),
};

/**
 * Set the storage backend for all persisted Zustand stores and re-hydrate.
 * Must be called before the first React render.
 */
export function configureStorage(storage: StateStorage) {
  _storageBackend = storage;
  // Re-hydrate every persisted store from the new backend
  useChatSessionStore.persist.rehydrate();
  useUIStore.persist.rehydrate();
  useProjectStore.persist.rehydrate();
}

// ============================================================================
// Shared Types
// ============================================================================

export type AgentMode = 'ask' | 'plan' | 'agent' | 'yolo';

// Streaming block types for interleaved content
export type StreamingBlock =
  | { type: 'text'; content: string; id: string }
  | { type: 'tool'; toolCall: ToolCall; id: string };

// Per-chat streaming state
export interface ChatStreamState {
  isStreaming: boolean;
  streamingContent: string;
  streamingBlocks: StreamingBlock[];
  currentToolCall: ToolCall | null;
  streamingToolCalls: ToolCall[];
}

const DEFAULT_STREAM_STATE: ChatStreamState = {
  isStreaming: false,
  streamingContent: '',
  streamingBlocks: [],
  currentToolCall: null,
  streamingToolCalls: [],
};

// ============================================================================
// Agent Store - Chat and Claude Code state
// ============================================================================

export interface AgentState {
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

// Helper to sync global state from active chat's stream
function syncGlobalFromChat(state: any, chatId: string | null): any {
  const stream = getChatStreamState(state.chatStreams, chatId);
  return {
    isStreaming: stream.isStreaming,
    streamingContent: stream.streamingContent,
    streamingBlocks: stream.streamingBlocks,
    currentToolCall: stream.currentToolCall,
    streamingToolCalls: stream.streamingToolCalls,
  };
}

export const useAgentStore = create<AgentState>((set, get) => ({
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

  // --- Backward-compat global actions (operate on activeChatId) ---

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
        ? updateChatStream(state.chatStreams, chatId, { ...DEFAULT_STREAM_STATE })
        : state.chatStreams;
      return {
        streamingBlocks: [],
        streamingContent: '',
        streamingToolCalls: [],
        currentToolCall: null,
        chatStreams,
        updateCount: state.updateCount + 1,
      };
    }),

  clearMessages: () =>
    set((state) => ({
      messages: [],
      streamingContent: '',
      streamingToolCalls: [],
      streamingBlocks: [],
      currentToolCall: null,
      isStreaming: false,
      updateCount: state.updateCount + 1,
    })),

  setMessages: (messages) =>
    set((state) => ({ messages, updateCount: state.updateCount + 1 })),

  truncateAfterMessage: (messageId) =>
    set((state) => {
      const index = state.messages.findIndex((m) => m.id === messageId);
      if (index === -1) return state;
      return {
        messages: state.messages.slice(0, index + 1),
        updateCount: state.updateCount + 1,
      };
    }),

  setDraftInput: (content) =>
    set((state) => ({
      draftInput: content,
      updateCount: state.updateCount + 1,
    })),
}));

// ============================================================================
// Session Store - Session management (one branch per session)
// ============================================================================

export interface SessionState {
  sessions: Session[];
  currentSession: Session | null;

  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: null,

  setSessions: (sessions) => set({ sessions }),

  setCurrentSession: (currentSession) => set({ currentSession }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      currentSession: session,
    })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
      currentSession:
        state.currentSession?.id === id
          ? { ...state.currentSession, ...updates }
          : state.currentSession,
    })),
}));

// ============================================================================
// Checkpoint Store - Checkpoint management state (simplified)
// ============================================================================

export interface CheckpointState {
  checkpoints: Checkpoint[];
  currentId: string | null;
  previewId: string | null;
  canGoForward: boolean;
  canGoBack: boolean;
  currentBranch: string | null;

  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  setCurrentId: (id: string | null) => void;
  setPreviewId: (id: string | null) => void;
  setNavigation: (canGoForward: boolean, canGoBack: boolean) => void;
  setCurrentBranch: (branch: string | null) => void;
  addCheckpoint: (checkpoint: Checkpoint) => void;
  removeCheckpoint: (id: string) => void;
}

export const useCheckpointStore = create<CheckpointState>((set) => ({
  checkpoints: [],
  currentId: null,
  previewId: null,
  canGoForward: false,
  canGoBack: false,
  currentBranch: null,

  setCheckpoints: (checkpoints) => set({ checkpoints }),

  setCurrentId: (currentId) => set({ currentId }),

  setPreviewId: (previewId) => set({ previewId }),

  setNavigation: (canGoForward, canGoBack) => set({ canGoForward, canGoBack }),

  setCurrentBranch: (currentBranch) => set({ currentBranch }),

  addCheckpoint: (checkpoint) =>
    set((state) => ({
      checkpoints: [checkpoint, ...state.checkpoints],
    })),

  removeCheckpoint: (id) =>
    set((state) => ({
      checkpoints: state.checkpoints.filter((c) => c.id !== id),
    })),
}));

// ============================================================================
// Project Store - Multi-project management
// ============================================================================

export interface ProjectState {
  projects: Project[];
  activeProject: Project | null;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (projectId: string) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],
      activeProject: null,

      setProjects: (projects) => set({ projects }),

      setActiveProject: (projectId) =>
        set((state) => ({
          activeProject: state.projects.find((p) => p.id === projectId) || null,
        })),

      addProject: (project) =>
        set((state) => ({
          projects: [...state.projects, project],
          activeProject: project,
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          activeProject:
            state.activeProject?.id === id
              ? { ...state.activeProject, ...updates }
              : state.activeProject,
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProject:
            state.activeProject?.id === id ? null : state.activeProject,
        })),
    }),
    {
      name: 'claude-agent-projects',
      storage: createJSONStorage(() => storageProxy),
    }
  )
);

// ============================================================================
// UI Store - Layout and theme state
// ============================================================================

export interface PanelState {
  isOpen: boolean;
  size: number;
}

export interface LayoutState {
  leftPanel: PanelState;
  rightPanel: PanelState;
  bottomPanel: PanelState;
}

export interface UIState {
  theme: 'light' | 'dark' | 'system';
  mode: AgentMode;
  model: string;
  layout: LayoutState;
  selectedFile: string | null;
  diffFile: string | null;
  showCommandPalette: boolean;
  showSettings: boolean;
  extendedThinking: boolean;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setMode: (mode: AgentMode) => void;
  setModel: (model: string) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setLeftPanelSize: (size: number) => void;
  setRightPanelSize: (size: number) => void;
  setBottomPanelSize: (size: number) => void;
  setSelectedFile: (path: string | null) => void;
  setDiffFile: (path: string | null) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  setExtendedThinking: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      mode: 'agent' as AgentMode,
      model: 'sonnet',
      showCommandPalette: false,
      showSettings: false,
      extendedThinking: false,
      layout: {
        leftPanel: { isOpen: true, size: 260 },
        rightPanel: { isOpen: true, size: 300 },
        bottomPanel: { isOpen: false, size: 200 },
      },
      selectedFile: null,
      diffFile: null,

      setTheme: (theme) => set({ theme }),
      setMode: (mode) => set({ mode }),
      setModel: (model) => set({ model }),
      toggleCommandPalette: () => set((state) => ({ showCommandPalette: !state.showCommandPalette })),
      toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
      setExtendedThinking: (enabled) => set({ extendedThinking: enabled }),

      toggleLeftPanel: () =>
        set((state) => ({
          layout: {
            ...state.layout,
            leftPanel: {
              ...state.layout.leftPanel,
              isOpen: !state.layout.leftPanel.isOpen,
            },
          },
        })),

      toggleRightPanel: () =>
        set((state) => ({
          layout: {
            ...state.layout,
            rightPanel: {
              ...state.layout.rightPanel,
              isOpen: !state.layout.rightPanel.isOpen,
            },
          },
        })),

      toggleBottomPanel: () =>
        set((state) => ({
          layout: {
            ...state.layout,
            bottomPanel: {
              ...state.layout.bottomPanel,
              isOpen: !state.layout.bottomPanel.isOpen,
            },
          },
        })),

      setLeftPanelSize: (size) =>
        set((state) => ({
          layout: {
            ...state.layout,
            leftPanel: { ...state.layout.leftPanel, size },
          },
        })),

      setRightPanelSize: (size) =>
        set((state) => ({
          layout: {
            ...state.layout,
            rightPanel: { ...state.layout.rightPanel, size },
          },
        })),

      setBottomPanelSize: (size) =>
        set((state) => ({
          layout: {
            ...state.layout,
            bottomPanel: { ...state.layout.bottomPanel, size },
          },
        })),

      setSelectedFile: (selectedFile) => set({ selectedFile }),

      setDiffFile: (diffFile) => set({ diffFile }),
    }),
    {
      name: 'claude-agent-ui',
      storage: createJSONStorage(() => storageProxy),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrate old mode values ('chat') to new ones ('ask')
          const VALID_MODES = ['ask', 'plan', 'agent', 'yolo'];
          if (!VALID_MODES.includes(persistedState.mode)) {
            persistedState.mode = persistedState.mode === 'chat' ? 'ask' : 'agent';
          }
        }
        if (version < 2) {
          // Add new fields with defaults
          persistedState.showCommandPalette = false;
          persistedState.showSettings = false;
          persistedState.extendedThinking = false;
        }
        return persistedState;
      },
    }
  )
);

// ============================================================================
// Chat Session Store - Per-branch chat sessions with message persistence
// ============================================================================

export interface ChatSessionState {
  sessions: Record<string, ChatSession>;
  activeChatId: string | null;

  getChatsForBranch: (branch: string, includeClosed?: boolean) => ChatSession[];
  createChat: (branch: string, name: string) => ChatSession;
  setActiveChatId: (id: string | null) => void;
  updateChat: (id: string, updates: Partial<ChatSession>) => void;
  saveMessages: (id: string, messages: Message[]) => void;
  deleteChat: (id: string) => void;
  closeChat: (id: string) => void;
  openChat: (id: string) => void;
  getClosedChats: (branch?: string) => ChatSession[];
  permanentlyDeleteChat: (id: string) => void;
}

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeChatId: null,

      getChatsForBranch: (branch, includeClosed = false) => {
        const sessions = get().sessions;
        return Object.values(sessions)
          .filter((s) => (s.branch === branch || s.branchName === branch) &&
                        (includeClosed || s.isOpen !== false))
          .sort((a, b) => a.createdAt - b.createdAt);
      },

      createChat: (branch, name) => {
        const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const chat: ChatSession = {
          id,
          branch,
          branchName: branch,
          name,
          messages: [],
          createdAt: Date.now(),
          lastActive: Date.now(),
          isOpen: true,
        };
        set((state) => ({
          sessions: { ...state.sessions, [id]: chat },
          activeChatId: id,
        }));
        return chat;
      },

      setActiveChatId: (id) => set({ activeChatId: id }),

      updateChat: (id, updates) =>
        set((state) => {
          const existing = state.sessions[id];
          if (!existing) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...existing, ...updates } },
          };
        }),

      saveMessages: (id, messages) =>
        set((state) => {
          const existing = state.sessions[id];
          if (!existing) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...existing, messages, lastActive: Date.now() } },
          };
        }),

      deleteChat: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.sessions;
          return {
            sessions: rest,
            activeChatId: state.activeChatId === id ? null : state.activeChatId,
          };
        }),

      closeChat: (id) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            [id]: { ...state.sessions[id], isOpen: false }
          }
        })),

      openChat: (id) =>
        set((state) => ({
          sessions: {
            ...state.sessions,
            [id]: { ...state.sessions[id], isOpen: true }
          }
        })),

      getClosedChats: (branch) => {
        const sessions = get().sessions;
        return Object.values(sessions)
          .filter(s => s.isOpen === false && (!branch || s.branch === branch || s.branchName === branch))
          .sort((a, b) => (b.lastActive || b.createdAt) - (a.lastActive || a.createdAt));
      },

      permanentlyDeleteChat: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.sessions;
          return {
            sessions: rest,
            activeChatId: state.activeChatId === id ? null : state.activeChatId,
          };
        }),
    }),
    {
      name: 'claude-agent-chat-sessions',
      storage: createJSONStorage(() => storageProxy),
      version: 2,
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // Mark all existing chats as open
          Object.values(persistedState.sessions || {}).forEach((chat: any) => {
            if (chat.isOpen === undefined) {
              chat.isOpen = true;
            }
          });
        }
        return persistedState;
      },
    }
  )
);
