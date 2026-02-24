import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Code,
  FileEdit,
  Terminal as TerminalIcon,
  FolderSearch,
  Copy,
  Check,
  RotateCcw,
  File,
  Folder,
  Slash,
  X,
  Paperclip,
  Upload,
  Play,
  ChevronRight,
  Wrench,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { Message, ToolCall, FileNode, ContextItem } from '@claude-agent/core';
import { useAgentStore, useUIStore } from '../../stores';
import { getAvailableCommands, parseSlashCommand, MODES } from '../../commands';
import { ModeSelector } from './ModeSelector';
import { ModelSelector } from './ModelSelector';
import { ContextBubbleList } from './ContextBubble';

interface ChatInterfaceProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent?: string;
  currentToolCall?: ToolCall | null;
  fileTree?: FileNode | null;
  restoredAtMessageId?: string | null;
  checkpointMessageIds?: Set<string>;
  onSendMessage: (content: string, context?: ContextItem[]) => void;
  onInterrupt: () => void;
  onRestoreToMessage?: (messageId: string) => void;
  onEditMessageAndContinue?: (messageId: string, newContent: string) => void;
  onReadFile?: (path: string) => Promise<string | null>;
  onImplementPlan?: (planContent: string) => void;
  onModelChange?: (model: string) => void;
}

// Flatten file tree to get all file paths
// Uses node.path (absolute) for file reads, and builds a display path relative to the project root.
function flattenFileTree(node: FileNode, rootPath?: string): Array<{ path: string; displayPath: string; name: string; type: 'file' | 'directory' }> {
  const root = rootPath ?? node.path;
  const results: Array<{ path: string; displayPath: string; name: string; type: 'file' | 'directory' }> = [];

  // Compute a short display path relative to project root
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

export function ChatInterface({
  messages,
  isStreaming,
  streamingContent = '',
  currentToolCall,
  fileTree,
  onSendMessage,
  onInterrupt,
  onRestoreToMessage,
  onEditMessageAndContinue,
  onReadFile,
  onImplementPlan,
  onModelChange,
  restoredAtMessageId,
  checkpointMessageIds,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  const dragCountRef = useRef(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Mode selector
  const mode = useUIStore((state) => state.mode);
  const setMode = useUIStore((state) => state.setMode);
  const currentModeDefinition = MODES[mode];

  // Model selector
  const model = useUIStore((state) => state.model);
  const setModel = useUIStore((state) => state.setModel);

  // Subscribe to draft input from store (set when editing a previous message)
  const draftInput = useAgentStore((state) => state.draftInput);
  const setDraftInput = useAgentStore((state) => state.setDraftInput);

  // Consume draft input when it changes
  useEffect(() => {
    if (draftInput) {
      setInput(draftInput);
      setDraftInput('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(draftInput.length, draftInput.length);
        }
      }, 50);
    }
  }, [draftInput, setDraftInput]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, currentToolCall]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea to fit content (max ~12 lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '40px';
    const maxHeight = 240; // ~12 lines at 20px line height
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  // Scroll mention list item into view
  useEffect(() => {
    if (showMentions && mentionListRef.current) {
      const selectedItem = mentionListRef.current.children[mentionIndex] as HTMLElement;
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
        // Still typing the command name, show autocomplete
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
      // Check if there's a space before @ (or @ is at start)
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // Only show if query doesn't contain spaces (single file reference)
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
    // Remove the @query from input
    const beforeMention = input.slice(0, mentionStartPos);
    const afterMention = input.slice(mentionStartPos + mentionQuery.length + 1);
    const newInput = `${beforeMention}${afterMention}`.trim();
    setInput(newInput);
    setShowMentions(false);
    setMentionQuery('');

    // Add as context item
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

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const newItems: ContextItem[] = files.map(f => ({
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'file' as const,
      name: f.name,
      path: (f as any).path || f.name,
    }));

    setContextItems(prev => {
      const existing = new Set(prev.map(c => c.path));
      const unique = newItems.filter(c => !existing.has(c.path));
      return [...prev, ...unique];
    });
  }, []);

  const removeContextItem = useCallback((id: string) => {
    setContextItems(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && contextItems.length === 0) || isStreaming) return;

    let content = input.trim();

    // Load file contents for context items and inline them for Claude
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

    onSendMessage(content, resolvedContext.length > 0 ? resolvedContext : undefined);
    setInput('');
    setContextItems([]);
    setShowMentions(false);
  }, [input, isStreaming, onSendMessage, contextItems, onReadFile]);

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
      handleSubmit(e);
    }
  }, [showSlashCommands, filteredCommands, slashIndex, insertSlashCommand, showMentions, filteredFiles, mentionIndex, insertMention, handleSubmit]);

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-background-tertiary border-2 border-dashed border-foreground-muted rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-foreground-secondary">
            <Upload className="w-10 h-10" />
            <span className="text-sm font-medium">Drop files to attach</span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto text-[13px]">
        <div className="py-4 space-y-3">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => {
            // Determine if this message is after a restore point (should be faded)
            // restoredAtMessageId is the user message we restored TO — everything AFTER it fades
            const restoredIndex = restoredAtMessageId
              ? messages.findIndex((m) => m.id === restoredAtMessageId)
              : -1;
            const isFadedOut = restoredIndex >= 0 && index > restoredIndex;

            // Determine if this message has a checkpoint to restore to
            let hasCheckpoint = false;
            if (message.role === 'user') {
              // User message: has checkpoint if previous assistant response made code changes,
              // OR if this is the first user message (has 'initial' checkpoint)
              const prevAssistant = messages.slice(0, index).reverse().find(m => m.role === 'assistant');
              hasCheckpoint = prevAssistant
                ? (checkpointMessageIds?.has(prevAssistant.id) ?? false)
                : true; // First user message uses 'initial' checkpoint
            } else if (message.role === 'assistant') {
              // Assistant message: has checkpoint if it made code changes
              hasCheckpoint = checkpointMessageIds?.has(message.id) ?? false;
            }

            return (
            <div
              key={message.id}
              ref={(el) => { if (el) messageRefs.current.set(message.id, el); }}
              className={clsx(
                'px-4',
                message.role === 'user' && 'sticky top-0 z-10 bg-background py-3'
              )}
            >
              <MessageBubble
                message={message}
                isLastMessage={index === messages.length - 1}
                isFadedOut={isFadedOut}
                hasCheckpoint={hasCheckpoint}
                onRestore={onRestoreToMessage ? () => onRestoreToMessage(message.id) : undefined}
                onEditAndContinue={!isFadedOut && message.role === 'user' && onEditMessageAndContinue ? (newContent: string) => onEditMessageAndContinue(message.id, newContent) : undefined}
              />
              {/* Implement Plan button — shown on the last assistant message when in plan mode */}
              {mode === 'plan' &&
                !isStreaming &&
                message.role === 'assistant' &&
                index === messages.length - 1 &&
                onImplementPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center py-2"
                  >
                    <button
                      onClick={() => onImplementPlan(message.content)}
                      className="flex items-center gap-2 px-4 py-2 bg-foreground text-background hover:bg-foreground-secondary text-sm font-medium rounded-lg transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Implement Plan
                    </button>
                  </motion.div>
                )}
            </div>
          );
          })}
        </AnimatePresence>

        {/* Streaming content or tool activity */}
        {isStreaming && (streamingContent || currentToolCall) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4"
          >
            <div className="message-content message-content-assistant">
              {streamingContent && <MarkdownContent content={streamingContent} />}
              {currentToolCall && (
                <div className="mt-2">
                  <ToolCallIndicator toolCall={{ ...currentToolCall, status: 'running' }} />
                </div>
              )}
              {!currentToolCall && (
                <span className="inline-block w-2 h-4 bg-foreground animate-pulse-subtle ml-1" />
              )}
            </div>
          </motion.div>
        )}

        {/* Show thinking indicator when streaming but no content yet */}
        {isStreaming && !streamingContent && !currentToolCall && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4"
          >
            <div className="message-content message-content-assistant">
              <div className="flex items-center gap-2 text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area — unified container like Cursor */}
      <div className="px-3 py-2">
        <form onSubmit={handleSubmit} className="relative">
          {/* Slash command autocomplete dropdown */}
          <AnimatePresence>
            {showSlashCommands && filteredCommands.length > 0 && (
              <motion.div
                ref={slashListRef}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 right-0 mb-2 max-h-48 overflow-y-auto bg-background-secondary border border-border rounded-lg shadow-xl z-20"
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 right-0 mb-2 max-h-48 overflow-y-auto bg-background-secondary border border-border rounded-lg shadow-xl z-20"
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

          {/* Unified input container — textarea + selectors in one box */}
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
              placeholder="Message, @ for context, / for commands"
              disabled={isStreaming}
              rows={1}
              className="w-full px-3 py-2 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none resize-none"
              style={{ height: '40px' }}
            />

            {/* Bottom bar: mode/model selectors + send button */}
            <div className="flex items-center px-1.5 pb-1.5">
              <ModeSelector mode={mode} onModeChange={setMode} />
              <ModelSelector
                model={model}
                onModelChange={(m) => {
                  setModel(m);
                  onModelChange?.(m);
                }}
              />
              <span className="flex-1" />
              {isStreaming ? (
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
                  type="submit"
                  disabled={!input.trim()}
                  className={clsx(
                    'w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                    input.trim()
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
        </form>
      </div>
    </div>
  );
}

// Parse <file path="...">content</file> tags from message content
function parseFileContext(content: string): { files: Array<{ path: string; name: string }>; textContent: string } {
  const fileRegex = /<file\s+path="([^"]+)">\n?[\s\S]*?\n?<\/file>/g;
  const files: Array<{ path: string; name: string }> = [];
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const filePath = match[1];
    const name = filePath.split('/').pop() || filePath;
    files.push({ path: filePath, name });
  }
  const textContent = content.replace(fileRegex, '').replace(/^\n+/, '').trim();
  return { files, textContent };
}

function FileContextPills({ files }: { files: Array<{ path: string; name: string }> }) {
  const [expanded, setExpanded] = useState(false);
  if (files.length === 0) return null;

  const shown = expanded ? files : files.slice(0, 3);
  const remaining = files.length - 3;

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {shown.map((file) => (
        <span
          key={file.path}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-background-hover border border-border rounded text-[11px] text-foreground-secondary"
          title={file.path}
        >
          <File className="w-3 h-3" />
          {file.name}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground transition-colors"
        >
          +{remaining} more
        </button>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  isLastMessage,
  isFadedOut,
  hasCheckpoint,
  onRestore,
  onEditAndContinue,
}: {
  message: Message;
  isLastMessage?: boolean;
  isFadedOut?: boolean;
  hasCheckpoint?: boolean;
  onRestore?: () => void;
  onEditAndContinue?: (newContent: string) => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // System messages render as centered, muted text
  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex justify-center py-1"
      >
        <div className="text-xs text-foreground-muted italic px-4 py-1.5 bg-background-tertiary rounded-full">
          {message.content}
        </div>
      </motion.div>
    );
  }

  const canEdit = isUser && !!onEditAndContinue;

  const startEditing = () => {
    if (!canEdit) return;
    const { textContent } = parseFileContext(message.content);
    setEditContent(textContent);
    setIsInlineEditing(true);
    setTimeout(() => {
      if (editRef.current) {
        editRef.current.focus();
        editRef.current.setSelectionRange(textContent.length, textContent.length);
        editRef.current.style.height = '40px';
        const maxHeight = 240;
        editRef.current.style.height = `${Math.min(editRef.current.scrollHeight, maxHeight)}px`;
      }
    }, 50);
  };

  const handleEditSubmit = () => {
    if (!editContent.trim()) return;
    if (!isLastMessage) {
      setShowConfirmDialog(true);
    } else {
      onEditAndContinue?.(editContent);
      setIsInlineEditing(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    }
    if (e.key === 'Escape') {
      setIsInlineEditing(false);
      setShowConfirmDialog(false);
    }
  };

  // When faded, clicking the entire section restores to that point
  const handleFadedClick = () => {
    if (isFadedOut && onRestore) {
      onRestore();
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={clsx(
          'group relative',
          isFadedOut && 'opacity-40 cursor-pointer hover:opacity-60 transition-opacity'
        )}
        onClick={isFadedOut ? handleFadedClick : undefined}
      >
        {/* Inline editing mode — matches bottom input styling */}
        {!isFadedOut && isInlineEditing ? (
          <div className="bg-background-tertiary border border-border-secondary rounded-lg focus-within:border-foreground-muted transition-colors">
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value);
                e.target.style.height = '40px';
                const maxHeight = 240;
                e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`;
              }}
              onKeyDown={handleEditKeyDown}
              placeholder="Edit message..."
              className="w-full px-3 py-2 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus:outline-none resize-none"
              style={{ height: '40px' }}
            />
            <div className="flex items-center px-1.5 pb-1.5">
              <button
                type="button"
                onClick={() => { setIsInlineEditing(false); setShowConfirmDialog(false); }}
                className="px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={handleEditSubmit}
                disabled={!editContent.trim()}
                className={clsx(
                  'w-7 h-7 flex items-center justify-center rounded-full transition-colors',
                  editContent.trim()
                    ? 'bg-foreground text-background hover:bg-foreground-secondary'
                    : 'text-foreground-muted'
                )}
                title="Submit edit"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Normal message display */}
            <div
              className={clsx(
                'message-content',
                isUser
                  ? 'message-content-user font-medium text-foreground bg-background-tertiary border border-border-secondary rounded-lg px-3 py-2 cursor-pointer hover:border-foreground-muted transition-colors'
                  : 'message-content-assistant'
              )}
              onClick={!isFadedOut && canEdit ? startEditing : undefined}
            >
              {(() => {
                if (isUser && message.context && message.context.length > 0) {
                  const textContent = parseFileContext(message.content).textContent;
                  return (
                    <>
                      <div className="mb-2">
                        <ContextBubbleList items={message.context} compact />
                      </div>
                      <MarkdownContent content={textContent} />
                    </>
                  );
                }
                const { files, textContent } = isUser ? parseFileContext(message.content) : { files: [], textContent: message.content };
                return (
                  <>
                    {files.length > 0 && <FileContextPills files={files} />}
                    <MarkdownContent content={textContent} />
                  </>
                );
              })()}
              {/* Restore checkpoint — only on non-faded user messages */}
              {!isFadedOut && isUser && hasCheckpoint && onRestore && (
                <div className="flex justify-end mt-1.5 -mb-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRestore(); }}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-foreground-muted hover:text-foreground rounded transition-colors"
                    title="Restore code to this checkpoint"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore checkpoint
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tool calls (grouped) */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallGroup toolCalls={message.toolCalls} />
        )}
      </motion.div>

      {/* Confirmation dialog for editing a previous message */}
      {showConfirmDialog && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 bg-background-tertiary border border-border-secondary rounded-lg p-3"
        >
          <p className="text-xs text-foreground-secondary mb-3">
            This will clear all messages after this one.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowConfirmDialog(false); setIsInlineEditing(false); }}
              className="px-2 py-1 text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            {onEditAndContinue && (
              <button
                type="button"
                onClick={() => {
                  onEditAndContinue(editContent);
                  setShowConfirmDialog(false);
                  setIsInlineEditing(false);
                }}
                className="px-3 py-1 text-xs bg-foreground text-background rounded-md hover:bg-foreground-secondary transition-colors"
              >
                Continue
              </button>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
}

// Get a human-readable summary of what a tool call is doing
function getToolCallSummary(toolCall: ToolCall): string {
  const input = toolCall.input || {};
  switch (toolCall.name.toLowerCase()) {
    case 'read':
    case 'read_file':
      return input.file_path
        ? `Reading ${String(input.file_path).split('/').pop()}`
        : 'Reading file';
    case 'write':
      return input.file_path
        ? `Writing ${String(input.file_path).split('/').pop()}`
        : 'Writing file';
    case 'edit':
      return input.file_path
        ? `Editing ${String(input.file_path).split('/').pop()}`
        : 'Editing file';
    case 'bash':
      const cmd = String(input.command || '').slice(0, 60);
      return cmd ? `Running: ${cmd}` : 'Running command';
    case 'glob':
      return input.pattern ? `Searching: ${input.pattern}` : 'Searching files';
    case 'grep':
      return input.pattern ? `Grep: ${input.pattern}` : 'Searching content';
    default:
      return toolCall.name;
  }
}

function getToolIcon(name: string) {
  switch (name.toLowerCase()) {
    case 'read':
    case 'read_file':
      return <FolderSearch className="w-3.5 h-3.5" />;
    case 'write':
    case 'edit':
      return <FileEdit className="w-3.5 h-3.5" />;
    case 'bash':
      return <TerminalIcon className="w-3.5 h-3.5" />;
    default:
      return <Code className="w-3.5 h-3.5" />;
  }
}

function getStatusIcon(status: ToolCall['status']) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground-secondary" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-error" />;
    default:
      return null;
  }
}

function ToolCallGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedCount = toolCalls.filter((t) => t.status === 'completed').length;
  const hasRunning = toolCalls.some((t) => t.status === 'running');
  const hasError = toolCalls.some((t) => t.status === 'error');

  return (
    <div className="mt-2">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
          'border border-border hover:bg-background-hover',
          hasRunning && 'border-foreground-muted bg-background-tertiary',
          hasError && 'border-error bg-error-muted'
        )}
      >
        <ChevronRight
          className={clsx(
            'w-3.5 h-3.5 transition-transform text-foreground-muted',
            isExpanded && 'rotate-90'
          )}
        />
        <Wrench className="w-3.5 h-3.5 text-foreground-muted" />
        <span className="text-foreground-muted">
          {hasRunning
            ? `Running tool...`
            : `${completedCount} tool call${completedCount !== 1 ? 's' : ''}`}
        </span>
        <span className="flex-1" />
        {hasRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground-secondary" />}
        {!hasRunning && hasError && <XCircle className="w-3.5 h-3.5 text-error" />}
        {!hasRunning && !hasError && completedCount === toolCalls.length && (
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
        )}
      </button>

      {/* Expanded tool calls */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-3 mt-1 space-y-1 border-l-2 border-border pl-3">
              {toolCalls.map((toolCall) => (
                <ToolCallIndicator key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  const [showDetails, setShowDetails] = useState(false);
  const summary = getToolCallSummary(toolCall);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={clsx(
          'w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors',
          'hover:bg-background-hover',
          toolCall.status === 'running' && 'text-foreground-secondary',
          toolCall.status === 'error' && 'text-error'
        )}
      >
        {getToolIcon(toolCall.name)}
        <span className="truncate text-left flex-1">{summary}</span>
        {getStatusIcon(toolCall.status)}
      </button>
      {showDetails && (
        <div className="ml-6 mt-0.5 mb-1 px-2 py-1.5 bg-background rounded text-[11px] font-mono text-foreground-muted overflow-x-auto">
          <div className="text-foreground-muted/60 mb-1">Input:</div>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(toolCall.input, null, 2).slice(0, 500)}
          </pre>
          {toolCall.output && (
            <>
              <div className="text-foreground-muted/60 mt-1.5 mb-1">Output:</div>
              <pre className="whitespace-pre-wrap break-all">
                {toolCall.output.slice(0, 500)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);

  const handleCopy = useCallback(async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedBlock(index);
    setTimeout(() => setCopiedBlock(null), 2000);
  }, []);

  let codeBlockIndex = 0;

  return (
    <ReactMarkdown
      rehypePlugins={[rehypeHighlight]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;
          const codeString = String(children).replace(/\n$/, '');
          const currentIndex = codeBlockIndex++;

          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 bg-background rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          }

          return (
            <div className="code-block my-3">
              <div className="code-block-header">
                <span className="text-xs text-foreground-muted font-mono">
                  {match?.[1] || 'code'}
                </span>
                <button
                  onClick={() => handleCopy(codeString, currentIndex)}
                  className="btn-icon p-1"
                  title="Copy code"
                >
                  {copiedBlock === currentIndex ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <pre className="code-block-content">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            </div>
          );
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground-secondary underline hover:text-foreground"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export { ChatInterface as default };
