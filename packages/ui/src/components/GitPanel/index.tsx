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
  FilePlus2,
  FileEdit,
  FileX2,
  FileQuestion,
  FileSymlink,
  Check,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { CommitTimeline } from '../Checkpoints';
import type { GitBranch, GitCommit, GitStatus, GitFileStatusCode } from '@claude-agent/core';

interface GitPanelProps {
  branches: GitBranch[];
  commits: GitCommit[];
  currentBranch: string | null;
  currentCommitHash: string | null;
  gitStatus: GitStatus | null;
  onSwitchBranch: (branchName: string) => void;
  onCreateBranch: (name: string) => void;
  onCheckoutCommit: (hash: string) => void;
  onPreviewCommit: (hash: string) => void;
  onPushToRemote: () => Promise<void>;
  onCommitAll: (message: string) => Promise<void>;
  onRefreshStatus: () => void;
}

export function GitPanel({
  branches,
  commits,
  currentBranch,
  currentCommitHash,
  gitStatus,
  onSwitchBranch,
  onCreateBranch,
  onCheckoutCommit,
  onPreviewCommit,
  onPushToRemote,
  onCommitAll,
  onRefreshStatus,
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

        {/* Uncommitted Changes Section */}
        {gitStatus && !gitStatus.isClean && (
          <UncommittedChanges
            gitStatus={gitStatus}
            onCommitAll={onCommitAll}
            onPushToRemote={onPushToRemote}
          />
        )}

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

// --- Status icon & color helpers ---

const STATUS_CONFIG: Record<GitFileStatusCode, { icon: typeof FileEdit; color: string; label: string }> = {
  added: { icon: FilePlus2, color: 'text-green-400', label: 'A' },
  modified: { icon: FileEdit, color: 'text-yellow-400', label: 'M' },
  deleted: { icon: FileX2, color: 'text-red-400', label: 'D' },
  renamed: { icon: FileSymlink, color: 'text-blue-400', label: 'R' },
  untracked: { icon: FileQuestion, color: 'text-foreground-muted', label: '?' },
};

function FileStatusIcon({ status }: { status: GitFileStatusCode }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.modified;
  const Icon = cfg.icon;
  return <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', cfg.color)} />;
}

// --- Uncommitted Changes section ---

function UncommittedChanges({
  gitStatus,
  onCommitAll,
  onPushToRemote,
}: {
  gitStatus: GitStatus;
  onCommitAll: (message: string) => Promise<void>;
  onPushToRemote: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [commitMsg, setCommitMsg] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const totalChanges = gitStatus.files.length;

  const handleCommitAndPush = async () => {
    const msg = commitMsg.trim();
    if (!msg || isCommitting) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await onCommitAll(msg);
      setCommitMsg('');
      // Push immediately after committing
      await onPushToRemote();
    } catch (err: any) {
      setCommitError(err?.message || 'Commit failed');
      setTimeout(() => setCommitError(null), 4000);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleCommitOnly = async () => {
    const msg = commitMsg.trim();
    if (!msg || isCommitting) return;
    setIsCommitting(true);
    setCommitError(null);
    try {
      await onCommitAll(msg);
      setCommitMsg('');
    } catch (err: any) {
      setCommitError(err?.message || 'Commit failed');
      setTimeout(() => setCommitError(null), 4000);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <FileEdit className="w-3 h-3" />
        <span>Uncommitted Changes</span>
        <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-2xs font-bold px-1.5 rounded-full">
          {totalChanges}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {/* Commit message input */}
          <div className="mb-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitAndPush();
                }
              }}
              disabled={isCommitting}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5 mb-2">
            <button
              onClick={handleCommitOnly}
              disabled={!commitMsg.trim() || isCommitting}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                !commitMsg.trim() || isCommitting
                  ? 'bg-surface-hover text-foreground-muted cursor-not-allowed'
                  : 'bg-surface-hover hover:bg-accent/20 text-foreground hover:text-accent'
              )}
            >
              {isCommitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Commit
            </button>
            <button
              onClick={handleCommitAndPush}
              disabled={!commitMsg.trim() || isCommitting}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors',
                !commitMsg.trim() || isCommitting
                  ? 'bg-accent/20 text-accent/50 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white'
              )}
            >
              {isCommitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Commit & Push
            </button>
          </div>

          {commitError && (
            <p className="text-xs text-error mb-2 truncate" title={commitError}>
              {commitError}
            </p>
          )}

          {/* File list */}
          <div className="max-h-48 overflow-y-auto space-y-px">
            {gitStatus.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-background-hover"
              >
                <FileStatusIcon status={file.status} />
                <span className="text-xs font-mono truncate flex-1" title={file.path}>
                  {file.path.includes('/') ? file.path.split('/').pop() : file.path}
                </span>
                <span className="text-2xs text-foreground-muted flex-shrink-0 font-mono">
                  {file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''}
                </span>
                <span className={clsx(
                  'text-2xs font-bold flex-shrink-0 w-4 text-center',
                  STATUS_CONFIG[file.status]?.color || 'text-foreground-muted'
                )}>
                  {STATUS_CONFIG[file.status]?.label || '?'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default GitPanel;
