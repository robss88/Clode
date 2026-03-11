import React, { useRef, useEffect } from 'react';
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
  ChevronRight,
  Wrench,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import type { Message, ToolCall, FileNode, ContextItem } from '@claude-agent/core';
import { useAgentStore } from '../../stores';
import { ChatInput } from './ChatInput';
import clsx from 'clsx';

interface ChronologicalChatProps {
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
  onEditMessageAndContinue?: (messageId: string, newContent: string, context?: ContextItem[]) => void;
  onReadFile?: (path: string) => Promise<string | null>;
  onModelChange?: (model: string) => void;
}

/**
 * Chronological chat display that shows everything inline as it happens
 * Matches Claude Code's display style - streaming and final states look identical
 */
export function ChronologicalChat({
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
  onModelChange,
  restoredAtMessageId,
  checkpointMessageIds,
}: ChronologicalChatProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingBlocks = useAgentStore((state) => state.streamingBlocks);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, currentToolCall, streamingBlocks]);

  // Render a single content block (text or tool)
  const renderContentBlock = (block: any, index: number) => {
    if (block.type === 'text') {
      return (
        <div key={`text-${index}`} className="prose prose-sm max-w-none text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              // Code blocks
              pre: ({ children }) => (
                <pre className="bg-background-secondary border border-border rounded-md p-3 overflow-x-auto">
                  {children}
                </pre>
              ),
              code: ({ inline, className, children }) => {
                const isInline = inline !== false;
                if (isInline) {
                  return (
                    <code className="bg-background-secondary px-1 py-0.5 rounded text-sm">
                      {children}
                    </code>
                  );
                }
                return <code className={className}>{children}</code>;
              },
              // Links
              a: ({ href, children }) => (
                <a href={href} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {block.content}
          </ReactMarkdown>
        </div>
      );
    }

    if (block.type === 'tool') {
      const toolCall = block.toolCall;
      const toolIcon = getToolIcon(toolCall.name);
      const toolLabel = getToolLabel(toolCall.name);

      // For Edit tool, show a diff-like view
      if (toolCall.name === 'str_replace_editor' || toolCall.name === 'Edit') {
        return (
          <div key={`tool-${toolCall.id}`} className="my-2 border-l-2 border-border pl-3">
            <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1">
              {toolIcon}
              <span>Editing {toolCall.input?.path || 'file'}</span>
              {toolCall.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
              {toolCall.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
              {toolCall.status === 'error' && <XCircle className="w-3 h-3 text-red-500" />}
            </div>

            {/* Show diff preview if we have old/new strings */}
            {toolCall.input?.old_str && (
              <div className="text-xs font-mono bg-background-secondary rounded p-2 mt-1">
                <div className="text-red-600 line-through opacity-75">
                  - {String(toolCall.input.old_str).split('\n')[0].slice(0, 100)}
                  {String(toolCall.input.old_str).length > 100 && '...'}
                </div>
                <div className="text-green-600 mt-1">
                  + {String(toolCall.input.new_str || '').split('\n')[0].slice(0, 100)}
                  {String(toolCall.input.new_str || '').length > 100 && '...'}
                </div>
              </div>
            )}

            {/* Show output for completed edits */}
            {toolCall.status === 'completed' && toolCall.output && (
              <div className="text-xs text-foreground-muted mt-1">
                {toolCall.output.split('\n')[0]}
              </div>
            )}
          </div>
        );
      }

      // For other tools, show inline
      return (
        <div key={`tool-${toolCall.id}`} className="my-2 flex items-start gap-2 text-sm">
          <div className="flex items-center gap-1 text-foreground-muted">
            {toolIcon}
            <span className="text-xs">{toolLabel}</span>
          </div>

          {/* Show the action being taken */}
          <div className="flex-1 text-xs text-foreground-muted">
            {getToolDescription(toolCall)}
            {toolCall.status === 'running' && (
              <Loader2 className="w-3 h-3 animate-spin inline ml-1" />
            )}
            {toolCall.status === 'completed' && (
              <CheckCircle2 className="w-3 h-3 text-green-500 inline ml-1" />
            )}
            {toolCall.status === 'error' && (
              <XCircle className="w-3 h-3 text-red-500 inline ml-1" />
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Render all messages */}
          {messages.map((message, index) => {
            const isFadedOut = restoredAtMessageId &&
              messages.findIndex(m => m.id === restoredAtMessageId) < index;

            return (
              <div
                key={message.id}
                className={clsx(
                  'px-4 py-3',
                  isFadedOut && 'opacity-40',
                  message.role === 'user' && 'bg-background-secondary'
                )}
              >
                {/* Message header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-foreground-muted">
                    {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Claude' : 'System'}
                  </span>
                  {checkpointMessageIds?.has(message.id) && (
                    <div className="text-xs text-accent">• Checkpoint</div>
                  )}
                </div>

                {/* Message content */}
                <div className="message-content">
                  {message.role === 'user' ? (
                    <div className="prose prose-sm max-w-none">
                      {message.content}
                    </div>
                  ) : message.role === 'assistant' ? (
                    <>
                      {/* For assistant messages, check if we have tool calls */}
                      {message.toolCalls && message.toolCalls.length > 0 ? (
                        <>
                          {/* Render text content first if any */}
                          {message.content && (
                            <div className="prose prose-sm max-w-none mb-2">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          )}
                          {/* Then render tool calls inline */}
                          {message.toolCalls.map((toolCall, i) =>
                            renderContentBlock({ type: 'tool', toolCall }, i)
                          )}
                        </>
                      ) : (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-foreground-muted italic">
                      {message.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming content - render exactly as it will appear when done */}
          {isStreaming && streamingBlocks.length > 0 && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-foreground-muted">Claude</span>
                <Loader2 className="w-3 h-3 animate-spin text-foreground-muted" />
              </div>

              <div className="message-content">
                {streamingBlocks.map((block, index) => renderContentBlock(block, index))}

                {/* Show cursor at the end if still streaming text */}
                {streamingBlocks.length > 0 &&
                 streamingBlocks[streamingBlocks.length - 1].type === 'text' && (
                  <span className="inline-block w-2 h-4 bg-foreground animate-pulse ml-0.5" />
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border px-3 py-2">
        <ChatInput
          fileTree={fileTree}
          disabled={false}
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

// Helper functions
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'str_replace_editor':
    case 'Edit':
    case 'Write':
      return <FileEdit className="w-3 h-3" />;
    case 'bash':
    case 'Bash':
    case 'terminal':
      return <TerminalIcon className="w-3 h-3" />;
    case 'read_file':
    case 'Read':
      return <Code className="w-3 h-3" />;
    case 'list_files':
    case 'Glob':
    case 'find':
      return <FolderSearch className="w-3 h-3" />;
    default:
      return <Wrench className="w-3 h-3" />;
  }
}

function getToolLabel(toolName: string) {
  switch (toolName) {
    case 'str_replace_editor':
    case 'Edit':
      return 'Editing';
    case 'Write':
      return 'Writing';
    case 'bash':
    case 'Bash':
      return 'Running';
    case 'read_file':
    case 'Read':
      return 'Reading';
    case 'list_files':
    case 'Glob':
      return 'Searching';
    default:
      return toolName;
  }
}

function getToolDescription(toolCall: ToolCall) {
  const { name, input } = toolCall;

  switch (name) {
    case 'Read':
    case 'read_file':
      return `Reading ${input?.path || 'file'}`;
    case 'Write':
      return `Writing to ${input?.path || 'file'}`;
    case 'Edit':
    case 'str_replace_editor':
      return `Editing ${input?.path || 'file'}`;
    case 'Bash':
    case 'bash':
      return `$ ${String(input?.command || '').slice(0, 50)}${String(input?.command || '').length > 50 ? '...' : ''}`;
    case 'Glob':
    case 'list_files':
      return `Searching for ${input?.pattern || 'files'}`;
    default:
      return `Running ${name}`;
  }
}