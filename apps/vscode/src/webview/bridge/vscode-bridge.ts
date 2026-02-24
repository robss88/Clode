import type { PlatformBridge, InitState } from './types';

// Acquire VS Code API (only available in webview context)
const vscodeApi = (globalThis as any).acquireVsCodeApi?.() ?? {
  postMessage: () => {},
  getState: () => ({}),
  setState: () => {},
};

// Pending request/response tracking
let nextRequestId = 0;
const pendingRequests = new Map<
  string,
  { resolve: (data: any) => void; reject: (err: Error) => void }
>();

// Event listener registry
const eventListeners = new Map<string, Set<Function>>();

// Listen for ALL messages from extension host
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  // Handle request/response (has requestId)
  if (msg.requestId && pendingRequests.has(msg.requestId)) {
    const { resolve, reject } = pendingRequests.get(msg.requestId)!;
    pendingRequests.delete(msg.requestId);
    if (msg.error) {
      reject(new Error(msg.error));
    } else {
      resolve(msg.data);
    }
    return;
  }

  // Handle broadcast events (no requestId)
  const listeners = eventListeners.get(msg.type);
  if (listeners) {
    listeners.forEach((cb) => cb(msg.data));
  }
});

// Send a request and wait for response
function invoke(type: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const requestId = `req_${++nextRequestId}_${Date.now()}`;
    pendingRequests.set(requestId, { resolve, reject });
    vscodeApi.postMessage({ type, data, requestId });

    // Timeout after 120s (most operations resolve instantly with fire-and-forget pattern)
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error(`Request ${type} timed out`));
      }
    }, 120000);
  });
}

// Subscribe to a broadcast event
function on(eventType: string, callback: Function): () => void {
  if (!eventListeners.has(eventType)) {
    eventListeners.set(eventType, new Set());
  }
  eventListeners.get(eventType)!.add(callback);
  return () => {
    eventListeners.get(eventType)?.delete(callback);
  };
}

export function createVSCodeBridge(): PlatformBridge {
  return {
    // Init
    requestInitState: () => invoke('init:request'),

    // Claude
    sendMessage: (content, options) => invoke('claude:send', { content, options }),
    setModel: (model) => invoke('claude:set-model', { model }),
    interruptClaude: () => invoke('claude:interrupt'),
    startClaude: (chatSessionId, claudeSessionId) => invoke('claude:start', { chatSessionId, claudeSessionId }),

    // Checkpoints
    createCheckpoint: (title, description, messages, options) =>
      invoke('checkpoint:create', { title, description, messages, options }),
    snapshotDirtyFiles: () => invoke('checkpoint:snapshot-dirty'),

    // Git
    resetGitToCommit: (hash) => invoke('git:reset-to-commit', { hash }),
    reattachBranch: () => invoke('git:reattach-branch'),
    getCurrentGitHead: () => invoke('git:current-head'),
    getCurrentGitBranch: () => invoke('git:current-branch'),
    listGitBranches: () => invoke('git:list-branches'),
    listGitCommits: (maxCount) => invoke('git:list-commits', { maxCount }),
    checkoutGitCommit: (hash) => invoke('git:checkout-commit', { hash }),
    getGitCommitDiff: (hash) => invoke('git:commit-diff', { hash }),
    switchGitBranch: (branchName) => invoke('git:switch-branch', { branchName }),
    createGitBranch: (name) => invoke('git:create-branch', { name }),
    pushToRemote: () => invoke('git:push'),
    getGitStatus: () => invoke('git:status'),
    gitCommitAll: (message) => invoke('git:commit-all', { message }),

    // File checkpoints (no git)
    createFileCheckpoint: (messageId) => invoke('checkpoint:create-file', { messageId }),
    restoreFileCheckpoint: (messageId) => invoke('checkpoint:restore-file', { messageId }),

    // Chat sessions
    switchChatSession: (id, claudeSessionId) => invoke('chat:switch', { chatSessionId: id, claudeSessionId }),

    // Files
    readFile: (path) => invoke('file:read', { path }),
    getFileTree: () => invoke('file:tree'),
    openFile: (path) => invoke('file:open', { path }),

    // Events
    onClaudeChunk: (cb) => on('claude:chunk', cb),
    onClaudeMessage: (cb) => on('claude:message', cb),
    onClaudeError: (cb) => on('claude:error', cb),
    onCheckpointCreated: (cb) => on('checkpoint:created', cb),
    onCheckpointRestored: (cb) => on('checkpoint:restored', cb),
    onInitState: (cb) => on('init:state', cb),
  };
}

// VS Code webview state persistence adapter for Zustand
export const vscodeStorage = {
  getItem: (name: string): string | null => {
    const state = vscodeApi.getState();
    return state?.[name] ?? null;
  },
  setItem: (name: string, value: string): void => {
    const state = vscodeApi.getState() || {};
    vscodeApi.setState({ ...state, [name]: value });
  },
  removeItem: (name: string): void => {
    const state = vscodeApi.getState() || {};
    delete state[name];
    vscodeApi.setState(state);
  },
};

export { vscodeApi };
