import React from 'react';
import { Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { useChatSessionStore } from '@claude-agent/ui';

interface ChatTabsProps {
  currentBranch: string | null;
  onSwitchChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
}

export function ChatTabs({
  currentBranch,
  onSwitchChat,
  onNewChat,
  onDeleteChat,
}: ChatTabsProps) {
  const sessions = useChatSessionStore((s) => s.sessions);
  const activeChatId = useChatSessionStore((s) => s.activeChatId);

  const branchChats = React.useMemo(() => {
    if (!currentBranch) return [];
    return Object.values(sessions)
      .filter((s) => s.branch === currentBranch || s.branchName === currentBranch)
      .sort((a, b) => (a.createdAt) - (b.createdAt));
  }, [sessions, currentBranch]);

  return (
    <div className="flex items-center bg-background-secondary flex-shrink-0 overflow-hidden">
      <div className="flex-1 flex items-center overflow-x-auto scrollbar-none min-w-0">
        {branchChats.map((chat) => {
          const isActive = chat.id === activeChatId;
          return (
            <div
              key={chat.id}
              className={clsx(
                'group flex items-center gap-1 min-w-0 max-w-[160px] px-3 py-1.5 text-xs cursor-pointer transition-colors',
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-foreground-muted hover:text-foreground hover:bg-background-hover'
              )}
              onClick={() => {
                if (!isActive) onSwitchChat(chat.id);
              }}
            >
              <span className="truncate flex-1">{chat.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(chat.id);
                }}
                className={clsx(
                  'flex-shrink-0 p-0.5 rounded transition-colors',
                  'opacity-0 group-hover:opacity-100',
                  'hover:bg-background-hover'
                )}
                title="Close chat"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={onNewChat}
        className="flex-shrink-0 p-1.5 hover:bg-background-hover transition-colors"
        title="New chat"
      >
        <Plus className="w-3.5 h-3.5 text-foreground-muted" />
      </button>
    </div>
  );
}
