import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  Settings,
  FolderOpen,
  FolderPlus,
  Menu,
  GitBranch as GitBranchIcon,
  Plus,
  MessageSquarePlus,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useUIStore, useProjectStore } from '../../stores';
import type { GitBranch } from '@claude-agent/core';

// Breakpoints for responsive design
const NARROW_WIDTH = 400;  // Below this, hide both panels and show minimal header (sidebar mode)
const MEDIUM_WIDTH = 700;  // Below this, hide right panel only

interface LayoutProps {
  children: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  header?: React.ReactNode;
  onOpenProject?: () => void;
  // Branch management
  branches?: GitBranch[];
  currentBranchName?: string | null;
  onCreateBranch?: (name: string) => void;
  onSwitchBranch?: (branchName: string) => void;
  onNewChat?: () => void;
}

export function Layout({
  children,
  leftPanel,
  rightPanel,
  bottomPanel,
  header,
  onOpenProject,
  branches = [],
  currentBranchName,
  onCreateBranch,
  onSwitchBranch,
  onNewChat,
}: LayoutProps) {
  const { layout, toggleLeftPanel, toggleRightPanel, setTheme } = useUIStore();
  const { activeProject, projects, setActiveProject } = useProjectStore();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');

  const filteredBranches = useMemo(() => {
    if (!branchFilter.trim()) return branches;
    const query = branchFilter.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(query));
  }, [branches, branchFilter]);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1000);

  // Track window width for responsive design
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Responsive breakpoints
  const isNarrow = windowWidth < NARROW_WIDTH;
  const isMedium = windowWidth < MEDIUM_WIDTH;

  // Auto-hide panels based on width
  const showLeftPanel = layout.leftPanel.isOpen && leftPanel && !isNarrow;
  const showRightPanel = layout.rightPanel.isOpen && rightPanel && !isNarrow && !isMedium;

  const handleProjectSelect = useCallback((projectId: string) => {
    setActiveProject(projectId);
    setShowProjectDropdown(false);
    setShowBranchDropdown(false);
    setIsCreatingBranch(false);
  }, [setActiveProject]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-dropdown]')) {
        setShowProjectDropdown(false);
        setShowBranchDropdown(false);
        setIsCreatingBranch(false);
        setBranchFilter('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header - compact when narrow, draggable for Electron */}
      {/* pl-20 accounts for macOS traffic light buttons with titleBarStyle: 'hiddenInset' */}
      <header className={clsx(
        "flex items-center justify-between border-b border-border bg-background-secondary flex-shrink-0 app-drag pl-20",
        isNarrow ? "h-10 pr-2" : "h-12 pr-4"
      )}>
        <div className="flex items-center gap-2 app-no-drag">
          {/* Left panel toggle - hidden when narrow */}
          {!isNarrow && (
            <button
              onClick={toggleLeftPanel}
              className="btn-icon"
              title={layout.leftPanel.isOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {layout.leftPanel.isOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Project selector - simplified when narrow */}
          <div className="relative" data-dropdown>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className={clsx(
                "flex items-center gap-2 rounded-lg hover:bg-background-hover transition-colors",
                isNarrow ? "px-2 py-1" : "px-3 py-1.5"
              )}
            >
              <FolderOpen className={clsx("text-accent", isNarrow ? "w-3 h-3" : "w-4 h-4")} />
              {!isNarrow && (
                <>
                  <span className="text-sm font-medium">
                    {activeProject?.name || 'No Project'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-foreground-muted" />
                </>
              )}
            </button>

            <AnimatePresence>
              {showProjectDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute top-full left-0 mt-1 w-64 py-2 bg-background-secondary border border-border rounded-lg shadow-xl z-50"
                >
                  {/* Open Project button */}
                  {onOpenProject && (
                    <button
                      onClick={() => {
                        setShowProjectDropdown(false);
                        onOpenProject();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-background-hover transition-colors border-b border-border mb-1"
                    >
                      <FolderPlus className="w-4 h-4 text-accent" />
                      <span className="text-sm font-medium text-accent">Open Project...</span>
                    </button>
                  )}

                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project.id)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-background-hover transition-colors',
                        project.id === activeProject?.id && 'bg-background-hover'
                      )}
                    >
                      <FolderOpen className="w-4 h-4 text-foreground-muted" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-foreground-muted truncate">
                          {project.path}
                        </p>
                      </div>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <p className="px-4 py-2 text-sm text-foreground-muted">
                      No recent projects
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Branch selector - only show when project is active */}
          {activeProject && onSwitchBranch && (
            <>
              <span className="text-foreground-muted">/</span>
              <div className="relative" data-dropdown>
                <button
                  onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg hover:bg-background-hover transition-colors",
                    isNarrow ? "px-2 py-1" : "px-3 py-1.5"
                  )}
                >
                  <GitBranchIcon className={clsx("text-purple-400", isNarrow ? "w-3 h-3" : "w-4 h-4")} />
                  {!isNarrow && (
                    <>
                      <span className="text-sm font-medium font-mono truncate max-w-[120px]">
                        {currentBranchName || 'No Branch'}
                      </span>
                      <ChevronDown className="w-3 h-3 text-foreground-muted" />
                    </>
                  )}
                </button>

                <AnimatePresence>
                  {showBranchDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="absolute top-full left-0 mt-1 w-64 py-2 bg-background-secondary border border-border rounded-lg shadow-xl z-50"
                    >
                      {/* New Branch + New Chat actions */}
                      <div className="px-3 py-2 border-b border-border mb-1 space-y-1">
                        {onCreateBranch && (
                          <>
                            {isCreatingBranch ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  if (newBranchName.trim()) {
                                    onCreateBranch(newBranchName.trim());
                                    setNewBranchName('');
                                    setIsCreatingBranch(false);
                                    setShowBranchDropdown(false);
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="text"
                                  value={newBranchName}
                                  onChange={(e) => setNewBranchName(e.target.value)}
                                  placeholder="Branch name..."
                                  autoFocus
                                  className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent"
                                />
                                <button
                                  type="submit"
                                  className="px-2 py-1 text-sm bg-accent text-white rounded hover:bg-accent/80"
                                >
                                  Create
                                </button>
                              </form>
                            ) : (
                              <button
                                onClick={() => setIsCreatingBranch(true)}
                                className="w-full flex items-center gap-2 text-left hover:text-accent transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-sm font-medium">New Branch...</span>
                              </button>
                            )}
                          </>
                        )}
                        {onNewChat && (
                          <button
                            onClick={() => {
                              onNewChat();
                              setShowBranchDropdown(false);
                            }}
                            className="w-full flex items-center gap-2 text-left hover:text-accent transition-colors"
                          >
                            <MessageSquarePlus className="w-4 h-4" />
                            <span className="text-sm font-medium">New Chat</span>
                          </button>
                        )}
                      </div>

                      {/* Branch search */}
                      <div className="px-3 py-1.5 border-b border-border">
                        <div className="flex items-center gap-2 px-2 py-1 bg-background border border-border rounded">
                          <Search className="w-3.5 h-3.5 text-foreground-muted flex-shrink-0" />
                          <input
                            type="text"
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            placeholder="Filter branches..."
                            className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-foreground-muted"
                            autoFocus={!isCreatingBranch}
                          />
                          {branchFilter && (
                            <span className="text-2xs text-foreground-muted flex-shrink-0">
                              {filteredBranches.length}/{branches.length}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Branch list */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredBranches.map((branch) => (
                          <button
                            key={branch.name}
                            onClick={() => {
                              onSwitchBranch(branch.name);
                              setShowBranchDropdown(false);
                              setBranchFilter('');
                            }}
                            className={clsx(
                              'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-background-hover transition-colors',
                              branch.name === currentBranchName && 'bg-background-hover'
                            )}
                          >
                            <GitBranchIcon className="w-4 h-4 text-foreground-muted flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium font-mono truncate">{branch.name}</p>
                              {branch.lastCommitDate && (
                                <p className="text-xs text-foreground-muted">
                                  {formatDistanceToNow(new Date(branch.lastCommitDate), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                            {branch.current && (
                              <span className="text-xs text-accent font-medium flex-shrink-0">current</span>
                            )}
                          </button>
                        ))}
                      </div>
                      {filteredBranches.length === 0 && (
                        <p className="px-4 py-2 text-sm text-foreground-muted">
                          {branchFilter ? 'No matching branches' : 'No branches yet'}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* Center - Title */}
        <div className="flex items-center gap-2">
          <span className={clsx(
            "font-semibold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent",
            isNarrow ? "text-xs" : "text-sm"
          )}>
            {isNarrow ? "Claude" : "Claude Agent"}
          </span>
        </div>

        {/* Right side - simplified when narrow */}
        <div className="flex items-center gap-1 app-no-drag">
          {/* New Branch quick button */}
          {!isNarrow && activeProject && onCreateBranch && (
            <button
              onClick={() => {
                setShowBranchDropdown(true);
                setIsCreatingBranch(true);
              }}
              className="btn-icon"
              title="New Branch"
            >
              <GitBranchIcon className="w-4 h-4" />
              <Plus className="w-3 h-3 -ml-1.5 -mb-1.5" />
            </button>
          )}

          {!isNarrow && (
            <button
              onClick={() => setTheme(useUIStore.getState().theme === 'dark' ? 'light' : 'dark')}
              className="btn-icon"
              title="Toggle theme"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {!isNarrow && !isMedium && (
            <button
              onClick={toggleRightPanel}
              className="btn-icon"
              title={layout.rightPanel.isOpen ? 'Hide checkpoints' : 'Show checkpoints'}
            >
              {layout.rightPanel.isOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Menu button for narrow mode */}
          {isNarrow && (
            <button
              onClick={toggleLeftPanel}
              className="btn-icon"
              title="Menu"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Custom header content */}
      {header}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - hidden when narrow */}
        <AnimatePresence initial={false}>
          {showLeftPanel && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: layout.leftPanel.size, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-r border-border bg-background-secondary overflow-hidden flex-shrink-0"
            >
              <div className="h-full overflow-auto">
                {leftPanel}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Center content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {children}
          </div>

          {/* Bottom panel */}
          <AnimatePresence initial={false}>
            {layout.bottomPanel.isOpen && bottomPanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: layout.bottomPanel.size, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-border bg-background-secondary overflow-hidden flex-shrink-0"
              >
                {bottomPanel}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right panel - hidden when narrow or medium */}
        <AnimatePresence initial={false}>
          {showRightPanel && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: layout.rightPanel.size, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-border bg-background-secondary overflow-hidden flex-shrink-0"
            >
              <div className="h-full overflow-auto">
                {rightPanel}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export { Layout as default };
