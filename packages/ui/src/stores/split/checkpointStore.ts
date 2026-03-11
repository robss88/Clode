import { create } from 'zustand';
import type { Checkpoint } from '@claude-agent/core';

// ============================================================================
// Checkpoint Store - Checkpoint management state
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