import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { ClaudeCodeManager, CheckpointManager, ProjectManager } from '@claude-agent/core';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

// Directories to ignore when scanning
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude-agent',
  'dist',
  'build',
  '.next',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
]);

// Scan directory and build file tree
async function scanDirectory(dirPath: string, maxDepth = 5, currentDepth = 0): Promise<FileNode[]> {
  if (currentDepth >= maxDepth) return [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    // Sort: directories first, then files, alphabetically
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      // Skip hidden files and ignored directories
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const children = await scanDirectory(fullPath, maxDepth, currentDepth + 1);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children,
        });
      } else {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
        });
      }
    }

    return nodes;
  } catch {
    return [];
  }
}

let mainWindow: BrowserWindow | null = null;
let claudeManager: ClaudeCodeManager | null = null;
let checkpointManager: CheckpointManager | null = null;
let projectManager: ProjectManager | null = null;

// Check if running in development by looking for Vite dev server or NODE_ENV
const isDev = process.env.NODE_ENV === 'development' ||
              process.env.VITE_DEV_SERVER_URL !== undefined ||
              !app.isPackaged;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 280,  // Allow very narrow for sidebar mode
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Load app
  if (isDev) {
    // Use environment variable or try default Vite ports
    const viteUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log('[Main] Loading dev URL:', viteUrl);
    mainWindow.loadURL(viteUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Initialize project manager
  const configDir = path.join(app.getPath('userData'), 'claude-agent');
  projectManager = new ProjectManager({ configDir });
  await projectManager.initialize();
}

// IPC Handlers
function setupIPC() {
  // Project handlers
  ipcMain.handle('project:open', async (_, projectPath: string) => {
    if (!projectManager) return null;
    const project = await projectManager.openProject(projectPath);
    return project;
  });

  ipcMain.handle('project:list', async () => {
    if (!projectManager) return [];
    return projectManager.all;
  });

  ipcMain.handle('project:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('project:get-files', async (_, projectPath: string) => {
    const name = path.basename(projectPath);
    const children = await scanDirectory(projectPath);
    return {
      name,
      path: projectPath,
      type: 'directory',
      children,
    } as FileNode;
  });

  ipcMain.handle('project:read-file', async (_, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch {
      return null;
    }
  });

  // Claude Code handlers
  ipcMain.handle('claude:start', async (_, workingDir: string) => {
    console.log('[Main] claude:start called with workingDir:', workingDir);
    if (claudeManager) {
      console.log('[Main] Terminating existing claudeManager');
      await claudeManager.terminate();
    }

    claudeManager = new ClaudeCodeManager({
      config: {
        workingDir,
        dangerouslySkipPermissions: true, // Skip permission prompts for now
      },
      onChunk: (chunk) => {
        console.log('[Main] Received chunk:', chunk.type, chunk.content?.slice(0, 50));
        // Use setImmediate to ensure IPC message is sent without blocking
        setImmediate(() => {
          mainWindow?.webContents.send('claude:chunk', chunk);
        });
      },
      onMessage: (message) => {
        console.log('[Main] Received message:', message.role, message.content?.slice(0, 50));
        setImmediate(() => {
          mainWindow?.webContents.send('claude:message', message);
        });
      },
      onToolCall: (toolCall) => {
        console.log('[Main] Tool call:', toolCall.name);
        setImmediate(() => {
          mainWindow?.webContents.send('claude:tool-start', toolCall);
        });
      },
      onError: (error) => {
        console.error('[Main] Claude error:', error.message);
        setImmediate(() => {
          mainWindow?.webContents.send('claude:error', error.message);
        });
      },
    });

    try {
      await claudeManager.spawn();
      console.log('[Main] claudeManager spawned successfully');
      return true;
    } catch (error) {
      console.error('[Main] Failed to spawn claudeManager:', error);
      return false;
    }
  });

  ipcMain.handle('claude:send', async (_, content: string) => {
    console.log(`[Main] claude:send called with content: ${content?.slice(0, 50)}`);
    if (!claudeManager) {
      console.log('[Main] claudeManager is null!');
      return false;
    }
    if (!claudeManager.running) {
      console.log('[Main] claudeManager is not running!');
      return false;
    }
    try {
      console.log('[Main] Calling claudeManager.sendMessage...');
      const startTime = Date.now();
      await claudeManager.sendMessage(content);
      console.log(`[Main] sendMessage completed in ${Date.now() - startTime}ms`);
      return true;
    } catch (error) {
      console.error(`[Main] sendMessage error: ${String(error)}`);
      // Only send real errors to renderer
      mainWindow?.webContents.send('claude:error', String(error));
      return false;
    }
  });

  ipcMain.handle('claude:interrupt', async () => {
    if (!claudeManager) return;
    await claudeManager.interrupt();
  });

  ipcMain.handle('claude:stop', async () => {
    if (!claudeManager) return;
    await claudeManager.terminate();
    claudeManager = null;
  });

  // Checkpoint handlers
  ipcMain.handle('checkpoint:init', async (_, workingDir: string) => {
    checkpointManager = new CheckpointManager({ workingDir });

    checkpointManager.on('checkpoint:created', (checkpoint) => {
      mainWindow?.webContents.send('checkpoint:created', checkpoint);
    });

    checkpointManager.on('checkpoint:restored', (checkpoint) => {
      mainWindow?.webContents.send('checkpoint:restored', checkpoint);
    });

    await checkpointManager.initialize();
    return checkpointManager.exportTree();
  });

  ipcMain.handle('checkpoint:create', async (_, title?: string, description?: string, messages?: any[]) => {
    if (!checkpointManager) return null;
    return checkpointManager.createCheckpoint(title, description, messages);
  });

  ipcMain.handle('checkpoint:restore', async (_, checkpointId: string) => {
    if (!checkpointManager) return null;
    return checkpointManager.restoreCheckpoint(checkpointId);
  });

  ipcMain.handle('checkpoint:forward', async () => {
    if (!checkpointManager) return null;
    return checkpointManager.navigateForward();
  });

  ipcMain.handle('checkpoint:back', async () => {
    if (!checkpointManager) return null;
    return checkpointManager.navigateBack();
  });

  ipcMain.handle('checkpoint:list', async () => {
    if (!checkpointManager) return { groups: [], current: null };
    return {
      groups: checkpointManager.getGroupedCheckpoints(),
      current: checkpointManager.current,
      canGoForward: checkpointManager.canGoForward,
      canGoBack: checkpointManager.canGoBack,
    };
  });

  ipcMain.handle('checkpoint:diff', async (_, checkpointId: string) => {
    if (!checkpointManager) return '';
    return checkpointManager.getCheckpointDiff(checkpointId);
  });

  // Shell handlers
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:showItemInFolder', async (_, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  setupIPC();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (claudeManager) {
    await claudeManager.terminate();
  }
});
