import React, { useState } from 'react';
import { MessageSquare, FolderOpen } from 'lucide-react';
import clsx from 'clsx';

interface LeftPanelTabsProps {
  chatHistory: React.ReactNode;
  fileExplorer: React.ReactNode;
}

type Tab = 'chats' | 'files';

export function LeftPanelTabs({ chatHistory, fileExplorer }: LeftPanelTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('chats');

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-border flex-shrink-0">
        <button
          onClick={() => setActiveTab('chats')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'chats'
              ? 'text-accent border-b-2 border-accent'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chats
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'files'
              ? 'text-accent border-b-2 border-accent'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Files
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chats' ? chatHistory : fileExplorer}
      </div>
    </div>
  );
}

export default LeftPanelTabs;
