import { Bot, Map, MessageCircle, Zap, Cpu, FileText, Brain } from 'lucide-react';
import type { CommandItem } from '@claude-agent/ui';
import { useUIStore, useAgentStore } from '@claude-agent/ui';
import type { Bridge } from '../bridge/types';

export function createCommands(bridge: Bridge): CommandItem[] {
  return [
    // Mode commands
    {
      id: 'mode-ask',
      label: 'Ask Mode',
      description: 'Conversation only, no file changes',
      icon: <MessageCircle className="w-4 h-4" />,
      keywords: ['mode', 'chat', 'talk'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('ask'),
    },
    {
      id: 'mode-plan',
      label: 'Plan Mode',
      description: 'Explore code and create implementation plans',
      icon: <Map className="w-4 h-4" />,
      keywords: ['mode', 'plan', 'design'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('plan'),
    },
    {
      id: 'mode-agent',
      label: 'Agent Mode',
      description: 'Full autonomous agent with all tools',
      icon: <Bot className="w-4 h-4" />,
      keywords: ['mode', 'agent', 'auto'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('agent'),
    },
    {
      id: 'mode-yolo',
      label: 'YOLO Mode',
      description: 'Full autonomy, no guardrails',
      icon: <Zap className="w-4 h-4" />,
      keywords: ['mode', 'yolo', 'fast'],
      category: 'mode',
      action: () => useUIStore.getState().setMode('yolo'),
    },
    // Model commands
    {
      id: 'model-sonnet',
      label: 'Sonnet',
      description: 'Switch to Claude Sonnet (fast & capable)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'sonnet'],
      category: 'model',
      action: () => bridge.setModel('sonnet'),
    },
    {
      id: 'model-opus',
      label: 'Opus',
      description: 'Switch to Claude Opus (most powerful)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'opus'],
      category: 'model',
      action: () => bridge.setModel('opus'),
    },
    {
      id: 'model-haiku',
      label: 'Haiku',
      description: 'Switch to Claude Haiku (fastest & cheapest)',
      icon: <Cpu className="w-4 h-4" />,
      keywords: ['model', 'haiku'],
      category: 'model',
      action: () => bridge.setModel('haiku'),
    },
    // Action commands
    {
      id: 'clear-chat',
      label: 'Clear Conversation',
      description: 'Clear all messages in current chat',
      icon: <FileText className="w-4 h-4" />,
      keywords: ['clear', 'reset', 'delete'],
      category: 'action',
      action: () => useAgentStore.getState().clearMessages(),
    },
    {
      id: 'toggle-thinking',
      label: 'Toggle Extended Thinking',
      description: 'Enable/disable extended reasoning mode',
      icon: <Brain className="w-4 h-4" />,
      keywords: ['thinking', 'reasoning', 'extended'],
      category: 'action',
      action: () => {
        const current = useUIStore.getState().extendedThinking;
        useUIStore.getState().setExtendedThinking(!current);
      },
    },
    // Settings
    {
      id: 'open-settings',
      label: 'Settings',
      description: 'Open settings panel',
      icon: <FileText className="w-4 h-4" />,
      keywords: ['settings', 'config', 'preferences'],
      category: 'settings',
      action: () => useUIStore.getState().toggleSettings(),
    },
  ];
}