import { useEffect, useCallback } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutConfig[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow some shortcuts even in inputs
        const allowInInput = ['Escape'];
        if (!allowInInput.includes(event.key)) {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        // Special handling for Ctrl/Cmd
        if (shortcut.meta) {
          if (!(event.metaKey || event.ctrlKey)) continue;
        }

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.handler();
          break;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    shortcuts: shortcuts.map((s) => ({
      key: s.key,
      modifiers: [
        s.ctrl && 'Ctrl',
        s.meta && 'Cmd',
        s.shift && 'Shift',
        s.alt && 'Alt',
      ].filter(Boolean),
      description: s.description,
    })),
  };
}

// Common shortcuts preset
export function createAgentShortcuts(handlers: {
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onCreateCheckpoint?: () => void;
  onToggleLeftPanel?: () => void;
  onToggleRightPanel?: () => void;
  onToggleTerminal?: () => void;
  onFocusInput?: () => void;
  onInterrupt?: () => void;
}): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [];

  if (handlers.onNavigateBack) {
    shortcuts.push({
      key: 'z',
      ctrl: true,
      handler: handlers.onNavigateBack,
      description: 'Go to previous checkpoint',
    });
  }

  if (handlers.onNavigateForward) {
    shortcuts.push({
      key: 'y',
      ctrl: true,
      handler: handlers.onNavigateForward,
      description: 'Go to next checkpoint',
    });
    shortcuts.push({
      key: 'z',
      ctrl: true,
      shift: true,
      handler: handlers.onNavigateForward,
      description: 'Go to next checkpoint',
    });
  }

  if (handlers.onCreateCheckpoint) {
    shortcuts.push({
      key: 's',
      ctrl: true,
      handler: handlers.onCreateCheckpoint,
      description: 'Create checkpoint',
    });
  }

  if (handlers.onToggleLeftPanel) {
    shortcuts.push({
      key: 'b',
      ctrl: true,
      handler: handlers.onToggleLeftPanel,
      description: 'Toggle file explorer',
    });
  }

  if (handlers.onToggleRightPanel) {
    shortcuts.push({
      key: 'h',
      ctrl: true,
      handler: handlers.onToggleRightPanel,
      description: 'Toggle checkpoints panel',
    });
  }

  if (handlers.onToggleTerminal) {
    shortcuts.push({
      key: '`',
      ctrl: true,
      handler: handlers.onToggleTerminal,
      description: 'Toggle terminal',
    });
  }

  if (handlers.onFocusInput) {
    shortcuts.push({
      key: 'k',
      ctrl: true,
      handler: handlers.onFocusInput,
      description: 'Focus chat input',
    });
  }

  if (handlers.onInterrupt) {
    shortcuts.push({
      key: 'Escape',
      handler: handlers.onInterrupt,
      description: 'Stop generation',
    });
  }

  return shortcuts;
}
