import React, { useCallback, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Clock,
  FileEdit,
  GitBranch,
  ChevronRight,
  MoreVertical,
  Trash2,
  Eye,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import type { Checkpoint, CheckpointGroup } from '@claude-agent/core';

interface CheckpointTimelineProps {
  groups: CheckpointGroup[];
  currentId: string | null;
  canGoForward: boolean;
  canGoBack: boolean;
  onNavigate: (checkpointId: string) => void;
  onNavigateForward: () => void;
  onNavigateBack: () => void;
  onPreview: (checkpointId: string) => void;
  onDelete?: (checkpointId: string) => void;
}

export function CheckpointTimeline({
  groups,
  currentId,
  canGoForward,
  canGoBack,
  onNavigate,
  onNavigateForward,
  onNavigateBack,
  onPreview,
  onDelete,
}: CheckpointTimelineProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(groups.map((g) => g.label))
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Toggle group expansion
  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  // Handle preview on hover
  const handleMouseEnter = useCallback((id: string) => {
    setPreviewId(id);
    onPreview(id);
  }, [onPreview]);

  const handleMouseLeave = useCallback(() => {
    setPreviewId(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header with navigation controls */}
      <div className="panel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Checkpoints</h2>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onNavigateBack}
            disabled={!canGoBack}
            className={clsx(
              'btn-icon p-1.5',
              !canGoBack && 'opacity-30 cursor-not-allowed'
            )}
            title="Go to previous checkpoint (Ctrl+Z)"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onNavigateForward}
            disabled={!canGoForward}
            className={clsx(
              'btn-icon p-1.5',
              !canGoForward && 'opacity-30 cursor-not-allowed'
            )}
            title="Go to next checkpoint (Ctrl+Y)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <RotateCcw className="w-10 h-10 text-foreground-muted mb-3" />
            <p className="text-sm text-foreground-muted">No checkpoints yet</p>
            <p className="text-xs text-foreground-muted mt-1">
              Checkpoints are created automatically as you work
            </p>
          </div>
        ) : (
          <div className="pb-4">
            {groups.map((group) => (
              <CheckpointGroupSection
                key={group.label}
                group={group}
                currentId={currentId}
                previewId={previewId}
                isExpanded={expandedGroups.has(group.label)}
                onToggle={() => toggleGroup(group.label)}
                onNavigate={onNavigate}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CheckpointGroupSectionProps {
  group: CheckpointGroup;
  currentId: string | null;
  previewId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onDelete?: (id: string) => void;
}

function CheckpointGroupSection({
  group,
  currentId,
  previewId,
  isExpanded,
  onToggle,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  onDelete,
}: CheckpointGroupSectionProps) {
  return (
    <div>
      {/* Sticky header */}
      <button
        onClick={onToggle}
        className="sticky-header w-full flex items-center justify-between cursor-pointer hover:bg-background-tertiary"
      >
        <span>{group.label}</span>
        <div className="flex items-center gap-2">
          <span className="text-2xs bg-background-hover px-1.5 py-0.5 rounded">
            {group.checkpoints.length}
          </span>
          <ChevronRight
            className={clsx(
              'w-3 h-3 transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </button>

      {/* Checkpoint items */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 py-1 space-y-1">
              {group.checkpoints.map((checkpoint, index) => (
                <CheckpointItem
                  key={checkpoint.id}
                  checkpoint={checkpoint}
                  isCurrent={checkpoint.id === currentId}
                  isPreview={checkpoint.id === previewId}
                  showLine={index < group.checkpoints.length - 1}
                  onNavigate={onNavigate}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CheckpointItemProps {
  checkpoint: Checkpoint;
  isCurrent: boolean;
  isPreview: boolean;
  showLine: boolean;
  onNavigate: (id: string) => void;
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onDelete?: (id: string) => void;
}

function CheckpointItem({
  checkpoint,
  isCurrent,
  isPreview,
  showLine,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
  onDelete,
}: CheckpointItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const filesChangedCount = checkpoint.filesChanged.length;
  const timeAgo = formatDistanceToNow(checkpoint.timestamp, { addSuffix: true });

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
        onClick={() => !isCurrent && onNavigate(checkpoint.id)}
        onMouseEnter={() => onMouseEnter(checkpoint.id)}
        onMouseLeave={onMouseLeave}
        className={clsx(
          'checkpoint-item group',
          isCurrent && 'active',
          isPreview && !isCurrent && 'bg-background-hover/50'
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
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">
              {checkpoint.title}
            </p>
            {checkpoint.childIds.length > 1 && (
              <GitBranch className="w-3 h-3 text-foreground-muted flex-shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-foreground-muted">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            {filesChangedCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-foreground-muted">
                <FileEdit className="w-3 h-3" />
                {filesChangedCount} file{filesChangedCount !== 1 && 's'}
              </span>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="btn-icon p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-full mt-1 w-36 py-1 bg-background-secondary border border-border rounded-lg shadow-xl z-10"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(checkpoint.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-hover"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMouseEnter(checkpoint.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-hover"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                {onDelete && !isCurrent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(checkpoint.id);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background-hover text-error"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

export { CheckpointTimeline as default };
