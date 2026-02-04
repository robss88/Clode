import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project
  openProject: (path: string) => ipcRenderer.invoke('project:open', path),
  listProjects: () => ipcRenderer.invoke('project:list'),
  selectFolder: () => ipcRenderer.invoke('project:select-folder'),
  getFileTree: (projectPath: string) => ipcRenderer.invoke('project:get-files', projectPath),
  readFile: (filePath: string) => ipcRenderer.invoke('project:read-file', filePath),

  // Claude Code
  startClaude: (workingDir: string) => ipcRenderer.invoke('claude:start', workingDir),
  sendMessage: (content: string) => ipcRenderer.invoke('claude:send', content),
  interruptClaude: () => ipcRenderer.invoke('claude:interrupt'),
  stopClaude: () => ipcRenderer.invoke('claude:stop'),

  // Claude events - returns cleanup function
  onClaudeChunk: (callback: (chunk: any) => void) => {
    const handler = (_: any, chunk: any) => callback(chunk);
    ipcRenderer.on('claude:chunk', handler);
    return () => ipcRenderer.removeListener('claude:chunk', handler);
  },
  onClaudeMessage: (callback: (message: any) => void) => {
    const handler = (_: any, message: any) => callback(message);
    ipcRenderer.on('claude:message', handler);
    return () => ipcRenderer.removeListener('claude:message', handler);
  },
  onClaudeToolStart: (callback: (toolCall: any) => void) => {
    const handler = (_: any, toolCall: any) => callback(toolCall);
    ipcRenderer.on('claude:tool-start', handler);
    return () => ipcRenderer.removeListener('claude:tool-start', handler);
  },
  onClaudeError: (callback: (error: string) => void) => {
    const handler = (_: any, error: string) => callback(error);
    ipcRenderer.on('claude:error', handler);
    return () => ipcRenderer.removeListener('claude:error', handler);
  },

  // Checkpoints
  initCheckpoints: (workingDir: string) => ipcRenderer.invoke('checkpoint:init', workingDir),
  createCheckpoint: (title?: string, description?: string, messages?: any[]) =>
    ipcRenderer.invoke('checkpoint:create', title, description, messages),
  restoreCheckpoint: (id: string) => ipcRenderer.invoke('checkpoint:restore', id),
  navigateForward: () => ipcRenderer.invoke('checkpoint:forward'),
  navigateBack: () => ipcRenderer.invoke('checkpoint:back'),
  listCheckpoints: () => ipcRenderer.invoke('checkpoint:list'),
  getCheckpointDiff: (id: string) => ipcRenderer.invoke('checkpoint:diff', id),

  // Checkpoint events - returns cleanup function
  onCheckpointCreated: (callback: (checkpoint: any) => void) => {
    const handler = (_: any, checkpoint: any) => callback(checkpoint);
    ipcRenderer.on('checkpoint:created', handler);
    return () => ipcRenderer.removeListener('checkpoint:created', handler);
  },
  onCheckpointRestored: (callback: (checkpoint: any) => void) => {
    const handler = (_: any, checkpoint: any) => callback(checkpoint);
    ipcRenderer.on('checkpoint:restored', handler);
    return () => ipcRenderer.removeListener('checkpoint:restored', handler);
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
});

// TypeScript declaration for the exposed API
declare global {
  interface Window {
    electronAPI: {
      openProject: (path: string) => Promise<any>;
      listProjects: () => Promise<any[]>;
      selectFolder: () => Promise<string | null>;
      getFileTree: (projectPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string | null>;
      startClaude: (workingDir: string) => Promise<boolean>;
      sendMessage: (content: string) => Promise<boolean>;
      interruptClaude: () => Promise<void>;
      stopClaude: () => Promise<void>;
      onClaudeChunk: (callback: (chunk: any) => void) => () => void;
      onClaudeMessage: (callback: (message: any) => void) => () => void;
      onClaudeToolStart: (callback: (toolCall: any) => void) => () => void;
      onClaudeError: (callback: (error: string) => void) => () => void;
      initCheckpoints: (workingDir: string) => Promise<any>;
      createCheckpoint: (title?: string, description?: string, messages?: any[]) => Promise<any>;
      restoreCheckpoint: (id: string) => Promise<any>;
      navigateForward: () => Promise<any>;
      navigateBack: () => Promise<any>;
      listCheckpoints: () => Promise<any>;
      getCheckpointDiff: (id: string) => Promise<string>;
      onCheckpointCreated: (callback: (checkpoint: any) => void) => () => void;
      onCheckpointRestored: (callback: (checkpoint: any) => void) => () => void;
      openExternal: (url: string) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
    };
  }
}
