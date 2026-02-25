import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
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
  Upload,
  Play,
  ChevronRight,
  Wrench,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { Message, ToolCall, FileNode, ContextItem } from '@claude-agent/core';
import { useUIStore } from '../../stores';
import { ContextBubbleList } from './ContextBubble';
import { ChatInput } from './ChatInput';

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
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCountRef = useRef(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Mode selector (still needed for plan mode button check)
  const mode = useUIStore((state) => state.mode);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, currentToolCall]);

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
  }, []);

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
          {(() => {
            // Group messages into sections: each section starts at a user message
            // and includes all following non-user messages. This creates a containing
            // block for CSS sticky so each sticky user message naturally unsticks
            // when its section scrolls out of view.
            const sections: { userIndex: number; messages: { message: Message; index: number }[] }[] = [];
            let currentSection: { userIndex: number; messages: { message: Message; index: number }[] } | null = null;

            messages.forEach((message, index) => {
              if (message.role === 'user') {
                currentSection = { userIndex: index, messages: [] };
                sections.push(currentSection);
              } else if (!currentSection) {
                // Messages before first user message (e.g. system)
                currentSection = { userIndex: -1, messages: [] };
                sections.push(currentSection);
              }
              currentSection!.messages.push({ message, index });
            });

            const restoredIndex = restoredAtMessageId
              ? messages.findIndex((m) => m.id === restoredAtMessageId)
              : -1;

            return sections.map((section) => (
              <div key={section.messages[0].message.id + '-section'}>
                {section.messages.map(({ message, index }) => {
                  const isFadedOut = restoredIndex >= 0 && index > restoredIndex;

                  let hasCheckpoint = false;
                  if (message.role === 'user') {
                    const prevAssistant = messages.slice(0, index).reverse().find(m => m.role === 'assistant');
                    hasCheckpoint = prevAssistant
                      ? (checkpointMessageIds?.has(prevAssistant.id) ?? false)
                      : true;
                  } else if (message.role === 'assistant') {
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
                        onModelChange={onModelChange}
                        fileTree={fileTree}
                        onReadFile={onReadFile}
                      />
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
              </div>
            ));
          })()}
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

      {/* Input area */}
      <div className="px-3 py-2">
        <ChatInput
          fileTree={fileTree}
          disabled={isStreaming}
          isStreaming={isStreaming}
          onSubmit={onSendMessage}
          onInterrupt={onInterrupt}
          onReadFile={onReadFile}
          onModelChange={onModelChange}
          dropdownDirection="up"
          autoFocus
        />
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
  onModelChange,
  fileTree,
  onReadFile,
}: {
  message: Message;
  isLastMessage?: boolean;
  isFadedOut?: boolean;
  hasCheckpoint?: boolean;
  onRestore?: () => void;
  onEditAndContinue?: (newContent: string) => void;
  onModelChange?: (model: string) => void;
  fileTree?: FileNode | null;
  onReadFile?: (path: string) => Promise<string | null>;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingEditContent, setPendingEditContent] = useState('');

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
    setIsInlineEditing(true);
  };

  const handleEditSubmit = (content: string) => {
    if (!content.trim()) return;
    if (!isLastMessage) {
      setPendingEditContent(content);
      setShowConfirmDialog(true);
    } else {
      onEditAndContinue?.(content);
      setIsInlineEditing(false);
    }
  };

  // When faded, clicking the entire section restores to that point
  const handleFadedClick = () => {
    if (isFadedOut && onRestore) {
      onRestore();
    }
  };

  const editInitialValue = parseFileContext(message.content).textContent;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: isFadedOut ? 0.4 : 1, y: 0 }}
        whileHover={isFadedOut ? { opacity: 0.6 } : undefined}
        exit={{ opacity: 0, y: -10 }}
        className={clsx('group relative', isFadedOut && 'cursor-pointer')}
        onClick={isFadedOut ? handleFadedClick : undefined}
      >
        {/* Inline editing mode — uses shared ChatInput component */}
        {!isFadedOut && isInlineEditing ? (
          <ChatInput
            initialValue={editInitialValue}
            placeholder="Edit message..."
            fileTree={fileTree}
            onSubmit={handleEditSubmit}
            onCancel={() => { setIsInlineEditing(false); setShowConfirmDialog(false); }}
            onReadFile={onReadFile}
            onModelChange={onModelChange}
            dropdownDirection="down"
            autoFocus
          />
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
                  onEditAndContinue(pendingEditContent);
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
        ? `Read ${String(input.file_path).split('/').pop()}`
        : 'Read file';
    case 'write':
      return input.file_path
        ? `Wrote ${String(input.file_path).split('/').pop()}`
        : 'Wrote file';
    case 'edit':
      return input.file_path
        ? `Edited ${String(input.file_path).split('/').pop()}`
        : 'Edited file';
    case 'bash':
      const cmd = String(input.command || '').slice(0, 60);
      return cmd ? `Ran: ${cmd}` : 'Ran command';
    case 'glob':
      return input.pattern ? `Searched: ${input.pattern}` : 'Searched files';
    case 'grep':
      return input.pattern ? `Grep: ${input.pattern}` : 'Searched content';
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
  const errorCount = toolCalls.filter((t) => t.status === 'error').length;
  const hasRunning = toolCalls.some((t) => t.status === 'running');
  const allDone = !hasRunning && (completedCount + errorCount) === toolCalls.length;

  // Build a short summary of what tools did
  const toolSummaries = !hasRunning ? toolCalls.map((t) => getToolCallSummary(t)) : [];
  // Show first 2 summaries inline when collapsed
  const inlineSummary = toolSummaries.length > 0
    ? toolSummaries.slice(0, 2).join(', ') + (toolSummaries.length > 2 ? ` +${toolSummaries.length - 2} more` : '')
    : '';

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
        )}
      >
        <ChevronRight
          className={clsx(
            'w-3.5 h-3.5 transition-transform text-foreground-muted',
            isExpanded && 'rotate-90'
          )}
        />
        <Wrench className="w-3.5 h-3.5 text-foreground-muted" />
        <span className="text-foreground-muted truncate text-left flex-1">
          {hasRunning
            ? `Running tool...`
            : inlineSummary || `${completedCount} tool call${completedCount !== 1 ? 's' : ''}`}
        </span>
        {hasRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground-secondary flex-shrink-0" />}
        {allDone && errorCount > 0 && completedCount > 0 && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            <XCircle className="w-3 h-3 text-foreground-muted" />
          </span>
        )}
        {allDone && errorCount > 0 && completedCount === 0 && (
          <XCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />
        )}
        {allDone && errorCount === 0 && (
          <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
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

function getToolCallDetail(toolCall: ToolCall): string | null {
  const input = toolCall.input || {};
  const name = toolCall.name.toLowerCase();
  if ((name === 'read' || name === 'read_file' || name === 'write' || name === 'edit') && input.file_path) {
    return String(input.file_path);
  }
  if (name === 'bash' && input.description) {
    return String(input.description);
  }
  return null;
}

function ToolCallIndicator({ toolCall }: { toolCall: ToolCall }) {
  const [showDetails, setShowDetails] = useState(false);
  const summary = getToolCallSummary(toolCall);
  const detail = getToolCallDetail(toolCall);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className={clsx(
          'w-full flex items-start gap-2 px-2 py-1 rounded text-xs transition-colors',
          'hover:bg-background-hover',
          toolCall.status === 'running' && 'text-foreground-secondary',
          toolCall.status === 'error' && 'text-error'
        )}
      >
        <span className="mt-0.5 flex-shrink-0">{getToolIcon(toolCall.name)}</span>
        <div className="flex-1 min-w-0 text-left">
          <span className="truncate block">{summary}</span>
          {detail && (
            <span className="truncate block text-[11px] text-foreground-muted/60 font-mono">{detail}</span>
          )}
        </div>
        <span className="mt-0.5 flex-shrink-0">{getStatusIcon(toolCall.status)}</span>
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
