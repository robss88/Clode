import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  FilePlus,
  FileX,
  FilePen,
  RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type { FileNode, FileChangeType } from '@claude-agent/core';

interface FileExplorerProps {
  root: FileNode;
  changes?: Map<string, FileChangeType>;
  selectedPath?: string;
  onFileSelect: (path: string) => void;
  onDiffSelect?: (path: string) => void;
  onRefresh?: () => void;
}

export function FileExplorer({
  root,
  changes = new Map(),
  selectedPath,
  onFileSelect,
  onDiffSelect,
  onRefresh,
}: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([root.path]));

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Count changed files
  const changedFilesCount = changes.size;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex-shrink-0">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Files</h2>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="btn-icon p-1.5" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-2">
        <FileTreeNode
          node={root}
          depth={0}
          expanded={expanded}
          changes={changes}
          selectedPath={selectedPath}
          onToggle={toggleExpand}
          onSelect={onFileSelect}
          onDiffSelect={onDiffSelect}
        />
      </div>

      {/* Changes section */}
      {changedFilesCount > 0 && (
        <div className="border-t border-border">
          <div className="sticky-header">
            Changes ({changedFilesCount})
          </div>
          <div className="px-2 py-1 space-y-0.5">
            {Array.from(changes.entries()).map(([path, changeType]) => (
              <ChangedFileItem
                key={path}
                path={path}
                changeType={changeType}
                isSelected={path === selectedPath}
                onSelect={onFileSelect}
                onDiffSelect={onDiffSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  changes: Map<string, FileChangeType>;
  selectedPath?: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDiffSelect?: (path: string) => void;
}

function FileTreeNode({
  node,
  depth,
  expanded,
  changes,
  selectedPath,
  onToggle,
  onSelect,
  onDiffSelect,
}: FileTreeNodeProps) {
  const isExpanded = expanded.has(node.path);
  const isDirectory = node.type === 'directory';
  const changeType = changes.get(node.path);
  const isSelected = node.path === selectedPath;

  const handleClick = useCallback(() => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  }, [isDirectory, node.path, onToggle, onSelect]);

  const handleDoubleClick = useCallback(() => {
    if (!isDirectory && changeType && onDiffSelect) {
      onDiffSelect(node.path);
    }
  }, [isDirectory, changeType, node.path, onDiffSelect]);

  const Icon = useMemo(() => {
    if (isDirectory) {
      return isExpanded ? FolderOpen : Folder;
    }
    return getFileIcon(node.name);
  }, [isDirectory, isExpanded, node.name]);

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={clsx(
          'file-tree-item',
          isSelected && 'selected'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand chevron for directories */}
        {isDirectory && (
          <ChevronRight
            className={clsx(
              'w-3 h-3 text-foreground-muted transition-transform flex-shrink-0',
              isExpanded && 'rotate-90'
            )}
          />
        )}
        {!isDirectory && <span className="w-3" />}

        {/* Icon */}
        <Icon
          className={clsx(
            'w-4 h-4 flex-shrink-0',
            isDirectory ? 'text-yellow-500' : 'text-foreground-muted'
          )}
        />

        {/* Name */}
        <span className="truncate flex-1">{node.name}</span>

        {/* Change indicator */}
        {changeType && (
          <ChangeIndicator type={changeType} />
        )}
      </div>

      {/* Children */}
      {isDirectory && node.children && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children
                .sort((a, b) => {
                  // Directories first
                  if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                  }
                  return a.name.localeCompare(b.name);
                })
                .map((child) => (
                  <FileTreeNode
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    expanded={expanded}
                    changes={changes}
                    selectedPath={selectedPath}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    onDiffSelect={onDiffSelect}
                  />
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

interface ChangedFileItemProps {
  path: string;
  changeType: FileChangeType;
  isSelected: boolean;
  onSelect: (path: string) => void;
  onDiffSelect?: (path: string) => void;
}

function ChangedFileItem({
  path,
  changeType,
  isSelected,
  onSelect,
  onDiffSelect,
}: ChangedFileItemProps) {
  const fileName = path.split('/').pop() || path;
  const dirPath = path.split('/').slice(0, -1).join('/');

  return (
    <div
      onClick={() => onSelect(path)}
      onDoubleClick={() => onDiffSelect?.(path)}
      className={clsx(
        'file-tree-item',
        isSelected && 'selected'
      )}
    >
      <ChangeIndicator type={changeType} />
      <span className="truncate">{fileName}</span>
      <span className="text-xs text-foreground-muted truncate ml-auto">
        {dirPath}
      </span>
    </div>
  );
}

function ChangeIndicator({ type }: { type: FileChangeType }) {
  switch (type) {
    case 'added':
      return <FilePlus className="w-3.5 h-3.5 text-success flex-shrink-0" />;
    case 'modified':
      return <FilePen className="w-3.5 h-3.5 text-warning flex-shrink-0" />;
    case 'deleted':
      return <FileX className="w-3.5 h-3.5 text-error flex-shrink-0" />;
    case 'renamed':
      return <RefreshCw className="w-3.5 h-3.5 text-accent flex-shrink-0" />;
    default:
      return null;
  }
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'vue':
    case 'svelte':
      return FileCode;
    case 'json':
    case 'yaml':
    case 'yml':
      return FileJson;
    case 'md':
    case 'txt':
    case 'doc':
    case 'docx':
      return FileText;
    default:
      return File;
  }
}

export { FileExplorer as default };
