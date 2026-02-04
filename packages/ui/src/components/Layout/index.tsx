import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronDown,
  Settings,
  FolderOpen,
} from 'lucide-react';
import clsx from 'clsx';
import { useUIStore, useProjectStore } from '../../stores';

interface LayoutProps {
  children: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  header?: React.ReactNode;
}

export function Layout({
  children,
  leftPanel,
  rightPanel,
  bottomPanel,
  header,
}: LayoutProps) {
  const { layout, toggleLeftPanel, toggleRightPanel, toggleBottomPanel, setTheme } = useUIStore();
  const { activeProject, projects, setActiveProject } = useProjectStore();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const handleProjectSelect = useCallback((projectId: string) => {
    setActiveProject(projectId);
    setShowProjectDropdown(false);
  }, [setActiveProject]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-background-secondary flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Left panel toggle */}
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

          {/* Project selector */}
          <div className="relative">
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-background-hover transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">
                {activeProject?.name || 'No Project'}
              </span>
              <ChevronDown className="w-3 h-3 text-foreground-muted" />
            </button>

            <AnimatePresence>
              {showProjectDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute top-full left-0 mt-1 w-64 py-2 bg-background-secondary border border-border rounded-lg shadow-xl z-50"
                >
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
                      No projects yet
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Center - Title */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
            Claude Agent
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(useUIStore.getState().theme === 'dark' ? 'light' : 'dark')}
            className="btn-icon"
            title="Toggle theme"
          >
            <Settings className="w-4 h-4" />
          </button>

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
        </div>
      </header>

      {/* Custom header content */}
      {header}

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <AnimatePresence initial={false}>
          {layout.leftPanel.isOpen && leftPanel && (
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

        {/* Right panel */}
        <AnimatePresence initial={false}>
          {layout.rightPanel.isOpen && rightPanel && (
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
