import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Square,
  Loader2,
  CheckCircle2,
  XCircle,
  Code,
  FileEdit,
  Terminal,
  FolderSearch,
  Copy,
  Check,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import clsx from 'clsx';
import type { Message, ToolCall } from '@claude-agent/core';

interface ChatInterfaceProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent?: string;
  currentToolCall?: ToolCall | null;
  onSendMessage: (content: string) => void;
  onInterrupt: () => void;
}

export function ChatInterface({
  messages,
  isStreaming,
  streamingContent = '',
  currentToolCall,
  onSendMessage,
  onInterrupt,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, currentToolCall]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
  }, [input, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude..."
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
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={clsx('flex gap-3', isUser && 'flex-row-reverse')}
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
        <div className={clsx('message', isUser ? 'message-user' : 'message-assistant')}>
          <MarkdownContent content={message.content} />
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
        return <Terminal className="w-4 h-4" />;
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
