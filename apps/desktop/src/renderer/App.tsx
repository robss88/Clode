import React, { useEffect, useState, useCallback } from 'react';
import {
  Layout,
  ChatInterface,
  CheckpointTimeline,
  FileExplorer,
  DiffViewer,
  EmbeddedTerminal,
  useAgentStore,
  useCheckpointStore,
  useProjectStore,
  useUIStore,
  useKeyboardShortcuts,
  createAgentShortcuts,
} from '@claude-agent/ui';
import type { Message, FileNode, CheckpointGroup } from '@claude-agent/core';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [diffContent, setDiffContent] = useState<{ old: string; new: string }>({ old: '', new: '' });
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    currentToolCall,
    addMessage,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
    setCurrentToolCall,
  } = useAgentStore();

  const {
    groups,
    currentId,
    canGoForward,
    canGoBack,
    setGroups,
    setCurrentId,
    setNavigation,
    setPreviewId,
  } = useCheckpointStore();

  const { activeProject, projects, setProjects, addProject, setActiveProject } = useProjectStore();
  const { layout, toggleLeftPanel, toggleRightPanel, toggleBottomPanel, diffFile, setDiffFile } = useUIStore();

  // Define callbacks FIRST before useEffects that use them
  // Refresh file tree periodically or after file operations
  const refreshFileTree = useCallback(async () => {
    if (!activeProject) return;
    const tree = await window.electronAPI.getFileTree(activeProject.path);
    setFileTree(tree);
  }, [activeProject]);

  // Refresh checkpoints
  const refreshCheckpoints = useCallback(async () => {
    const data = await window.electronAPI.listCheckpoints();
    setGroups(data.groups);
    setCurrentId(data.current?.id || null);
    setNavigation(data.canGoForward, data.canGoBack);
  }, [setGroups, setCurrentId, setNavigation]);

  // Initialize app - load projects
  useEffect(() => {
    async function init() {
      console.log('[Renderer] Initializing app...');
      const projectList = await window.electronAPI.listProjects();
      console.log('[Renderer] Loaded projects:', projectList.length);
      setProjects(projectList);
      setIsInitialized(true);
      console.log('[Renderer] App initialized');
    }
    init();
  }, [setProjects]);

  // Set up Claude event listeners - separate effect with cleanup
  useEffect(() => {
    console.log('[Renderer] Setting up Claude event listeners...');

    const cleanupChunk = window.electronAPI.onClaudeChunk((chunk) => {
      console.log('[Renderer] Received chunk:', chunk.type, chunk.content?.slice(0, 30));

      // Use getState() to always get fresh actions
      const { appendStreamingContent, setCurrentToolCall } = useAgentStore.getState();

      if (chunk.type === 'text') {
        appendStreamingContent(chunk.content);
        setCurrentToolCall(null);
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        console.log('[Renderer] Setting tool call:', chunk.toolCall.name);
        setCurrentToolCall(chunk.toolCall);
      } else if (chunk.type === 'tool_result') {
        console.log('[Renderer] Tool result received, clearing tool call');
        setCurrentToolCall(null);
      }
    });

    const cleanupMessage = window.electronAPI.onClaudeMessage(async (message) => {
      console.log('[Renderer] Received message:', message.role);
      const { clearStreamingContent, setCurrentToolCall, addMessage, setStreaming } = useAgentStore.getState();

      clearStreamingContent();
      setCurrentToolCall(null);
      addMessage(message);
      setStreaming(false);

      // Auto-create checkpoint after each assistant response
      const currentMessages = useAgentStore.getState().messages;
      await window.electronAPI.createCheckpoint(
        undefined,
        undefined,
        [...currentMessages, message]
      );
    });

    const cleanupError = window.electronAPI.onClaudeError((error) => {
      console.error('[Renderer] Claude error:', error);
      // Only stop streaming for real errors, not debug messages
      if (!error.startsWith('[Debug]')) {
        useAgentStore.getState().setStreaming(false);
      }
    });

    // Checkpoint listeners - call refreshCheckpoints via closure
    const cleanupCheckpointCreated = window.electronAPI.onCheckpointCreated((checkpoint) => {
      console.log('[Renderer] Checkpoint created:', checkpoint?.id);
      refreshCheckpoints();
    });

    const cleanupCheckpointRestored = window.electronAPI.onCheckpointRestored((checkpoint) => {
      console.log('[Renderer] Checkpoint restored:', checkpoint?.id);
      refreshCheckpoints();
    });

    // Cleanup on unmount
    return () => {
      console.log('[Renderer] Cleaning up event listeners...');
      cleanupChunk();
      cleanupMessage();
      cleanupError();
      cleanupCheckpointCreated();
      cleanupCheckpointRestored();
    };
  }, [refreshCheckpoints]);

  // Initialize project when selected
  useEffect(() => {
    if (!activeProject) return;

    async function initProject() {
      console.log('[Renderer] Initializing project:', activeProject!.path);

      // Start Claude Code
      console.log('[Renderer] Starting Claude Code...');
      const claudeStarted = await window.electronAPI.startClaude(activeProject!.path);
      console.log('[Renderer] Claude started:', claudeStarted);

      // Initialize checkpoints
      console.log('[Renderer] Initializing checkpoints...');
      await window.electronAPI.initCheckpoints(activeProject!.path);
      await refreshCheckpoints();

      // Load file tree
      console.log('[Renderer] Loading file tree...');
      const tree = await window.electronAPI.getFileTree(activeProject!.path);
      setFileTree(tree);
      console.log('[Renderer] Project initialized');
    }

    initProject();
  }, [activeProject?.id, refreshCheckpoints]);

  // Send message
  const handleSendMessage = useCallback(async (content: string) => {
    console.log('[Renderer] handleSendMessage called with:', content?.slice(0, 50));
    setStreaming(true);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(userMessage);

    console.log('[Renderer] Calling window.electronAPI.sendMessage...');
    const result = await window.electronAPI.sendMessage(content);
    console.log('[Renderer] sendMessage result:', result);
  }, [addMessage, setStreaming]);

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    await window.electronAPI.interruptClaude();
    setStreaming(false);
    clearStreamingContent();
    setCurrentToolCall(null);
  }, [setStreaming, clearStreamingContent, setCurrentToolCall]);

  // Checkpoint navigation - restores both files AND conversation
  const handleNavigateToCheckpoint = useCallback(async (checkpointId: string) => {
    const checkpoint = await window.electronAPI.restoreCheckpoint(checkpointId);
    // Restore conversation from checkpoint snapshot
    if (checkpoint?.conversationSnapshot) {
      // Clear current messages and load from checkpoint
      useAgentStore.getState().clearMessages();
      for (const msg of checkpoint.conversationSnapshot) {
        useAgentStore.getState().addMessage(msg);
      }
    }
    // Refresh file tree after restore
    await refreshFileTree();
  }, [refreshFileTree]);

  const handleNavigateForward = useCallback(async () => {
    await window.electronAPI.navigateForward();
  }, []);

  const handleNavigateBack = useCallback(async () => {
    await window.electronAPI.navigateBack();
  }, []);

  const handlePreviewCheckpoint = useCallback(async (checkpointId: string) => {
    setPreviewId(checkpointId);
    // Load diff for preview
    const diff = await window.electronAPI.getCheckpointDiff(checkpointId);
    if (diff) {
      setDiffContent({ old: '', new: diff });
    }
  }, [setPreviewId]);

  const handleCreateCheckpoint = useCallback(async () => {
    await window.electronAPI.createCheckpoint('Manual checkpoint', 'Created by user', messages);
  }, [messages]);

  // Open folder
  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) {
      const project = await window.electronAPI.openProject(folderPath);
      if (project) {
        addProject(project);
      }
    }
  }, [addProject]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: createAgentShortcuts({
      onNavigateBack: handleNavigateBack,
      onNavigateForward: handleNavigateForward,
      onCreateCheckpoint: handleCreateCheckpoint,
      onToggleLeftPanel: toggleLeftPanel,
      onToggleRightPanel: toggleRightPanel,
      onToggleTerminal: toggleBottomPanel,
      onInterrupt: handleInterrupt,
    }),
  });

  // Render welcome screen if no project
  if (!activeProject) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent mb-4">
            Claude Agent
          </h1>
          <p className="text-foreground-secondary mb-8">
            Your AI-powered coding assistant with powerful checkpoint management
          </p>

          <button
            onClick={handleOpenFolder}
            className="btn btn-primary text-lg px-8 py-3"
          >
            Open Project
          </button>

          {projects.length > 0 && (
            <div className="mt-8">
              <p className="text-sm text-foreground-muted mb-3">Recent Projects</p>
              <div className="space-y-2">
                {projects.slice(0, 5).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setActiveProject(project.id)}
                    className="w-full text-left px-4 py-3 bg-background-secondary hover:bg-background-hover rounded-lg transition-colors"
                  >
                    <p className="font-medium">{project.name}</p>
                    <p className="text-xs text-foreground-muted truncate">{project.path}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout
      leftPanel={
        fileTree && (
          <FileExplorer
            root={fileTree}
            onFileSelect={async (path) => {
              // Read and display file content
              const content = await window.electronAPI.readFile(path);
              setSelectedFileContent(content);
            }}
            onDiffSelect={async (path) => {
              setDiffFile(path);
              // Load the file content as "new" content for the diff viewer
              const content = await window.electronAPI.readFile(path);
              setDiffContent({ old: '', new: content || '' });
            }}
          />
        )
      }
      rightPanel={
        <CheckpointTimeline
          groups={groups}
          currentId={currentId}
          canGoForward={canGoForward}
          canGoBack={canGoBack}
          onNavigate={handleNavigateToCheckpoint}
          onNavigateForward={handleNavigateForward}
          onNavigateBack={handleNavigateBack}
          onPreview={handlePreviewCheckpoint}
        />
      }
      bottomPanel={<EmbeddedTerminal />}
    >
      <div className="h-full flex">
        <div className="flex-1">
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            currentToolCall={currentToolCall}
            onSendMessage={handleSendMessage}
            onInterrupt={handleInterrupt}
          />
        </div>

        {/* Diff viewer overlay */}
        {diffFile && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="w-full max-w-5xl h-full">
              <DiffViewer
                oldContent={diffContent.old}
                newContent={diffContent.new}
                fileName={diffFile}
                onClose={() => {
                  setDiffFile(null);
                  setDiffContent({ old: '', new: '' });
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
