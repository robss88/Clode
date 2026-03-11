import { createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

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

export const storageProxy: StateStorage = {
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
  // Note: Individual stores will need to call rehydrate() after this
}

export const createStorage = () => createJSONStorage(() => storageProxy);