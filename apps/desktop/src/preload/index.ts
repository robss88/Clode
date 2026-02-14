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
  sendMessage: (content: string, options?: { extraFlags?: string[]; model?: string }) =>
    ipcRenderer.invoke('claude:send', content, options),
  setModel: (model: string) => ipcRenderer.invoke('claude:set-model', model),
  interruptClaude: () => ipcRenderer.invoke('claude:interrupt'),
  stopClaude: () => ipcRenderer.invoke('claude:stop'),

  // Claude events
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
  createCheckpoint: (title?: string, description?: string, messages?: any[], options?: { skipIfEmpty?: boolean }) =>
    ipcRenderer.invoke('checkpoint:create', title, description, messages, options),
  snapshotDirtyFilesForCheckpoint: () => ipcRenderer.invoke('checkpoint:snapshot-dirty'),
  restoreCheckpoint: (id: string) => ipcRenderer.invoke('checkpoint:restore', id),
  navigateForward: () => ipcRenderer.invoke('checkpoint:forward'),
  navigateBack: () => ipcRenderer.invoke('checkpoint:back'),
  listCheckpoints: () => ipcRenderer.invoke('checkpoint:list'),
  getCheckpointDiff: (id: string) => ipcRenderer.invoke('checkpoint:diff', id),

  // Sessions
  listSessions: () => ipcRenderer.invoke('session:list'),
  createSession: (name: string) => ipcRenderer.invoke('session:create', name),
  switchSession: (sessionId: string) => ipcRenderer.invoke('session:switch', sessionId),

  // Checkpoint events
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

  // Session events
  onSessionCreated: (callback: (session: any) => void) => {
    const handler = (_: any, session: any) => callback(session);
    ipcRenderer.on('session:created', handler);
    return () => ipcRenderer.removeListener('session:created', handler);
  },
  onSessionSwitched: (callback: (session: any) => void) => {
    const handler = (_: any, session: any) => callback(session);
    ipcRenderer.on('session:switched', handler);
    return () => ipcRenderer.removeListener('session:switched', handler);
  },

  // Git (simplified UI)
  listGitBranches: () => ipcRenderer.invoke('git:list-branches'),
  switchGitBranch: (branchName: string) => ipcRenderer.invoke('git:switch-branch', branchName),
  listGitCommits: (maxCount?: number) => ipcRenderer.invoke('git:list-commits', maxCount),
  checkoutGitCommit: (commitHash: string) => ipcRenderer.invoke('git:checkout-commit', commitHash),
  resetGitToCommit: (commitHash: string) => ipcRenderer.invoke('git:reset-to-commit', commitHash),
  getGitCommitDiff: (commitHash: string) => ipcRenderer.invoke('git:commit-diff', commitHash),
  getCurrentGitBranch: () => ipcRenderer.invoke('git:current-branch'),
  getCurrentGitHead: () => ipcRenderer.invoke('git:current-head'),

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
      sendMessage: (content: string, options?: { extraFlags?: string[]; model?: string }) => Promise<boolean>;
      setModel: (model: string) => Promise<boolean>;
      interruptClaude: () => Promise<void>;
      stopClaude: () => Promise<void>;
      onClaudeChunk: (callback: (chunk: any) => void) => () => void;
      onClaudeMessage: (callback: (message: any) => void) => () => void;
      onClaudeToolStart: (callback: (toolCall: any) => void) => () => void;
      onClaudeError: (callback: (error: string) => void) => () => void;
      initCheckpoints: (workingDir: string) => Promise<any>;
      createCheckpoint: (title?: string, description?: string, messages?: any[], options?: { skipIfEmpty?: boolean }) => Promise<any>;
      snapshotDirtyFilesForCheckpoint: () => Promise<void>;
      restoreCheckpoint: (id: string) => Promise<any>;
      navigateForward: () => Promise<any>;
      navigateBack: () => Promise<any>;
      listCheckpoints: () => Promise<any>;
      getCheckpointDiff: (id: string) => Promise<string>;
      listSessions: () => Promise<any[]>;
      createSession: (name: string) => Promise<any>;
      switchSession: (sessionId: string) => Promise<any>;
      onCheckpointCreated: (callback: (checkpoint: any) => void) => () => void;
      onCheckpointRestored: (callback: (checkpoint: any) => void) => () => void;
      onSessionCreated: (callback: (session: any) => void) => () => void;
      onSessionSwitched: (callback: (session: any) => void) => () => void;
      listGitBranches: () => Promise<any[]>;
      switchGitBranch: (branchName: string) => Promise<void>;
      listGitCommits: (maxCount?: number) => Promise<any[]>;
      checkoutGitCommit: (commitHash: string) => Promise<void>;
      resetGitToCommit: (commitHash: string) => Promise<void>;
      getGitCommitDiff: (commitHash: string) => Promise<string>;
      getCurrentGitBranch: () => Promise<string>;
      getCurrentGitHead: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      showItemInFolder: (path: string) => Promise<void>;
    };
  }
}
