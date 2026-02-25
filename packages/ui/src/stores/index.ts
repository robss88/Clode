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

// ============================================================================
// Agent Store - Chat and Claude Code state
// ============================================================================

export interface AgentState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  currentToolCall: ToolCall | null;
  streamingToolCalls: ToolCall[];
  updateCount: number;
  draftInput: string;

  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setStreaming: (isStreaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentToolCall: (toolCall: ToolCall | null) => void;
  addStreamingToolCall: (toolCall: ToolCall) => void;
  updateStreamingToolCall: (id: string, updates: Partial<ToolCall>) => void;
  clearStreamingToolCalls: () => void;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
  truncateAfterMessage: (messageId: string) => void;
  setDraftInput: (content: string) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  currentToolCall: null,
  streamingToolCalls: [],
  updateCount: 0,
  draftInput: '',

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
    set((state) => ({ isStreaming, updateCount: state.updateCount + 1 })),

  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content,
      updateCount: state.updateCount + 1,
    })),

  clearStreamingContent: () =>
    set((state) => ({ streamingContent: '', updateCount: state.updateCount + 1 })),

  setCurrentToolCall: (toolCall) =>
    set((state) => ({ currentToolCall: toolCall, updateCount: state.updateCount + 1 })),

  addStreamingToolCall: (toolCall) =>
    set((state) => ({
      streamingToolCalls: [...state.streamingToolCalls, toolCall],
      updateCount: state.updateCount + 1,
    })),

  updateStreamingToolCall: (id, updates) =>
    set((state) => ({
      streamingToolCalls: state.streamingToolCalls.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
      updateCount: state.updateCount + 1,
    })),

  clearStreamingToolCalls: () =>
    set((state) => ({ streamingToolCalls: [], updateCount: state.updateCount + 1 })),

  clearMessages: () =>
    set((state) => ({ messages: [], streamingContent: '', streamingToolCalls: [], updateCount: state.updateCount + 1 })),

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
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      mode: 'agent' as AgentMode,
      model: 'sonnet',
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
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrate old mode values ('chat') to new ones ('ask')
          const VALID_MODES = ['ask', 'plan', 'agent', 'yolo'];
          if (!VALID_MODES.includes(persistedState.mode)) {
            persistedState.mode = persistedState.mode === 'chat' ? 'ask' : 'agent';
          }
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

  getChatsForBranch: (branch: string) => ChatSession[];
  createChat: (branch: string, name: string) => ChatSession;
  setActiveChatId: (id: string | null) => void;
  updateChat: (id: string, updates: Partial<ChatSession>) => void;
  saveMessages: (id: string, messages: Message[]) => void;
  deleteChat: (id: string) => void;
}

export const useChatSessionStore = create<ChatSessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      activeChatId: null,

      getChatsForBranch: (branch) => {
        const sessions = get().sessions;
        return Object.values(sessions)
          .filter((s) => s.branch === branch)
          .sort((a, b) => b.createdAt - a.createdAt);
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
    }),
    {
      name: 'claude-agent-chat-sessions',
      storage: createJSONStorage(() => storageProxy),
    }
  )
);
