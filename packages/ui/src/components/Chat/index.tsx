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
  Pencil,
  File,
  Folder,
  Slash,
  X,
  Paperclip,
  Upload,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { Message, ToolCall, FileNode } from '@claude-agent/core';
import { useAgentStore } from '../../stores';
import { getAvailableCommands, parseSlashCommand } from '../../commands';

interface AttachedFile {
  path: string;
  name: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent?: string;
  currentToolCall?: ToolCall | null;
  fileTree?: FileNode | null;
  onSendMessage: (content: string) => void;
  onInterrupt: () => void;
  onRestoreToMessage?: (messageId: string) => void;
  onEditMessage?: (messageId: string) => void;
  onReadFile?: (path: string) => Promise<string | null>;
}

// Flatten file tree to get all file paths
function flattenFileTree(node: FileNode, basePath: string = ''): Array<{ path: string; name: string; type: 'file' | 'directory' }> {
  const results: Array<{ path: string; name: string; type: 'file' | 'directory' }> = [];
  const currentPath = basePath ? `${basePath}/${node.name}` : node.name;

  results.push({ path: currentPath, name: node.name, type: node.type });

  if (node.children) {
    for (const child of node.children) {
      results.push(...flattenFileTree(child, currentPath));
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
  onEditMessage,
  onReadFile,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  const dragCountRef = useRef(0);

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
      .filter(f => f.path.toLowerCase().includes(query) || f.name.toLowerCase().includes(query))
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
    const beforeMention = input.slice(0, mentionStartPos);
    const afterMention = input.slice(mentionStartPos + mentionQuery.length + 1);
    const newInput = `${beforeMention}@${filePath}${afterMention}`;
    setInput(newInput);
    setShowMentions(false);
    setMentionQuery('');

    // Focus back on input and set cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = mentionStartPos + filePath.length + 1;
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
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
    const newAttachments: AttachedFile[] = files.map(f => ({
      path: (f as any).path || f.name,
      name: f.name,
    }));

    setAttachedFiles(prev => {
      const existing = new Set(prev.map(f => f.path));
      const unique = newAttachments.filter(f => !existing.has(f.path));
      return [...prev, ...unique];
    });
  }, []);

  const removeAttachment = useCallback((path: string) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== path));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    let content = input.trim();

    // Inline attached file contents
    if (attachedFiles.length > 0 && onReadFile) {
      const fileParts: string[] = [];
      for (const file of attachedFiles) {
        const fileContent = await onReadFile(file.path);
        if (fileContent !== null) {
          fileParts.push(`<file path="${file.path}">\n${fileContent}\n</file>`);
        }
      }
      if (fileParts.length > 0) {
        content = `${fileParts.join('\n\n')}\n\n${content}`;
      }
    }

    onSendMessage(content);
    setInput('');
    setAttachedFiles([]);
    setShowMentions(false);
  }, [input, isStreaming, onSendMessage, attachedFiles, onReadFile]);

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
        <div className="absolute inset-0 z-50 bg-accent/10 border-2 border-dashed border-accent rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="w-10 h-10" />
            <span className="text-sm font-medium">Drop files to attach</span>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              previousMessage={index > 0 ? messages[index - 1] : undefined}
              onRestore={onRestoreToMessage ? () => onRestoreToMessage(message.id) : undefined}
              onEdit={message.role === 'user' && onEditMessage ? () => onEditMessage(message.id) : undefined}
            />
          ))}
        </AnimatePresence>

        {/* Streaming content or tool activity */}
        {isStreaming && (streamingContent || currentToolCall) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">C</span>
            </div>
            <div className="flex-1 message message-assistant">
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
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">C</span>
            </div>
            <div className="flex-1 message message-assistant">
              <div className="flex items-center gap-2 text-foreground-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Debug status bar - remove after debugging */}
      {isStreaming && (
        <div className="px-4 py-1 bg-accent/20 text-xs text-foreground-muted flex gap-4">
          <span>Streaming: {isStreaming ? 'yes' : 'no'}</span>
          <span>Content: {streamingContent.length} chars</span>
          <span>Tool: {currentToolCall?.name || 'none'}</span>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-border bg-background-secondary">
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
                          ? 'bg-accent/20 text-accent'
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
                          ? 'bg-accent/20 text-accent'
                          : 'hover:bg-background-hover'
                      )}
                    >
                      <File className="w-4 h-4 text-foreground-muted flex-shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachedFiles.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-md text-xs"
                >
                  <Paperclip className="w-3 h-3 text-accent" />
                  <span className="truncate max-w-[150px]" title={file.path}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(file.path)}
                    className="hover:text-error transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude... (@ to mention files, / for commands)"
            disabled={isStreaming}
            rows={1}
            className="input pr-24 resize-none min-h-[52px] max-h-[200px]"
            style={{
              height: 'auto',
              minHeight: '52px',
            }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={onInterrupt}
                className="btn-icon bg-error/20 hover:bg-error/30 text-error"
                title="Stop generation"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={clsx(
                  'btn-icon transition-all',
                  input.trim()
                    ? 'bg-accent hover:bg-accent-hover text-white'
                    : 'text-foreground-muted'
                )}
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
        <p className="text-xs text-foreground-muted mt-2 text-center">
          Enter to send, Shift+Enter for new line, @ files, / commands
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  previousMessage,
  onRestore,
  onEdit,
}: {
  message: Message;
  previousMessage?: Message;
  onRestore?: () => void;
  onEdit?: () => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages render as centered, muted text
  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex justify-center py-1"
      >
        <div className="text-xs text-foreground-muted italic px-4 py-1.5 bg-background-hover/50 rounded-full">
          {message.content}
        </div>
      </motion.div>
    );
  }

  // Show checkpoint divider above user messages when previous assistant has a checkpoint
  const showCheckpointDivider =
    isUser &&
    previousMessage?.role === 'assistant' &&
    !!previousMessage?.checkpointCommitHash;

  return (
    <>
      {/* Checkpoint divider */}
      {showCheckpointDivider && (
        <div className="flex items-center gap-3 py-2 px-4">
          <div className="flex-1 h-px bg-border" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore?.();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-foreground-muted hover:text-accent bg-background-secondary border border-border rounded-full transition-colors hover:border-accent/50"
            title="Restore to this checkpoint"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore</span>
          </button>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* Message */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={clsx('flex gap-3 group', isUser && 'flex-row-reverse')}
      >
        {/* Avatar */}
        <div
          className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
            isUser ? 'bg-foreground-muted' : 'bg-accent'
          )}
        >
          <span className="text-xs font-bold text-white">
            {isUser ? 'U' : 'C'}
          </span>
        </div>

        {/* Content */}
        <div className={clsx('flex-1 min-w-0', isUser && 'flex justify-end')}>
          <div className={clsx('message relative', isUser ? 'message-user' : 'message-assistant')}>
            <MarkdownContent content={message.content} />

            {/* Edit button for user messages (visible on hover) */}
            {isUser && onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="absolute -top-2 -left-2 btn-icon p-1.5 bg-background-secondary border border-border shadow-lg hover:bg-background-hover opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit message"
              >
                <Pencil className="w-3.5 h-3.5 text-foreground-muted" />
              </button>
            )}
          </div>

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.toolCalls.map((toolCall) => (
                <ToolCallIndicator key={toolCall.id} toolCall={toolCall} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

function ToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  const getIcon = () => {
    switch (toolCall.name.toLowerCase()) {
      case 'read':
      case 'read_file':
        return <FolderSearch className="w-4 h-4" />;
      case 'write':
      case 'edit':
        return <FileEdit className="w-4 h-4" />;
      case 'bash':
        return <TerminalIcon className="w-4 h-4" />;
      default:
        return <Code className="w-4 h-4" />;
    }
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-accent" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-error" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={clsx(
        'tool-call',
        toolCall.status === 'running' && 'tool-call-running',
        toolCall.status === 'completed' && 'tool-call-completed',
        toolCall.status === 'error' && 'tool-call-error'
      )}
    >
      {getIcon()}
      <span className="font-mono text-xs">{toolCall.name}</span>
      <span className="flex-1" />
      {getStatusIcon()}
    </motion.div>
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
              className="text-accent hover:underline"
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
