import React, { useState, useRef, useEffect } from 'react';
import { History, Trash2, FolderOpen, Clock, MessageSquare, ChevronRight } from 'lucide-react';
import { useChatSessionStore } from '@claude-agent/ui';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { ChatSession } from '@claude-agent/core';

interface ChatHistoryDropdownProps {
  currentBranch: string | null;
  onReopenChat: (chatId: string) => void;
  onPermanentlyDelete: (chatId: string) => void;
}

export function ChatHistoryDropdown({
  currentBranch,
  onReopenChat,
  onPermanentlyDelete
}: ChatHistoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getClosedChats = useChatSessionStore((s) => s.getClosedChats);
  const closedChats = getClosedChats(currentBranch || undefined);

  // Group chats by time period
  const groupedChats = React.useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const today: ChatSession[] = [];
    const week: ChatSession[] = [];
    const month: ChatSession[] = [];
    const older: ChatSession[] = [];

    closedChats.forEach(chat => {
      const age = now - (chat.lastActive || chat.createdAt);
      if (age < day) today.push(chat);
      else if (age < 7 * day) week.push(chat);
      else if (age < 30 * day) month.push(chat);
      else older.push(chat);
    });

    return { today, week, month, older };
  }, [closedChats]);

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

  const renderChatGroup = (title: string, chats: ChatSession[]) => {
    if (chats.length === 0) return null;

    return (
      <div className="mb-2">
        <div className="px-3 py-1 text-[10px] font-semibold text-foreground-muted uppercase">
          {title}
        </div>
        {chats.map((chat) => {
          const messageCount = chat.messages.filter((m) => m.role !== 'system').length;

          return (
            <div
              key={chat.id}
              className="group flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover transition-colors"
            >
              <button
                onClick={() => {
                  onReopenChat(chat.id);
                  setIsOpen(false);
                }}
                className="flex-1 text-left min-w-0"
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3 text-foreground-muted flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{chat.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {messageCount > 0 && (
                    <span className="text-[10px] text-foreground-muted">
                      {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-[10px] text-foreground-muted">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDistanceToNow(chat.lastActive || chat.createdAt, {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    onReopenChat(chat.id);
                    setIsOpen(false);
                  }}
                  className="p-0.5 rounded hover:bg-background-hover transition-colors"
                  title="Reopen chat"
                >
                  <FolderOpen className="w-3 h-3 text-foreground-muted" />
                </button>
                <button
                  onClick={() => {
                    setChatToDelete(chat.id);
                  }}
                  className="p-0.5 rounded hover:bg-background-hover transition-colors"
                  title="Delete permanently"
                >
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };


  return (
    <div
      ref={dropdownRef}
      className="relative flex-shrink-0"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={clsx(
          "p-1.5 rounded transition-colors relative",
          isOpen ? "bg-background-hover" : "hover:bg-background-hover"
        )}
        title="Chat history"
        type="button"
      >
        <History className="w-3.5 h-3.5 text-foreground-muted" />
        {closedChats.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-accent rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 max-h-96 overflow-y-auto
                        bg-background-secondary border border-border rounded-lg shadow-lg"
             style={{ zIndex: 9999 }}>
          {chatToDelete ? (
            <div className="p-4">
              <div className="text-sm font-semibold mb-2">Delete Chat?</div>
              <div className="text-xs text-foreground-muted mb-4">
                Permanently delete "{closedChats.find(c => c.id === chatToDelete)?.name}"? This cannot be undone.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onPermanentlyDelete(chatToDelete);
                    setChatToDelete(null);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setChatToDelete(null)}
                  className="flex-1 px-3 py-1.5 text-xs bg-background-hover rounded hover:bg-background-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : closedChats.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <History className="w-6 h-6 text-foreground-muted mx-auto mb-2" />
              <p className="text-xs text-foreground-muted">No closed chats</p>
              <p className="text-[10px] text-foreground-muted mt-1">
                Closed chats will appear here
              </p>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Chat History</span>
                  <span className="text-[10px] text-foreground-muted">
                    {closedChats.length} closed
                  </span>
                </div>
              </div>
              <div className="py-1">
                {renderChatGroup('Today', groupedChats.today)}
                {renderChatGroup('This Week', groupedChats.week)}
                {renderChatGroup('This Month', groupedChats.month)}
                {renderChatGroup('Older', groupedChats.older)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}