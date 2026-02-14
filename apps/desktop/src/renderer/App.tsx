import React, { useEffect, useState, useCallback } from 'react';
import {
  Layout,
  ChatInterface,
  CommitTimeline,
  FileExplorer,
  DiffViewer,
  EmbeddedTerminal,
  useAgentStore,
  useProjectStore,
  useUIStore,
  useKeyboardShortcuts,
  createAgentShortcuts,
  executeCommand,
} from '@claude-agent/ui';
import type { Message, FileNode, GitBranch, GitCommit } from '@claude-agent/core';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [diffContent, setDiffContent] = useState<{ old: string; new: string }>({ old: '', new: '' });
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [currentHead, setCurrentHead] = useState<string | null>(null);

  const {
    messages,
    isStreaming,
    streamingContent,
    currentToolCall,
    addMessage,
    setStreaming,
    clearStreamingContent,
    setCurrentToolCall,
  } = useAgentStore();

  const { activeProject, projects, setProjects, addProject, setActiveProject } = useProjectStore();
  const { toggleLeftPanel, toggleRightPanel, toggleBottomPanel, diffFile, setDiffFile } = useUIStore();

  // Refresh file tree
  const refreshFileTree = useCallback(async () => {
    if (!activeProject) return;
    const tree = await window.electronAPI.getFileTree(activeProject.path);
    setFileTree(tree);
  }, [activeProject]);

  // Refresh git branches
  const refreshBranches = useCallback(async () => {
    const branchList = await window.electronAPI.listGitBranches();
    setBranches(branchList);
    const branch = await window.electronAPI.getCurrentGitBranch();
    setCurrentBranch(branch || null);
  }, []);

  // Refresh git commits for current branch
  const refreshCommits = useCallback(async () => {
    const commitList = await window.electronAPI.listGitCommits();
    setCommits(commitList);
    const head = await window.electronAPI.getCurrentGitHead();
    setCurrentHead(head || null);
  }, []);

  // Initialize app
  useEffect(() => {
    async function init() {
      const projectList = await window.electronAPI.listProjects();
      setProjects(projectList);
      setIsInitialized(true);
    }
    init();
  }, [setProjects]);

  // Set up event listeners
  useEffect(() => {
    const cleanupChunk = window.electronAPI.onClaudeChunk((chunk) => {
      const { appendStreamingContent, setCurrentToolCall } = useAgentStore.getState();

      if (chunk.type === 'text') {
        appendStreamingContent(chunk.content);
        setCurrentToolCall(null);
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        setCurrentToolCall(chunk.toolCall);
      } else if (chunk.type === 'tool_result') {
        setCurrentToolCall(null);
      }
    });

    const cleanupMessage = window.electronAPI.onClaudeMessage(async (message) => {
      const { clearStreamingContent, setCurrentToolCall, addMessage, setStreaming, updateMessage } = useAgentStore.getState();

      clearStreamingContent();
      setCurrentToolCall(null);
      addMessage(message);
      setStreaming(false);

      // Auto-create checkpoint after each assistant response (only if files changed)
      const currentMessages = useAgentStore.getState().messages;
      const checkpoint = await window.electronAPI.createCheckpoint(undefined, undefined, currentMessages, { skipIfEmpty: true });

      // Store the commit hash on the assistant message for later restore
      if (checkpoint && checkpoint.metadata?.commitSha) {
        updateMessage(message.id, {
          checkpointCommitHash: checkpoint.metadata.commitSha,
        });
      }
    });

    const cleanupError = window.electronAPI.onClaudeError((error) => {
      if (!error.startsWith('[Debug]')) {
        useAgentStore.getState().setStreaming(false);
      }
    });

    const cleanupCheckpointCreated = window.electronAPI.onCheckpointCreated(() => {
      refreshCommits();
      refreshBranches();
    });

    const cleanupCheckpointRestored = window.electronAPI.onCheckpointRestored(() => {
      refreshCommits();
      refreshBranches();
      refreshFileTree();
    });

    const cleanupSessionCreated = window.electronAPI.onSessionCreated(() => {
      refreshBranches();
    });

    const cleanupSessionSwitched = window.electronAPI.onSessionSwitched(() => {
      refreshBranches();
      refreshCommits();
      refreshFileTree();
    });

    return () => {
      cleanupChunk();
      cleanupMessage();
      cleanupError();
      cleanupCheckpointCreated();
      cleanupCheckpointRestored();
      cleanupSessionCreated();
      cleanupSessionSwitched();
    };
  }, [refreshCommits, refreshBranches, refreshFileTree]);

  // Initialize project when selected
  useEffect(() => {
    if (!activeProject) return;

    async function initProject() {
      await window.electronAPI.startClaude(activeProject!.path);
      await window.electronAPI.initCheckpoints(activeProject!.path);
      await refreshBranches();
      await refreshCommits();
      const tree = await window.electronAPI.getFileTree(activeProject!.path);
      setFileTree(tree);
    }

    initProject();
  }, [activeProject?.id, refreshBranches, refreshCommits]);

  // Add system message helper
  const addSystemMessage = useCallback((content: string) => {
    const msg: Message = {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    addMessage(msg);
  }, [addMessage]);

  // Send message (with slash command interception)
  const handleSendMessage = useCallback(async (content: string) => {
    // Check for slash commands first
    if (content.startsWith('/')) {
      const result = executeCommand(content, {
        onClearMessages: () => useAgentStore.getState().clearMessages(),
        onSendMessage: async (prompt, options) => {
          await window.electronAPI.snapshotDirtyFilesForCheckpoint?.();
          setStreaming(true);
          const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          };
          addMessage(userMsg);
          await window.electronAPI.sendMessage(prompt, options);
        },
        onSetModel: (model) => {
          window.electronAPI.setModel(model);
        },
        onAddSystemMessage: addSystemMessage,
      });

      if (result) {
        if (result.type === 'error') {
          addSystemMessage(result.message || 'Unknown error');
          return;
        }
        if (result.type === 'local') {
          if (result.message && !result.clearConversation) {
            addSystemMessage(result.message);
          }
          return;
        }
        if (result.type === 'cli' && result.cliPrompt) {
          // Send as CLI message with extra flags
          await window.electronAPI.snapshotDirtyFilesForCheckpoint?.();
          setStreaming(true);
          const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: content,
            timestamp: Date.now(),
          };
          addMessage(userMsg);
          if (result.message) {
            addSystemMessage(result.message);
          }
          await window.electronAPI.sendMessage(result.cliPrompt, {
            extraFlags: result.cliFlags,
          });
          return;
        }
      }
    }

    // Normal message
    await window.electronAPI.snapshotDirtyFilesForCheckpoint?.();
    setStreaming(true);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    await window.electronAPI.sendMessage(content);
  }, [addMessage, setStreaming, addSystemMessage]);

  // Interrupt
  const handleInterrupt = useCallback(async () => {
    await window.electronAPI.interruptClaude();
    setStreaming(false);
    clearStreamingContent();
    setCurrentToolCall(null);
  }, [setStreaming, clearStreamingContent, setCurrentToolCall]);

  // Checkout a commit
  const handleCheckoutCommit = useCallback(async (commitHash: string) => {
    await window.electronAPI.checkoutGitCommit(commitHash);
    await refreshCommits();
    await refreshFileTree();
  }, [refreshCommits, refreshFileTree]);

  // Preview a commit diff
  const handlePreviewCommit = useCallback(async (commitHash: string) => {
    const diff = await window.electronAPI.getGitCommitDiff(commitHash);
    if (diff) {
      setDiffContent({ old: '', new: diff });
      setDiffFile(`commit:${commitHash}`);
    }
  }, [setDiffFile]);

  // Restore to a checkpoint (checkout commit + truncate chat)
  const handleRestoreToMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];

    // Find the target assistant message with a checkpoint
    let targetAssistantMessage: Message | undefined;

    if (message.role === 'user') {
      // Look backwards for the previous assistant message with a checkpoint
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (currentMessages[i].role === 'assistant' && currentMessages[i].checkpointCommitHash) {
          targetAssistantMessage = currentMessages[i];
          break;
        }
      }
    } else if (message.role === 'assistant' && message.checkpointCommitHash) {
      targetAssistantMessage = message;
    }

    // Reset branch to checkpoint commit (removes future commits)
    if (targetAssistantMessage?.checkpointCommitHash) {
      await window.electronAPI.resetGitToCommit(targetAssistantMessage.checkpointCommitHash);
      await refreshCommits();
      await refreshFileTree();
    }

    // Truncate messages
    if (targetAssistantMessage) {
      useAgentStore.getState().truncateAfterMessage(targetAssistantMessage.id);
    } else {
      useAgentStore.getState().clearMessages();
    }
  }, [refreshCommits, refreshFileTree]);

  // Edit a previous user message (restore + populate input)
  const handleEditMessage = useCallback(async (messageId: string) => {
    const currentMessages = useAgentStore.getState().messages;
    const messageIndex = currentMessages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const message = currentMessages[messageIndex];
    if (message.role !== 'user') return;

    const editContent = message.content;

    // Find the previous assistant message with a checkpoint
    let targetAssistantMessage: Message | undefined;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (currentMessages[i].role === 'assistant' && currentMessages[i].checkpointCommitHash) {
        targetAssistantMessage = currentMessages[i];
        break;
      }
    }

    // Reset branch to checkpoint commit (removes future commits)
    if (targetAssistantMessage?.checkpointCommitHash) {
      await window.electronAPI.resetGitToCommit(targetAssistantMessage.checkpointCommitHash);
      await refreshCommits();
      await refreshFileTree();
    }

    // Truncate messages
    if (targetAssistantMessage) {
      useAgentStore.getState().truncateAfterMessage(targetAssistantMessage.id);
    } else {
      useAgentStore.getState().clearMessages();
    }

    // Populate input with the old message content
    useAgentStore.getState().setDraftInput(editContent);
  }, [refreshCommits, refreshFileTree]);

  const handleCreateCheckpoint = useCallback(async () => {
    await window.electronAPI.createCheckpoint('Manual checkpoint', 'Created by user', messages);
  }, [messages]);

  // Branch management
  const handleCreateBranch = useCallback(async (name: string) => {
    await window.electronAPI.createSession(name);
    useAgentStore.getState().clearMessages();
    await refreshBranches();
    await refreshCommits();
  }, [refreshBranches, refreshCommits]);

  const handleSwitchBranch = useCallback(async (branchName: string) => {
    await window.electronAPI.switchGitBranch(branchName);
    useAgentStore.getState().clearMessages();
    await refreshBranches();
    await refreshCommits();
    await refreshFileTree();
  }, [refreshBranches, refreshCommits, refreshFileTree]);

  // New chat on current branch (clear messages, keep checkpoints)
  const handleNewChat = useCallback(() => {
    useAgentStore.getState().clearMessages();
  }, []);

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
      onCreateCheckpoint: handleCreateCheckpoint,
      onToggleLeftPanel: toggleLeftPanel,
      onToggleRightPanel: toggleRightPanel,
      onToggleTerminal: toggleBottomPanel,
      onInterrupt: handleInterrupt,
    }),
  });

  // Welcome screen
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

          <button onClick={handleOpenFolder} className="btn btn-primary text-lg px-8 py-3">
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
              await window.electronAPI.readFile(path);
            }}
            onDiffSelect={async (path) => {
              setDiffFile(path);
              const content = await window.electronAPI.readFile(path);
              setDiffContent({ old: '', new: content || '' });
            }}
          />
        )
      }
      rightPanel={
        <CommitTimeline
          commits={commits}
          currentBranch={currentBranch}
          currentCommitHash={currentHead}
          onCheckoutCommit={handleCheckoutCommit}
          onPreviewCommit={handlePreviewCommit}
        />
      }
      bottomPanel={<EmbeddedTerminal />}
      onOpenProject={handleOpenFolder}
      branches={branches}
      currentBranchName={currentBranch}
      onCreateBranch={handleCreateBranch}
      onSwitchBranch={handleSwitchBranch}
      onNewChat={handleNewChat}
    >
      <div className="h-full flex">
        <div className="flex-1">
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            currentToolCall={currentToolCall}
            fileTree={fileTree}
            onSendMessage={handleSendMessage}
            onInterrupt={handleInterrupt}
            onRestoreToMessage={handleRestoreToMessage}
            onEditMessage={handleEditMessage}
            onReadFile={(path) => window.electronAPI.readFile(path)}
          />
        </div>

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
