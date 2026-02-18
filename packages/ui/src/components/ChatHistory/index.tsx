import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Plus,
  GitBranch as GitBranchIcon,
  Clock,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useChatSessionStore } from '../../stores';
import type { GitBranch, ChatSession } from '@claude-agent/core';

interface ChatSessionsProps {
  branches: GitBranch[];
  currentBranch: string | null;
  activeChatId: string | null;
  onSwitchChat: (chatId: string, branchName: string) => void;
  onNewChat: () => void;
}

export function ChatSessions({
  branches,
  currentBranch,
  activeChatId,
  onSwitchChat,
  onNewChat,
}: ChatSessionsProps) {
  const sessions = useChatSessionStore((s) => s.sessions);
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());

  // Group chat sessions by branch, with current branch first
  const grouped = useMemo(() => {
    const allSessions = Object.values(sessions);
    const branchNames = new Set(branches.map((b) => b.name));

    // Group sessions by branch
    const groups: { branchName: string; isCurrent: boolean; chats: ChatSession[] }[] = [];

    // Current branch first
    if (currentBranch) {
      const chats = allSessions
        .filter((s) => s.branchName === currentBranch)
        .sort((a, b) => b.lastActive - a.lastActive);
      groups.push({ branchName: currentBranch, isCurrent: true, chats });
    }

    // Other branches
    const otherBranches = [...branchNames]
      .filter((name) => name !== currentBranch)
      .sort((a, b) => {
        const aLatest = allSessions
          .filter((s) => s.branchName === a)
          .reduce((max, s) => Math.max(max, s.lastActive), 0);
        const bLatest = allSessions
          .filter((s) => s.branchName === b)
          .reduce((max, s) => Math.max(max, s.lastActive), 0);
        return bLatest - aLatest;
      });

    for (const branchName of otherBranches) {
      const chats = allSessions
        .filter((s) => s.branchName === branchName)
        .sort((a, b) => b.lastActive - a.lastActive);
      if (chats.length > 0) {
        groups.push({ branchName, isCurrent: false, chats });
      }
    }

    return groups;
  }, [sessions, branches, currentBranch]);

  const toggleBranch = (branchName: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(branchName)) {
        next.delete(branchName);
      } else {
        next.add(branchName);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex-shrink-0">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Chats</h2>
          </div>
          <button
            onClick={onNewChat}
            className="btn-icon p-1"
            title="New chat on current branch"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat session list */}
      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <MessageSquare className="w-10 h-10 text-foreground-muted mb-3" />
            <p className="text-sm text-foreground-muted">No chat sessions yet</p>
            <p className="text-xs text-foreground-muted mt-1">Start chatting to create one</p>
          </div>
        ) : (
          <div className="py-1">
            {grouped.map(({ branchName, isCurrent, chats }) => {
              const isExpanded = isCurrent || expandedBranches.has(branchName);

              return (
                <div key={branchName}>
                  {/* Branch header */}
                  <button
                    onClick={() => !isCurrent && toggleBranch(branchName)}
                    className={clsx(
                      'w-full flex items-center gap-1.5 px-3 py-1.5 text-xs',
                      isCurrent
                        ? 'text-accent font-semibold'
                        : 'text-foreground-muted hover:text-foreground font-medium cursor-pointer'
                    )}
                  >
                    {!isCurrent && (
                      isExpanded
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronRight className="w-3 h-3" />
                    )}
                    <GitBranchIcon className="w-3 h-3" />
                    <span className="font-mono truncate">{branchName}</span>
                    <span className="text-foreground-muted ml-auto flex-shrink-0">
                      {chats.length}
                    </span>
                  </button>

                  {/* Chat sessions for this branch */}
                  {isExpanded && chats.map((chat) => {
                    const isActive = chat.id === activeChatId;
                    const lastMessage = chat.messages
                      .filter((m) => m.role !== 'system')
                      .at(-1);
                    const messageCount = chat.messages.filter(
                      (m) => m.role !== 'system'
                    ).length;

                    return (
                      <button
                        key={chat.id}
                        onClick={() => {
                          if (!isActive) onSwitchChat(chat.id, chat.branchName);
                        }}
                        className={clsx(
                          'w-full text-left px-3 py-2 transition-colors border-l-2 ml-2',
                          isActive
                            ? 'bg-accent/10 border-l-accent'
                            : 'border-l-transparent hover:bg-background-hover'
                        )}
                      >
                        {/* Chat name */}
                        <p className={clsx(
                          'text-sm font-medium truncate',
                          isActive && 'text-accent'
                        )}>
                          {chat.name}
                        </p>

                        {/* Last message preview */}
                        {lastMessage && (
                          <p className="text-xs text-foreground-muted truncate mt-0.5">
                            {lastMessage.content.slice(0, 80)}
                          </p>
                        )}

                        {/* Meta */}
                        <div className="flex items-center gap-3 mt-1">
                          {messageCount > 0 && (
                            <span className="text-2xs text-foreground-muted">
                              {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                            </span>
                          )}
                          {chat.lastActive > 0 && (
                            <span className="flex items-center gap-1 text-2xs text-foreground-muted">
                              <Clock className="w-2.5 h-2.5" />
                              {formatDistanceToNow(chat.lastActive, { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Chat button at bottom */}
      <div className="flex-shrink-0 border-t border-border p-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-background-secondary hover:bg-background-hover"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>
    </div>
  );
}

// Keep backward-compatible export
export { ChatSessions as ChatHistory };
export default ChatSessions;
