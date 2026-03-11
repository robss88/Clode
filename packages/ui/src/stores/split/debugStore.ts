import { create } from 'zustand';

// ============================================================================
// Debug Store - Debug panel and raw output state
// ============================================================================

export interface DebugState {
  debugRawLines: Array<{ timestamp: number; data: any }>;
  pushDebugRawLine: (data: any) => void;
  clearDebugRawLines: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  debugRawLines: [],

  pushDebugRawLine: (data) =>
    set((state) => ({
      debugRawLines: [...state.debugRawLines, { timestamp: Date.now(), data }],
    })),

  clearDebugRawLines: () => set({ debugRawLines: [] }),
}));