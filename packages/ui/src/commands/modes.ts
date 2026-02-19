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
    description: 'Reads code, creates plans before implementation',
    placeholder: 'Describe what you want to build...',
    extraFlags: [
      '--max-turns', '1',
      '--dangerously-skip-permissions',
      '--append-system-prompt',
      `You are in PLAN MODE. Your job is to read code and create a detailed implementation plan, NOT to implement it.

RULES:
- You MAY use read-only tools (Read, Glob, Grep) to understand the codebase
- Do NOT use any write tools (Write, Edit, Bash) — do not modify any files
- Analyze the request and create a structured markdown plan
- Include: files to modify, specific changes needed, implementation order
- Use code snippets to show key changes
- End with a summary of the approach

Format your plan with clear headers and bullet points.`,
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
