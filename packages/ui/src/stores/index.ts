import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Message,
  Checkpoint,
  CheckpointGroup,
  Project,
  ToolCall,
  ClaudeStreamChunk,
} from '@claude-agent/core';

// ============================================================================
// Agent Store - Chat and Claude Code state
// ============================================================================

export interface AgentState {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  currentToolCall: ToolCall | null;
  updateCount: number; // Force re-renders by incrementing

  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setStreaming: (isStreaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentToolCall: (toolCall: ToolCall | null) => void;
  clearMessages: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: '',
  currentToolCall: null,
  updateCount: 0,

  addMessage: (message) =>
    set((state) => {
      console.log('[AgentStore] addMessage:', message.role);
      return {
        messages: [...state.messages, message],
        updateCount: state.updateCount + 1,
      };
    }),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
      updateCount: state.updateCount + 1,
    })),

  setStreaming: (isStreaming) =>
    set((state) => {
      console.log('[AgentStore] setStreaming:', isStreaming);
      return { isStreaming, updateCount: state.updateCount + 1 };
    }),

  appendStreamingContent: (content) =>
    set((state) => {
      const newContent = state.streamingContent + content;
      console.log('[AgentStore] appendStreamingContent, total length:', newContent.length);
      return {
        streamingContent: newContent,
        updateCount: state.updateCount + 1,
      };
    }),

  clearStreamingContent: () =>
    set((state) => {
      console.log('[AgentStore] clearStreamingContent');
      return { streamingContent: '', updateCount: state.updateCount + 1 };
    }),

  setCurrentToolCall: (toolCall) =>
    set((state) => {
      console.log('[AgentStore] setCurrentToolCall:', toolCall?.name || 'null');
      return { currentToolCall: toolCall, updateCount: state.updateCount + 1 };
    }),

  clearMessages: () =>
    set((state) => {
      console.log('[AgentStore] clearMessages');
      return { messages: [], streamingContent: '', updateCount: state.updateCount + 1 };
    }),
}));

// ============================================================================
// Checkpoint Store - Checkpoint management state
// ============================================================================

export interface CheckpointState {
  checkpoints: Checkpoint[];
  groups: CheckpointGroup[];
  currentId: string | null;
  previewId: string | null;
  canGoForward: boolean;
  canGoBack: boolean;

  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  setGroups: (groups: CheckpointGroup[]) => void;
  setCurrentId: (id: string | null) => void;
  setPreviewId: (id: string | null) => void;
  setNavigation: (canGoForward: boolean, canGoBack: boolean) => void;
  addCheckpoint: (checkpoint: Checkpoint) => void;
  removeCheckpoint: (id: string) => void;
}

export const useCheckpointStore = create<CheckpointState>((set) => ({
  checkpoints: [],
  groups: [],
  currentId: null,
  previewId: null,
  canGoForward: false,
  canGoBack: false,

  setCheckpoints: (checkpoints) =>
    set({ checkpoints }),

  setGroups: (groups) =>
    set({ groups }),

  setCurrentId: (currentId) =>
    set({ currentId }),

  setPreviewId: (previewId) =>
    set({ previewId }),

  setNavigation: (canGoForward, canGoBack) =>
    set({ canGoForward, canGoBack }),

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
    (set, get) => ({
      projects: [],
      activeProject: null,

      setProjects: (projects) =>
        set({ projects }),

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
  layout: LayoutState;
  selectedFile: string | null;
  diffFile: string | null;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
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
      layout: {
        leftPanel: { isOpen: true, size: 260 },
        rightPanel: { isOpen: true, size: 300 },
        bottomPanel: { isOpen: false, size: 200 },
      },
      selectedFile: null,
      diffFile: null,

      setTheme: (theme) =>
        set({ theme }),

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

      setSelectedFile: (selectedFile) =>
        set({ selectedFile }),

      setDiffFile: (diffFile) =>
        set({ diffFile }),
    }),
    {
      name: 'claude-agent-ui',
    }
  )
);
