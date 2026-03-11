import type { AgentMode } from '../stores';

export interface ModeDefinition {
  id: AgentMode;
  label: string;
  description: string;
  placeholder: string;
  extraFlags: string[];
}

export const MODES: Record<AgentMode, ModeDefinition> = {
  ask: {
    id: 'ask',
    label: 'Ask',
    description: 'Conversation only, no file changes',
    placeholder: 'Ask Claude anything...',
    extraFlags: [
      '--permission-mode', 'plan',
      '--max-turns', '1',
    ],
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    description: 'Explore code and create implementation plans',
    placeholder: 'Describe what you want to build...',
    extraFlags: [
      '--permission-mode', 'plan',
    ],
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    description: 'Full autonomous agent with all tools',
    placeholder: 'Message Claude... (@ to mention files, / for commands)',
    extraFlags: [
      '--permission-mode', 'acceptEdits',
    ],
  },
  yolo: {
    id: 'yolo',
    label: 'YOLO',
    description: 'Full autonomy, no guardrails',
    placeholder: 'Tell Claude what to do — no limits...',
    extraFlags: [
      '--dangerously-skip-permissions',
    ],
  },
};

export function getModeFlags(mode: AgentMode): string[] {
  return MODES[mode]?.extraFlags ?? [];
}
