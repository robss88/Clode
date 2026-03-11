import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createStorage } from './storage';
import type { AgentMode } from './types';

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
  showDebugPanel: boolean;
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
  toggleDebugPanel: () => void;
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
      showDebugPanel: false,
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
      toggleDebugPanel: () => set((state) => ({ showDebugPanel: !state.showDebugPanel })),
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

      setSelectedFile: (path) => set({ selectedFile: path }),
      setDiffFile: (path) => set({ diffFile: path }),
    }),
    {
      name: 'claude-agent-ui',
      storage: createStorage(),
    }
  )
);