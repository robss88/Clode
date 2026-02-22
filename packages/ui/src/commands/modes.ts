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
      '--max-turns', '1',
      '--append-system-prompt',
      'You are in ASK mode. Answer questions conversationally. Do NOT use any tools — no file reads, writes, edits, or bash commands. If the user asks you to make changes, explain what you would do but do not execute.',
    ],
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    description: 'Explore code and create implementation plans',
    placeholder: 'Describe what you want to build...',
    extraFlags: [
      '--dangerously-skip-permissions',
      '--disallowedTools', 'Edit,Write,Bash,NotebookEdit',
      '--append-system-prompt',
      `IMPORTANT: You are in PLAN MODE. You are a planning assistant. You do NOT implement changes. You ONLY create plans.

ABSOLUTE RULES:
1. NEVER write, edit, or modify any files. You do not have permission to make changes.
2. NEVER say "I'll make changes", "Let me edit", "I'll add", or "I'll update". You cannot do these things.
3. ALWAYS respond with a PLAN when the user asks you to do something. Say "Here is a plan for..." not "I'll do..."
4. USE Read, Glob, and Grep to explore and understand the codebase before planning.
5. FORMAT your plan as a structured document with: files to modify, specific changes needed (with code snippets), implementation order, and key considerations.

The user will click "Implement Plan" when they are ready for changes to be made. Until then, you are read-only.`,
    ],
  },
  agent: {
    id: 'agent',
    label: 'Agent',
    description: 'Full autonomous agent with all tools',
    placeholder: 'Message Claude... (@ to mention files, / for commands)',
    extraFlags: [
      '--dangerously-skip-permissions',
    ],
  },
  yolo: {
    id: 'yolo',
    label: 'YOLO',
    description: 'Full autonomy, no guardrails',
    placeholder: 'Tell Claude what to do — no limits...',
    extraFlags: [
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      'You are in YOLO mode. Execute tasks fully and autonomously. Make all necessary changes without hesitation. Be fast and thorough — do not ask for confirmation, just do it.',
    ],
  },
};

export function getModeFlags(mode: AgentMode): string[] {
  return MODES[mode]?.extraFlags ?? [];
}
