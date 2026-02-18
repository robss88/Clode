import type { AgentMode } from '../stores';

export interface ModeDefinition {
  id: AgentMode;
  label: string;
  description: string;
  placeholder: string;
  extraFlags: string[];
}

export const MODES: Record<AgentMode, ModeDefinition> = {
  agent: {
    id: 'agent',
    label: 'Agent',
    description: 'Full autonomous agent with all tools',
    placeholder: 'Message Claude... (@ to mention files, / for commands)',
    extraFlags: [],
  },
  plan: {
    id: 'plan',
    label: 'Plan',
    description: 'Creates a plan for review before implementation',
    placeholder: 'Describe what you want to build...',
    extraFlags: [
      '--max-turns', '1',
      '--append-system-prompt',
      `You are in PLAN MODE. Your job is to create a detailed implementation plan, NOT to implement it.

RULES:
- Do NOT use any tools (no file reads, writes, edits, or bash commands)
- Analyze the request and create a structured markdown plan
- Include: files to modify, specific changes needed, implementation order
- Use code snippets to show key changes
- End with a summary of the approach

Format your plan with clear headers and bullet points.`,
    ],
  },
  chat: {
    id: 'chat',
    label: 'Chat',
    description: 'Conversation only, no file changes',
    placeholder: 'Chat with Claude... (no tools, conversation only)',
    extraFlags: [
      '--max-turns', '1',
      '--append-system-prompt',
      'You are in chat-only mode. Do NOT use any tools - no file reads, writes, edits, or bash commands. Only have a conversation with the user. If they ask you to make changes, explain what you would do but do not execute.',
    ],
  },
};

export function getModeFlags(mode: AgentMode): string[] {
  return MODES[mode]?.extraFlags ?? [];
}
