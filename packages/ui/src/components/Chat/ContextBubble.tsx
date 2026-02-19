import React, { useState } from 'react';
import { File, Globe, Image, Code, X, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { ContextItem } from '@claude-agent/core';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: File,
  selection: Code,
  url: Globe,
  image: Image,
};

const TYPE_COLORS: Record<string, string> = {
  file: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  selection: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  url: 'text-green-400 bg-green-400/10 border-green-400/20',
  image: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

interface ContextBubbleProps {
  item: ContextItem;
  onRemove?: () => void;
  compact?: boolean;
}

export function ContextBubble({ item, onRemove, compact = false }: ContextBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICONS[item.type] || File;
  const colorClass = TYPE_COLORS[item.type] || TYPE_COLORS.file;

  return (
    <div className={clsx('rounded-md border transition-colors', colorClass)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => !compact && item.content && setExpanded(!expanded)}
        className={clsx(
          'flex items-center gap-1.5 w-full text-left',
          compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
        )}
      >
        <Icon className={clsx(compact ? 'w-3 h-3' : 'w-3.5 h-3.5', 'flex-shrink-0')} />
        <span className={clsx('truncate', compact ? 'text-[11px] max-w-[120px]' : 'text-xs max-w-[180px]')} title={item.path || item.name}>
          {item.name}
        </span>
        {!compact && item.content && (
          expanded
            ? <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
            : <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
        )}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="ml-auto flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className={clsx(compact ? 'w-2.5 h-2.5' : 'w-3 h-3')} />
          </button>
        )}
      </button>

      {/* Expanded content preview */}
      {expanded && item.content && (
        <div className="border-t border-current/10 px-2 py-1.5 max-h-32 overflow-y-auto">
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all opacity-70">
            {item.content.slice(0, 1000)}
            {item.content.length > 1000 && '\n...'}
          </pre>
        </div>
      )}
    </div>
  );
}

interface ContextBubbleListProps {
  items: ContextItem[];
  onRemove?: (id: string) => void;
  compact?: boolean;
}

export function ContextBubbleList({ items, onRemove, compact = false }: ContextBubbleListProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <ContextBubble
          key={item.id}
          item={item}
          onRemove={onRemove ? () => onRemove(item.id) : undefined}
          compact={compact}
        />
      ))}
    </div>
  );
}
