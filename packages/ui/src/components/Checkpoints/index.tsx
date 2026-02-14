import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  FileEdit,
  GitCommitHorizontal,
  Eye,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import type { GitCommit } from '@claude-agent/core';

interface CommitTimelineProps {
  commits: GitCommit[];
  currentBranch: string | null;
  currentCommitHash?: string | null;
  onCheckoutCommit: (hash: string) => void;
  onPreviewCommit: (hash: string) => void;
}

export function CommitTimeline({
  commits,
  currentBranch,
  currentCommitHash,
  onCheckoutCommit,
  onPreviewCommit,
}: CommitTimelineProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitCommitHorizontal className="w-4 h-4 text-accent" />
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold">Commits</h2>
            {currentBranch && (
              <span className="text-2xs text-foreground-muted font-mono truncate max-w-[140px]">
                {currentBranch}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Commit List */}
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <GitCommitHorizontal className="w-10 h-10 text-foreground-muted mb-3" />
            <p className="text-sm text-foreground-muted">No commits on this branch yet</p>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-0.5">
            {commits.map((commit, index) => {
              const isCurrent = currentCommitHash
                ? commit.hashShort === currentCommitHash || commit.hash.startsWith(currentCommitHash)
                : index === 0;

              return (
                <CommitItem
                  key={commit.hash}
                  commit={commit}
                  isCurrent={isCurrent}
                  isLatest={index === 0}
                  showLine={index < commits.length - 1}
                  onCheckout={onCheckoutCommit}
                  onPreview={onPreviewCommit}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface CommitItemProps {
  commit: GitCommit;
  isCurrent: boolean;
  isLatest: boolean;
  showLine: boolean;
  onCheckout: (hash: string) => void;
  onPreview: (hash: string) => void;
}

function CommitItem({
  commit,
  isCurrent,
  isLatest,
  showLine,
  onCheckout,
  onPreview,
}: CommitItemProps) {
  const [hovered, setHovered] = useState(false);
  const timeAgo = formatDistanceToNow(commit.timestamp, { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative"
    >
      {/* Connection line */}
      {showLine && (
        <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-border" />
      )}

      <div
        onClick={() => onCheckout(commit.hash)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={clsx(
          'checkpoint-item group cursor-pointer',
          isCurrent && 'active',
        )}
      >
        {/* Indicator dot */}
        <div
          className={clsx(
            'checkpoint-indicator',
            isCurrent ? 'current' : 'default'
          )}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">
              {commit.message}
            </p>
            {isCurrent && (
              <span className="text-2xs text-accent font-medium flex-shrink-0">HEAD</span>
            )}
            {isLatest && !isCurrent && (
              <span className="text-2xs text-foreground-muted flex-shrink-0">latest</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-foreground-muted font-mono">
              {commit.hashShort}
            </span>
            <span className="flex items-center gap-1 text-xs text-foreground-muted">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            {commit.filesChanged > 0 && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted">
                <FileEdit className="w-3 h-3" />
                {commit.filesChanged}
              </span>
            )}
          </div>
        </div>

        {/* Preview button on hover */}
        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview(commit.hash);
            }}
            className="btn-icon p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Preview diff"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

// Backward-compatible alias
export const CheckpointTimeline = CommitTimeline;
export { CommitTimeline as default };
