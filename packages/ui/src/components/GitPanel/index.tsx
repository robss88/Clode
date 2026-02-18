import React, { useState, useMemo } from 'react';
import {
  GitBranch as GitBranchIcon,
  Plus,
  Search,
  Upload,
  Loader2,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { CommitTimeline } from '../Checkpoints';
import type { GitBranch, GitCommit } from '@claude-agent/core';

interface GitPanelProps {
  branches: GitBranch[];
  commits: GitCommit[];
  currentBranch: string | null;
  currentCommitHash: string | null;
  onSwitchBranch: (branchName: string) => void;
  onCreateBranch: (name: string) => void;
  onCheckoutCommit: (hash: string) => void;
  onPreviewCommit: (hash: string) => void;
  onPushToRemote: () => Promise<void>;
}

export function GitPanel({
  branches,
  commits,
  currentBranch,
  currentCommitHash,
  onSwitchBranch,
  onCreateBranch,
  onCheckoutCommit,
  onPreviewCommit,
  onPushToRemote,
}: GitPanelProps) {
  const [branchesExpanded, setBranchesExpanded] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  const filteredBranches = useMemo(() => {
    if (!branchFilter.trim()) return branches;
    const query = branchFilter.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(query));
  }, [branches, branchFilter]);

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBranchName.trim()) {
      onCreateBranch(newBranchName.trim());
      setNewBranchName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Git</h2>
        </div>
      </div>

      {/* Push to Remote (sticky at top) */}
      {commits.length > 0 && (
        <PushButton onPush={onPushToRemote} />
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Branch Section */}
        <div className="border-b border-border">
          {/* Branch section header */}
          <button
            onClick={() => setBranchesExpanded(!branchesExpanded)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors"
          >
            {branchesExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <GitBranchIcon className="w-3 h-3" />
            <span>Branches</span>
            <span className="ml-auto text-foreground-muted">{branches.length}</span>
          </button>

          {branchesExpanded && (
            <div className="pb-2">
              {/* Create branch */}
              {isCreating ? (
                <form onSubmit={handleCreateBranch} className="px-3 pb-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="Branch name..."
                      autoFocus
                      className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsCreating(false);
                          setNewBranchName('');
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent/80"
                    >
                      Create
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center gap-2 px-3 py-1 text-xs text-foreground-muted hover:text-accent transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>New branch</span>
                </button>
              )}

              {/* Branch filter (show when > 5 branches) */}
              {branches.length > 5 && (
                <div className="px-3 pb-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-background border border-border rounded">
                    <Search className="w-3 h-3 text-foreground-muted flex-shrink-0" />
                    <input
                      type="text"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      placeholder="Filter..."
                      className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-foreground-muted"
                    />
                  </div>
                </div>
              )}

              {/* Branch list */}
              <div className="max-h-48 overflow-y-auto">
                {filteredBranches.map((branch) => {
                  const isCurrent = branch.name === currentBranch;
                  return (
                    <button
                      key={branch.name}
                      onClick={() => {
                        if (!isCurrent) onSwitchBranch(branch.name);
                      }}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
                        isCurrent
                          ? 'bg-accent/10 text-accent'
                          : 'hover:bg-background-hover text-foreground'
                      )}
                    >
                      <GitBranchIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="text-xs font-mono truncate flex-1">
                        {branch.name}
                      </span>
                      {isCurrent && (
                        <span className="text-2xs font-medium flex-shrink-0">HEAD</span>
                      )}
                      {branch.lastCommitDate && !isCurrent && (
                        <span className="text-2xs text-foreground-muted flex-shrink-0">
                          {formatDistanceToNow(new Date(branch.lastCommitDate), { addSuffix: true })}
                        </span>
                      )}
                    </button>
                  );
                })}
                {filteredBranches.length === 0 && (
                  <p className="px-3 py-2 text-xs text-foreground-muted">
                    {branchFilter ? 'No matching branches' : 'No branches'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Commit Timeline Section (reuses existing component, without its own push button) */}
        <div className="flex-1">
          <CommitTimeline
            commits={commits}
            currentBranch={currentBranch}
            currentCommitHash={currentCommitHash}
            onCheckoutCommit={onCheckoutCommit}
            onPreviewCommit={onPreviewCommit}
          />
        </div>
      </div>
    </div>
  );
}

function PushButton({ onPush }: { onPush: () => Promise<void> }) {
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const handlePush = async () => {
    if (isPushing) return;
    setIsPushing(true);
    setPushError(null);
    try {
      await onPush();
    } catch (err: any) {
      setPushError(err?.message || 'Push failed');
      setTimeout(() => setPushError(null), 4000);
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="flex-shrink-0 border-b border-border p-2">
      {pushError && (
        <p className="text-xs text-error mb-1.5 px-1 truncate" title={pushError}>
          {pushError}
        </p>
      )}
      <button
        onClick={handlePush}
        disabled={isPushing}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isPushing
            ? 'bg-accent/20 text-accent cursor-wait'
            : 'bg-accent hover:bg-accent-hover text-white'
        )}
      >
        {isPushing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        <span>{isPushing ? 'Pushing...' : 'Push to Remote'}</span>
      </button>
    </div>
  );
}

export default GitPanel;
