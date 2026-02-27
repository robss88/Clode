import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Square, File, Slash } from 'lucide-react';
import clsx from 'clsx';
import type { ContextItem, FileNode } from '@claude-agent/core';
import { useUIStore } from '../../stores';
import { getAvailableCommands, parseSlashCommand } from '../../commands';
import { ModeSelector } from './ModeSelector';
import { ModelSelector } from './ModelSelector';

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

// ─── Helpers for contentEditable ────────────────────────────────────

const MENTION_ATTR = 'data-mention-path';

/** Shared file preview cache so we don't re-fetch on every hover */
const filePreviewCache = new Map<string, string | null>();

/** Create a mention chip DOM element */
function createMentionChip(fileName: string, filePath: string, readFile?: (path: string) => Promise<string | null>): HTMLSpanElement {
  const chip = document.createElement('span');
  chip.setAttribute(MENTION_ATTR, filePath);
  chip.setAttribute('contenteditable', 'false');
  chip.style.userSelect = 'all';
  chip.style.webkitUserSelect = 'all';
  chip.style.display = 'inline';
  chip.style.MozUserSelect = 'all';
  chip.className = 'px-1.5 py-px mx-0.5 rounded bg-background-hover border border-border text-[11px] text-foreground-secondary cursor-default';
  chip.textContent = `@${fileName}`;

  // Hover tooltip with file preview
  let tooltip: HTMLDivElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function showTooltip() {
    if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    if (tooltip) return; // already showing

    tooltip = document.createElement('div');
    tooltip.className = 'fixed z-50 w-80 max-h-64 overflow-y-auto rounded-lg border border-border bg-background-tertiary shadow-xl text-[11px] font-mono p-2 whitespace-pre-wrap break-all';

    // Position below the chip
    const rect = chip.getBoundingClientRect();
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;

    // Path header
    const header = document.createElement('div');
    header.className = 'text-foreground-secondary font-medium mb-1.5 pb-1.5 border-b border-border text-[11px]';
    header.textContent = filePath;
    tooltip.appendChild(header);

    // Content area
    const contentEl = document.createElement('div');
    contentEl.className = 'text-foreground-muted';
    contentEl.textContent = 'Loading...';
    tooltip.appendChild(contentEl);

    // Keep tooltip alive when hovering over it
    tooltip.addEventListener('mouseenter', () => {
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    });
    tooltip.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(removeTooltip, 150);
    });

    document.body.appendChild(tooltip);

    // Load file content
    (async () => {
      let content = filePreviewCache.get(filePath);
      if (content === undefined && readFile) {
        content = await readFile(filePath);
        filePreviewCache.set(filePath, content);
      }

      if (contentEl && document.body.contains(contentEl)) {
        if (content) {
          const lines = content.split('\n');
          const preview = lines.slice(0, 40).join('\n') + (lines.length > 40 ? `\n... (${lines.length - 40} more lines)` : '');
          contentEl.textContent = preview;
        } else {
          contentEl.textContent = '(unable to load file)';
        }
      }
    })();
  }

  function removeTooltip() {
    if (tooltip && document.body.contains(tooltip)) {
      document.body.removeChild(tooltip);
    }
    tooltip = null;
  }

  chip.addEventListener('mouseenter', showTooltip);
  chip.addEventListener('mouseleave', () => {
    hideTimeout = setTimeout(removeTooltip, 200);
  });

  return chip;
}

/** Get plain text from the contentEditable div, converting chips to @filename */
function getPlainText(el: HTMLElement): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      if (element.hasAttribute(MENTION_ATTR)) {
        text += element.textContent || '';
      } else if (element.tagName === 'BR') {
        text += '\n';
      } else {
        // Recurse for nested elements (e.g. divs created by Enter)
        text += getPlainText(element);
        // Add newline after block-level elements
        if (['DIV', 'P'].includes(element.tagName)) {
          text += '\n';
        }
      }
    }
  }
  return text;
}

/** Extract all mention paths from the contentEditable div */
function extractMentions(el: HTMLElement): Array<{ name: string; path: string }> {
  const mentions: Array<{ name: string; path: string }> = [];
  const chips = el.querySelectorAll(`[${MENTION_ATTR}]`);
  chips.forEach((chip) => {
    const path = chip.getAttribute(MENTION_ATTR)!;
    const name = path.split('/').pop() || path;
    if (!mentions.some((m) => m.path === path)) {
      mentions.push({ name, path });
    }
  });
  return mentions;
}

/** Place cursor at end of contentEditable */
function placeCursorAtEnd(el: HTMLElement) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Place cursor after a specific node */
function placeCursorAfter(node: Node) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStartAfter(node);
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Get text content before cursor in the contentEditable */
function getTextBeforeCursor(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const range = sel.getRangeAt(0);

  const preRange = document.createRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);

  const fragment = preRange.cloneContents();
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  return getPlainText(tempDiv);
}

// ─── Component ──────────────────────────────────────────────────────

export interface ChatInputProps {
  initialValue?: string;
  placeholder?: string;
  fileTree?: FileNode | null;
  disabled?: boolean;
  isStreaming?: boolean;
  minHeight?: number;
  onSubmit: (content: string, context?: ContextItem[]) => void;
  onInterrupt?: () => void;
  onCancel?: () => void;
  onReadFile?: (path: string) => Promise<string | null>;
  onModelChange?: (model: string) => void;
  dropdownDirection?: 'up' | 'down';
  autoFocus?: boolean;
}

export function ChatInput({
  initialValue = '',
  placeholder = 'Message, @ for context, / for commands',
  fileTree,
  disabled = false,
  isStreaming = false,
  minHeight = 40,
  onSubmit,
  onInterrupt,
  onCancel,
  onReadFile,
  onModelChange,
  dropdownDirection = 'up',
  autoFocus = false,
}: ChatInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [hasContent, setHasContent] = useState(!!initialValue);

  const editorRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  // Track the range where @query starts so we can replace it
  const mentionStartRef = useRef<{ node: Node; offset: number } | null>(null);

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
    if (autoFocus && editorRef.current) {
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          if (initialValue) {
            placeCursorAtEnd(editorRef.current);
          }
        }
      }, 50);
    }
  }, [autoFocus, initialValue]);

  // Auto-resize
  const updateHeight = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = '40px';
    const maxHeight = 240;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

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

  /** Check for @mentions or /commands after the user types */
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    const text = getPlainText(el).replace(/\n$/, '');
    setHasContent(text.length > 0);
    updateHeight();

    // Check for slash command (only at start of input)
    if (text.startsWith('/')) {
      const parsed = parseSlashCommand(text);
      if (parsed && !text.includes(' ')) {
        setShowSlashCommands(true);
        setSlashQuery(parsed.command);
        setSlashIndex(0);
        setShowMentions(false);
        return;
      }
    }
    setShowSlashCommands(false);
    setSlashQuery('');

    // Check for @ mention — look at text before cursor
    const textBeforeCursor = getTextBeforeCursor(el);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex !== -1) {
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          setShowMentions(true);
          setMentionQuery(query);
          setMentionIndex(0);

          // Save the cursor position for later replacement
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            // Walk back to find the @ character in the text node
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
              const nodeText = range.startContainer.textContent || '';
              const cursorInNode = range.startOffset;
              // The @ is somewhere in this text node or a previous one
              const atInNode = nodeText.lastIndexOf('@', cursorInNode - 1);
              if (atInNode !== -1) {
                mentionStartRef.current = { node: range.startContainer, offset: atInNode };
              }
            }
          }
          return;
        }
      }
    }

    setShowMentions(false);
    setMentionQuery('');
    mentionStartRef.current = null;
  }, [updateHeight]);

  /** Insert a file mention chip at the current @ position */
  const insertMention = useCallback((filePath: string) => {
    const el = editorRef.current;
    if (!el) return;

    const fileName = filePath.split('/').pop() || filePath;
    const chip = createMentionChip(fileName, filePath, onReadFile);

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && mentionStartRef.current) {
      const { node, offset } = mentionStartRef.current;
      const range = sel.getRangeAt(0);

      // Delete from @ to current cursor position
      const deleteRange = document.createRange();
      deleteRange.setStart(node, offset);
      deleteRange.setEnd(range.startContainer, range.startOffset);
      deleteRange.deleteContents();

      // Insert chip at the deletion point
      const insertRange = document.createRange();
      insertRange.setStart(node, offset);
      insertRange.collapse(true);

      // Add a space after the chip
      const space = document.createTextNode('\u00A0');
      insertRange.insertNode(space);
      insertRange.insertNode(chip);

      placeCursorAfter(space);
    } else {
      // Fallback: append at end
      el.appendChild(chip);
      const space = document.createTextNode('\u00A0');
      el.appendChild(space);
      placeCursorAfter(space);
    }

    setShowMentions(false);
    setMentionQuery('');
    mentionStartRef.current = null;
    setHasContent(true);
    updateHeight();

    el.focus();
  }, [onReadFile, updateHeight]);

  const insertSlashCommand = useCallback((commandName: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.textContent = `/${commandName} `;
    setShowSlashCommands(false);
    setSlashQuery('');
    setHasContent(true);
    setTimeout(() => {
      if (el) {
        el.focus();
        placeCursorAtEnd(el);
      }
    }, 0);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const el = editorRef.current;
    if (!el) return;

    const text = getPlainText(el).replace(/\n$/, '').trim();
    const mentions = extractMentions(el);

    if (!text && mentions.length === 0) return;
    if (disabled) return;

    // Build content — prepend file contents
    let content = text;
    const resolvedContext: ContextItem[] = [];

    if (mentions.length > 0 && onReadFile) {
      const fileParts: string[] = [];
      for (const mention of mentions) {
        const fileContent = await onReadFile(mention.path);
        const item: ContextItem = {
          id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'file',
          name: mention.name,
          path: mention.path,
        };
        if (fileContent !== null) {
          fileParts.push(`<file path="${mention.path}">\n${fileContent}\n</file>`);
          resolvedContext.push({ ...item, content: fileContent, preview: fileContent.slice(0, 200) });
        } else {
          resolvedContext.push(item);
        }
      }
      if (fileParts.length > 0) {
        content = `${fileParts.join('\n\n')}\n\n${content}`;
      }
    }

    onSubmit(content, resolvedContext.length > 0 ? resolvedContext : undefined);

    // Clear editor
    el.innerHTML = '';
    setHasContent(false);
    setShowMentions(false);
    updateHeight();
  }, [disabled, onSubmit, onReadFile, updateHeight]);

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

  // Handle copy — put both plain text and HTML with chip markup on clipboard
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const fragment = sel.getRangeAt(0).cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    e.preventDefault();
    e.clipboardData.setData('text/plain', getPlainText(tempDiv));
    // Preserve chip HTML so pasting into another ChatInput reconstructs chips
    e.clipboardData.setData('text/html', tempDiv.innerHTML);
  }, []);

  // Handle paste — reconstruct mention chips if pasted from another ChatInput
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Delete any selected content first
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const html = e.clipboardData.getData('text/html');

    // Check if the HTML contains our mention chips
    if (html && html.includes(MENTION_ATTR)) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Walk the pasted HTML and rebuild nodes: keep chips, convert everything else to text
      let lastInserted: Node | null = null;
      const insertAt = range.cloneRange();
      insertAt.collapse(true);

      function processNodes(parent: HTMLElement) {
        for (const node of Array.from(parent.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            const textNode = document.createTextNode(node.textContent || '');
            insertAt.insertNode(textNode);
            insertAt.setStartAfter(textNode);
            insertAt.collapse(true);
            lastInserted = textNode;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.hasAttribute(MENTION_ATTR)) {
              // Reconstruct the mention chip
              const path = el.getAttribute(MENTION_ATTR)!;
              const name = path.split('/').pop() || path;
              const chip = createMentionChip(name, path, onReadFile);
              insertAt.insertNode(chip);
              insertAt.setStartAfter(chip);
              insertAt.collapse(true);
              lastInserted = chip;
            } else if (el.tagName === 'BR') {
              const br = document.createElement('br');
              insertAt.insertNode(br);
              insertAt.setStartAfter(br);
              insertAt.collapse(true);
              lastInserted = br;
            } else {
              // Recurse into other elements
              processNodes(el);
            }
          }
        }
      }

      processNodes(tempDiv);

      if (lastInserted) {
        placeCursorAfter(lastInserted);
      }
    } else {
      // Plain text paste
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;

      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      placeCursorAfter(textNode);
    }

    setHasContent(true);
    updateHeight();
  }, [onReadFile, updateHeight]);

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
            className={clsx('absolute max-h-48 overflow-y-auto bg-background-tertiary border border-border-secondary rounded-lg shadow-xl z-20', dropdownPositionClass)}
          >
            <div className="p-1">
              <div className="px-3 py-1 text-xs text-foreground-muted">Commands</div>
              {filteredCommands.map((cmd, index) => (
                <button
                  key={cmd.name}
                  type="button"
                  data-command={cmd.name}
                  onClick={() => insertSlashCommand(cmd.name)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors',
                    index === slashIndex
                      ? 'bg-background-active text-foreground hover:bg-background-active'
                      : 'hover:bg-background-hover text-foreground'
                  )}
                >
                  <Slash className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">/{cmd.name}</div>
                    <div className="text-xs text-foreground-muted">{cmd.description}</div>
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
            className={clsx('absolute max-h-48 overflow-y-auto bg-background-tertiary border border-border-secondary rounded-lg shadow-xl z-20', dropdownPositionClass)}
          >
            <div className="p-1">
              <div className="px-3 py-1 text-xs text-foreground-muted">
                Files {mentionQuery && `matching "${mentionQuery}"`}
              </div>
              {filteredFiles.map((file, index) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => insertMention(file.path)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors',
                    index === mentionIndex
                      ? 'bg-background-active text-foreground hover:bg-background-active'
                      : 'hover:bg-background-hover text-foreground'
                  )}
                >
                  <File className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm">{file.displayPath}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified input container */}
      <div className="bg-background-tertiary border border-border-secondary rounded-lg focus-within:border-foreground-muted transition-colors">
        {/* ContentEditable input with inline mention chips */}
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onCopy={handleCopy}
            onCut={handleCopy}
            onPaste={handlePaste}
            className={clsx(
              'w-full px-3 py-2 bg-transparent text-sm text-foreground focus:outline-none overflow-y-auto',
              'whitespace-pre-wrap break-words',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            style={{ minHeight: `${minHeight}px`, maxHeight: '240px' }}
            data-placeholder={placeholder}
          >
            {initialValue || ''}
          </div>
          {/* Placeholder text */}
          {!hasContent && !disabled && (
            <div className="absolute top-0 left-0 px-3 py-2 text-sm text-foreground-muted pointer-events-none select-none">
              {placeholder}
            </div>
          )}
        </div>

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
              disabled={!hasContent}
              className={clsx(
                'w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                hasContent
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
