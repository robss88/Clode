import React, { useState, useRef, useEffect } from 'react';
import { Bot, Map, MessageCircle, Zap, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { MODES } from '../../commands/modes';
import type { AgentMode } from '../../stores';

const MODE_ICONS: Record<AgentMode, React.ComponentType<{ className?: string }>> = {
  ask: MessageCircle,
  plan: Map,
  agent: Bot,
  yolo: Zap,
};

const MODE_ORDER: AgentMode[] = ['ask', 'plan', 'agent', 'yolo'];

interface ModeSelectorProps {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  dropdownDirection?: 'up' | 'down';
}

export function ModeSelector({ mode, onModeChange, dropdownDirection = 'up' }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const currentMode = MODES[mode];
  const Icon = MODE_ICONS[mode];

  return (
    <div ref={ref} className="relative">
      {/* Dropdown (opens upward) */}
      {isOpen && (
        <div className={clsx(
          'absolute left-0 w-64 bg-background-tertiary border border-border-secondary rounded-lg shadow-xl z-30 overflow-hidden',
          dropdownDirection === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
        )}>
          <div className="p-1">
            {MODE_ORDER.map((modeId) => {
              const def = MODES[modeId];
              const ModeIcon = MODE_ICONS[modeId];
              const isActive = modeId === mode;
              return (
                <button
                  key={modeId}
                  type="button"
                  onClick={() => {
                    onModeChange(modeId);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors',
                    isActive
                      ? 'bg-background-active text-foreground hover:bg-background-active'
                      : 'hover:bg-background-hover text-foreground'
                  )}
                >
                  <ModeIcon className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{def.label}</div>
                    <div className="text-xs text-foreground-muted">{def.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pill button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors',
          'hover:bg-background-hover',
          isOpen ? 'bg-background-hover text-foreground' : 'text-foreground-muted'
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{currentMode.label}</span>
        <ChevronDown className={clsx('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>
    </div>
  );
}
