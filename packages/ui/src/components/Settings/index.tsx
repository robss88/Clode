import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, Zap, Eye, Brain } from 'lucide-react';
import clsx from 'clsx';
import { useUIStore } from '../../stores';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  mcpServers?: MCPServer[];
  onAddMCPServer?: (server: MCPServer) => void;
  onRemoveMCPServer?: (id: string) => void;
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
}

export function Settings({ isOpen, onClose, mcpServers = [], onAddMCPServer, onRemoveMCPServer }: SettingsProps) {
  const { theme, setTheme, extendedThinking, setExtendedThinking } = useUIStore();
  const [activeTab, setActiveTab] = useState<'general' | 'mcp' | 'advanced'>('general');
  const [newMCPServer, setNewMCPServer] = useState({ name: '', url: '', description: '' });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[80vh] bg-background-tertiary border border-border-secondary rounded-lg shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Settings</h2>
            <button onClick={onClose} className="btn-icon">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 border-r border-border bg-background-secondary p-2">
              <button
                onClick={() => setActiveTab('general')}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors mb-1',
                  activeTab === 'general' ? 'bg-background-active text-foreground' : 'text-foreground-muted hover:bg-background-hover'
                )}
              >
                <Eye className="w-4 h-4" />
                <span className="text-sm">General</span>
              </button>
              <button
                onClick={() => setActiveTab('mcp')}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors mb-1',
                  activeTab === 'mcp' ? 'bg-background-active text-foreground' : 'text-foreground-muted hover:bg-background-hover'
                )}
              >
                <Server className="w-4 h-4" />
                <span className="text-sm">MCP Servers</span>
              </button>
              <button
                onClick={() => setActiveTab('advanced')}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors',
                  activeTab === 'advanced' ? 'bg-background-active text-foreground' : 'text-foreground-muted hover:bg-background-hover'
                )}
              >
                <Zap className="w-4 h-4" />
                <span className="text-sm">Advanced</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Appearance</h3>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'dark'}
                          onChange={() => setTheme('dark')}
                          className="form-radio"
                        />
                        <span className="text-sm">Dark</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'light'}
                          onChange={() => setTheme('light')}
                          className="form-radio"
                        />
                        <span className="text-sm">Light</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="theme"
                          checked={theme === 'system'}
                          onChange={() => setTheme('system')}
                          className="form-radio"
                        />
                        <span className="text-sm">System</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-3">AI Behavior</h3>
                    <label className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:border-foreground-muted transition-colors">
                      <div className="flex items-center gap-3">
                        <Brain className="w-5 h-5 text-foreground-muted" />
                        <div>
                          <span className="text-sm font-medium block">Extended Thinking</span>
                          <p className="text-xs text-foreground-muted mt-0.5">
                            Let Claude spend more time reasoning through complex problems
                          </p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={extendedThinking}
                        onChange={(e) => setExtendedThinking(e.target.checked)}
                        className="form-checkbox"
                      />
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'mcp' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">MCP Servers</h3>
                    <p className="text-xs text-foreground-muted mb-4">
                      Model Context Protocol servers extend Claude with external tools and data sources
                    </p>
                  </div>

                  {/* Add new server */}
                  <div className="p-4 bg-background border border-border rounded-lg">
                    <h4 className="text-sm font-medium mb-3">Add MCP Server</h4>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Server name"
                        value={newMCPServer.name}
                        onChange={(e) => setNewMCPServer({ ...newMCPServer, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        placeholder="Server URL or command"
                        value={newMCPServer.url}
                        onChange={(e) => setNewMCPServer({ ...newMCPServer, url: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        value={newMCPServer.description}
                        onChange={(e) => setNewMCPServer({ ...newMCPServer, description: e.target.value })}
                        className="w-full px-3 py-2 text-sm bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => {
                          if (newMCPServer.name && newMCPServer.url && onAddMCPServer) {
                            onAddMCPServer({
                              id: `mcp-${Date.now()}`,
                              name: newMCPServer.name,
                              url: newMCPServer.url,
                              description: newMCPServer.description,
                              enabled: true,
                            });
                            setNewMCPServer({ name: '', url: '', description: '' });
                          }
                        }}
                        disabled={!newMCPServer.name || !newMCPServer.url}
                        className="w-full px-3 py-2 text-sm bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add Server
                      </button>
                    </div>
                  </div>

                  {/* Server list */}
                  <div className="space-y-2">
                    {mcpServers.map((server) => (
                      <div
                        key={server.id}
                        className="flex items-center justify-between p-3 bg-background border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{server.name}</p>
                          <p className="text-xs text-foreground-muted truncate">{server.url}</p>
                          {server.description && (
                            <p className="text-xs text-foreground-muted mt-1">{server.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => onRemoveMCPServer?.(server.id)}
                          className="ml-2 px-2 py-1 text-xs text-error hover:bg-error/10 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {mcpServers.length === 0 && (
                      <p className="text-sm text-foreground-muted text-center py-8">
                        No MCP servers configured
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Advanced Settings</h3>
                    <p className="text-xs text-foreground-muted">
                      Advanced configuration options (coming soon)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
