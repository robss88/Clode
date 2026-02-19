import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, MessageSquare, Clock } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useChatSessionStore } from '@claude-agent/ui';
import type { ChatSession } from '@claude-agent/core';

interface ChatSessionDropdownProps {
  currentBranch: string | null;
  onSwitchChat: (chatId: string) => void;
  onNewChat: () => void;
}

export function ChatSessionDropdown({
  currentBranch,
  onSwitchChat,
  onNewChat,
}: ChatSessionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sessions = useChatSessionStore((s) => s.sessions);
  const activeChatId = useChatSessionStore((s) => s.activeChatId);

  // Get chats for current branch, sorted by lastActive desc
  const branchChats = React.useMemo(() => {
    if (!currentBranch) return [];
    return Object.values(sessions)
      .filter((s) => s.branch === currentBranch || s.branchName === currentBranch)
      .sort((a, b) => (b.lastActive || b.createdAt) - (a.lastActive || a.createdAt));
  }, [sessions, currentBranch]);

  const activeChat = activeChatId ? sessions[activeChatId] : null;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative flex-shrink-0 border-b border-border">
      <div className="flex items-center px-2 py-1.5 gap-1">
        {/* Current chat name - clickable to toggle dropdown */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center gap-1.5 min-w-0 px-1.5 py-0.5 rounded hover:bg-surface-hover transition-colors text-left"
        >
          <MessageSquare className="w-3 h-3 text-foreground-muted flex-shrink-0" />
          <span className="text-xs font-medium truncate">
            {activeChat?.name || 'Chat'}
          </span>
          <ChevronDown
            className={clsx(
              'w-3 h-3 text-foreground-muted flex-shrink-0 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
          {branchChats.length > 1 && (
            <span className="text-[10px] text-foreground-muted bg-surface-hover rounded-full px-1.5 flex-shrink-0">
              {branchChats.length}
            </span>
          )}
        </button>

        {/* New Chat button */}
        <button
          onClick={() => {
            onNewChat();
            setIsOpen(false);
          }}
          className="p-1 rounded hover:bg-surface-hover transition-colors flex-shrink-0"
          title="New chat"
        >
          <Plus className="w-3.5 h-3.5 text-foreground-muted" />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && branchChats.length > 0 && (
        <div className="absolute left-1 right-1 top-full z-50 bg-surface border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {branchChats.map((chat) => {
            const isActive = chat.id === activeChatId;
            const messageCount = chat.messages.filter((m) => m.role !== 'system').length;

            return (
              <button
                key={chat.id}
                onClick={() => {
                  if (!isActive) onSwitchChat(chat.id);
                  setIsOpen(false);
                }}
                className={clsx(
                  'w-full text-left px-3 py-2 transition-colors border-l-2',
                  isActive
                    ? 'bg-accent/10 border-l-accent'
                    : 'border-l-transparent hover:bg-surface-hover'
                )}
              >
                <p
                  className={clsx(
                    'text-xs font-medium truncate',
                    isActive && 'text-accent'
                  )}
                >
                  {chat.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {messageCount > 0 && (
                    <span className="text-[10px] text-foreground-muted">
                      {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                    </span>
                  )}
                  {(chat.lastActive || chat.createdAt) > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-foreground-muted">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDistanceToNow(chat.lastActive || chat.createdAt, {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
