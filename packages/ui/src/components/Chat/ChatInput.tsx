import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, File, Slash } from 'lucide-react';
import clsx from 'clsx';
import type { ContextItem, FileNode } from '@claude-agent/core';
import { useUIStore } from '../../stores';
import { getAvailableCommands, parseSlashCommand } from '../../commands';
import { ModeSelector } from './ModeSelector';
import { ModelSelector } from './ModelSelector';
import { ContextBubbleList } from './ContextBubble';

// Flatten file tree to get all file paths
function flattenFileTree(node: FileNode, rootPath?: string): Array<{ path: string; displayPath: string; name: string; type: 'file' | 'directory' }> {
  const root = rootPath ?? node.path;
  const results: Array<{ path: string; displayPath: string; name: string; type: 'file' | 'directory' }> = [];

  const displayPath = node.path === root
    ? node.name
    : node.path.startsWith(root + '/') ? node.path.slice(root.length + 1) : node.name;

  results.push({ path: node.path, displayPath, name: node.name, type: node.type });

  if (node.children) {
    for (const child of node.children) {
      results.push(...flattenFileTree(child, root));
    }
  }

  return results;
}

export interface ChatInputProps {
  /** Initial text to populate the input with */
  initialValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** File tree for @ mentions */
  fileTree?: FileNode | null;
  /** Whether to disable the input (e.g. during streaming) */
  disabled?: boolean;
  /** Whether currently streaming (shows stop button instead of send) */
  isStreaming?: boolean;
  /** Called when submitting the input */
  onSubmit: (content: string, context?: ContextItem[]) => void;
  /** Called when stop/interrupt is clicked (streaming mode) */
  onInterrupt?: () => void;
  /** Called when cancel is clicked (edit mode) */
  onCancel?: () => void;
  /** Called to read file contents for context items */
  onReadFile?: (path: string) => Promise<string | null>;
  /** Called when model changes (notifies parent) */
  onModelChange?: (model: string) => void;
  /** Direction for selector dropdowns — 'up' for bottom input, 'down' for sticky edit */
  dropdownDirection?: 'up' | 'down';
  /** Auto-focus the textarea on mount */
  autoFocus?: boolean;
}

export function ChatInput({
  initialValue = '',
  placeholder = 'Message, @ for context, / for commands',
  fileTree,
  disabled = false,
  isStreaming = false,
  onSubmit,
  onInterrupt,
  onCancel,
  onReadFile,
  onModelChange,
  dropdownDirection = 'up',
  autoFocus = false,
}: ChatInputProps) {
  const [input, setInput] = useState(initialValue);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);

  // Shared mode/model from store
  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const model = useUIStore((state) => state.model);
  const setModel = useUIStore((state) => state.setModel);

  // Flatten file tree for search
  const allFiles = useMemo(() => {
    if (!fileTree) return [];
    return flattenFileTree(fileTree).filter(f => f.type === 'file');
  }, [fileTree]);

  // Filter files based on mention query
  const filteredFiles = useMemo(() => {
    if (!mentionQuery) return allFiles.slice(0, 10);
    const query = mentionQuery.toLowerCase();
    return allFiles
      .filter(f => f.displayPath.toLowerCase().includes(query) || f.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [allFiles, mentionQuery]);

  // Filter slash commands
  const filteredCommands = useMemo(() => {
    const all = getAvailableCommands();
    if (!slashQuery) return all;
    const q = slashQuery.toLowerCase();
    return all.filter(c => c.name.startsWith(q));
  }, [slashQuery]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 50);
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '40px';
    const maxHeight = 240;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  // Scroll mention list item into view
  useEffect(() => {
    if (showMentions && mentionListRef.current) {
      const items = mentionListRef.current.querySelectorAll('button');
      const selectedItem = items[mentionIndex] as HTMLElement;
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [mentionIndex, showMentions]);

  // Scroll slash command list item into view
  useEffect(() => {
    if (showSlashCommands && slashListRef.current) {
      const items = slashListRef.current.querySelectorAll('[data-command]');
      const selectedItem = items[slashIndex] as HTMLElement;
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [slashIndex, showSlashCommands]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setInput(value);

    // Check for slash command (only at start of input)
    if (value.startsWith('/')) {
      const parsed = parseSlashCommand(value);
      if (parsed && !value.includes(' ')) {
        setShowSlashCommands(true);
        setSlashQuery(parsed.command);
        setSlashIndex(0);
        setShowMentions(false);
        return;
      }
    }
    setShowSlashCommands(false);
    setSlashQuery('');

    // Check for @ mention
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(' ')) {
          setShowMentions(true);
          setMentionQuery(query);
          setMentionStartPos(atIndex);
          setMentionIndex(0);
          return;
        }
      }
    }

    setShowMentions(false);
    setMentionQuery('');
  }, []);

  const insertMention = useCallback((filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    const beforeMention = input.slice(0, mentionStartPos);
    const afterMention = input.slice(mentionStartPos + mentionQuery.length + 1);
    const newInput = `${beforeMention}${afterMention}`.trim();
    setInput(newInput);
    setShowMentions(false);
    setMentionQuery('');

    const item: ContextItem = {
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'file',
      name: fileName,
      path: filePath,
    };
    setContextItems(prev => {
      if (prev.some(c => c.path === filePath)) return prev;
      return [...prev, item];
    });

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  }, [input, mentionStartPos, mentionQuery]);

  const insertSlashCommand = useCallback((commandName: string) => {
    const newInput = `/${commandName} `;
    setInput(newInput);
    setShowSlashCommands(false);
    setSlashQuery('');
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newInput.length, newInput.length);
      }
    }, 0);
  }, []);

  const removeContextItem = useCallback((id: string) => {
    setContextItems(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && contextItems.length === 0) || disabled) return;

    let content = input.trim();

    // Load file contents for context items
    const resolvedContext: ContextItem[] = [];
    if (contextItems.length > 0 && onReadFile) {
      const fileParts: string[] = [];
      for (const item of contextItems) {
        if (item.type === 'file' && item.path) {
          const fileContent = await onReadFile(item.path);
          if (fileContent !== null) {
            fileParts.push(`<file path="${item.path}">\n${fileContent}\n</file>`);
            resolvedContext.push({ ...item, content: fileContent, preview: fileContent.slice(0, 200) });
          } else {
            resolvedContext.push(item);
          }
        } else {
          resolvedContext.push(item);
        }
      }
      if (fileParts.length > 0) {
        content = `${fileParts.join('\n\n')}\n\n${content}`;
      }
    }

    onSubmit(content, resolvedContext.length > 0 ? resolvedContext : undefined);
    setInput('');
    setContextItems([]);
    setShowMentions(false);
  }, [input, disabled, onSubmit, contextItems, onReadFile]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle slash command navigation
    if (showSlashCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertSlashCommand(filteredCommands[slashIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashCommands(false);
        return;
      }
    }

    // Handle mention navigation
    if (showMentions && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredFiles.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredFiles.length) % filteredFiles.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertMention(filteredFiles[mentionIndex].path);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  }, [showSlashCommands, filteredCommands, slashIndex, insertSlashCommand, showMentions, filteredFiles, mentionIndex, insertMention, handleSubmit, onCancel]);

  const dropdownPositionClass = dropdownDirection === 'down'
    ? 'top-full left-0 right-0 mt-2'
    : 'bottom-full left-0 right-0 mb-2';

  return (
    <div className="relative">
      {/* Slash command autocomplete dropdown */}
      <AnimatePresence>
        {showSlashCommands && filteredCommands.length > 0 && (
          <motion.div
            ref={slashListRef}
            initial={{ opacity: 0, y: dropdownDirection === 'down' ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dropdownDirection === 'down' ? -10 : 10 }}
            className={clsx('absolute max-h-48 overflow-y-auto bg-background-secondary border border-border rounded-lg shadow-xl z-20', dropdownPositionClass)}
          >
            <div className="p-1">
              <div className="px-2 py-1 text-xs text-foreground-muted">Commands</div>
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.name}
                  type="button"
                  data-command={cmd.name}
                  onClick={() => insertSlashCommand(cmd.name)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded text-left transition-colors',
                    index === slashIndex
                      ? 'bg-background-hover text-foreground'
                      : 'hover:bg-background-hover'
                  )}
                >
                  <Slash className="w-4 h-4 text-foreground-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-mono font-medium">/{cmd.name}</span>
                    <span className="ml-2 text-xs text-foreground-muted">{cmd.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File mention autocomplete dropdown */}
      <AnimatePresence>
        {showMentions && filteredFiles.length > 0 && (
          <motion.div
            ref={mentionListRef}
            initial={{ opacity: 0, y: dropdownDirection === 'down' ? -10 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dropdownDirection === 'down' ? -10 : 10 }}
            className={clsx('absolute max-h-48 overflow-y-auto bg-background-secondary border border-border rounded-lg shadow-xl z-20', dropdownPositionClass)}
          >
            <div className="p-1">
              <div className="px-2 py-1 text-xs text-foreground-muted">
                Files {mentionQuery && `matching "${mentionQuery}"`}
              </div>
              {filteredFiles.map((file, index) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => insertMention(file.path)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded text-left transition-colors',
                    index === mentionIndex
                      ? 'bg-background-hover text-foreground'
                      : 'hover:bg-background-hover'
                  )}
                >
                  <File className="w-4 h-4 text-foreground-muted flex-shrink-0" />
                  <span className="truncate">{file.displayPath}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified input container */}
      <div className="bg-background-tertiary border border-border-secondary rounded-lg focus-within:border-foreground-muted transition-colors">
        {/* Context bubbles */}
        {contextItems.length > 0 && (
          <div className="px-3 pt-2">
            <ContextBubbleList
              items={contextItems}
              onRemove={removeContextItem}
            />
          </div>
        )}

        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full px-3 py-2 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none resize-none"
          style={{ height: '40px' }}
        />

        {/* Bottom bar: mode/model selectors + action buttons */}
        <div className="flex items-center px-1.5 pb-1.5">
          <ModeSelector mode={mode} onModeChange={setMode} dropdownDirection={dropdownDirection} />
          <ModelSelector
            model={model}
            onModelChange={(m) => {
              setModel(m);
              onModelChange?.(m);
            }}
            dropdownDirection={dropdownDirection}
          />
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors ml-1"
            >
              Cancel
            </button>
          )}
          <span className="flex-1" />
          {isStreaming && onInterrupt ? (
            <button
              type="button"
              onClick={onInterrupt}
              className="w-7 h-7 flex items-center justify-center rounded-full text-error hover:bg-background-hover transition-colors"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!input.trim() && contextItems.length === 0}
              className={clsx(
                'w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                (input.trim() || contextItems.length > 0)
                  ? 'bg-foreground text-background hover:bg-foreground-secondary'
                  : 'text-foreground-muted'
              )}
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
