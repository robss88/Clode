import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Cpu } from 'lucide-react';
import clsx from 'clsx';

export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

const MODELS: ModelOption[] = [
  { id: 'sonnet', label: 'Sonnet', description: 'Fast & capable' },
  { id: 'opus', label: 'Opus', description: 'Most powerful' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest & cheapest' },
];

interface ModelSelectorProps {
  model: string;
  onModelChange: (model: string) => void;
}

export function ModelSelector({ model, onModelChange }: ModelSelectorProps) {
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

  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];

  return (
    <div ref={ref} className="relative">
      {/* Dropdown (opens upward) */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 w-52 bg-background-tertiary border border-border-secondary rounded-lg shadow-xl z-30 overflow-hidden">
          <div className="p-1">
            {MODELS.map((m) => {
              const isActive = m.id === model;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onModelChange(m.id);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded text-left transition-colors',
                    isActive
                      ? 'bg-background-active text-foreground hover:bg-background-active'
                      : 'hover:bg-background-hover text-foreground'
                  )}
                >
                  <Cpu className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-foreground-muted">{m.description}</div>
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
        <Cpu className="w-3.5 h-3.5" />
        <span>{currentModel.label}</span>
        <ChevronDown className={clsx('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
      </button>
    </div>
  );
}
