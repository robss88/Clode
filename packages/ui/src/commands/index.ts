export { getModeFlags, MODES } from './modes';

export interface SendMessageOptions {
  extraFlags?: string[];
  model?: string;
}

export interface CommandContext {
  onClearMessages: () => void;
  onSendMessage: (content: string, options?: SendMessageOptions) => void;
  onSetModel: (model: string) => void;
  onSetMode?: (mode: string) => void;
  onAddSystemMessage: (content: string) => void;
}

export type CommandResultType = 'local' | 'cli' | 'error';

export interface CommandResult {
  type: CommandResultType;
  message?: string;
  cliPrompt?: string;
  cliFlags?: string[];
  clearConversation?: boolean;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  execute: (args: string, context: CommandContext) => CommandResult;
}

const COMMANDS: Record<string, SlashCommand> = {};

function registerCommand(cmd: SlashCommand): void {
  COMMANDS[cmd.name] = cmd;
}

export function parseSlashCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: '' };
  }
  return {
    command: trimmed.slice(1, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export function executeCommand(input: string, context: CommandContext): CommandResult | null {
  const parsed = parseSlashCommand(input);
  if (!parsed) return null;

  const cmd = COMMANDS[parsed.command];
  if (!cmd) {
    return {
      type: 'error',
      message: `Unknown command: /${parsed.command}. Type /help for available commands.`,
    };
  }

  return cmd.execute(parsed.args, context);
}

export function getAvailableCommands(): SlashCommand[] {
  return Object.values(COMMANDS);
}

// Built-in commands

registerCommand({
  name: 'help',
  description: 'Show available commands',
  usage: '/help',
  execute: () => {
    const cmds = getAvailableCommands();
    const helpText = cmds
      .map((c) => `**${c.usage}** - ${c.description}`)
      .join('\n');
    return { type: 'local', message: `Available commands:\n${helpText}` };
  },
});

registerCommand({
  name: 'clear',
  description: 'Clear the conversation',
  usage: '/clear',
  execute: (_args, context) => {
    context.onClearMessages();
    return { type: 'local', clearConversation: true, message: 'Conversation cleared.' };
  },
});

registerCommand({
  name: 'compact',
  description: 'Compact conversation context to save tokens',
  usage: '/compact [instructions]',
  execute: (args) => {
    const instructions =
      args || 'Summarize our conversation so far concisely, then continue helping.';
    return {
      type: 'cli',
      cliPrompt: instructions,
      message: 'Compacting conversation context...',
    };
  },
});

registerCommand({
  name: 'model',
  description: 'Switch the Claude model',
  usage: '/model <name>',
  execute: (args, context) => {
    if (!args.trim()) {
      return {
        type: 'error',
        message:
          'Usage: /model <model-name>\nExamples: /model opus, /model sonnet, /model claude-sonnet-4-5-20250929',
      };
    }
    const modelName = args.trim();
    // Update UI store so the model selector reflects the change
    context.onSetModel(modelName);
    return { type: 'local', message: `Model switched to: ${modelName}` };
  },
});

registerCommand({
  name: 'thinking',
  description: 'Toggle extended thinking mode',
  usage: '/thinking',
  execute: () => {
    // Access UI store - we'll need to import it
    const { useUIStore } = require('../stores');
    const current = useUIStore.getState().extendedThinking;
    useUIStore.getState().setExtendedThinking(!current);
    return {
      type: 'local',
      message: `Extended thinking ${!current ? 'enabled' : 'disabled'}.`,
    };
  },
});

registerCommand({
  name: 'copy',
  description: 'Copy code blocks from conversation',
  usage: '/copy',
  execute: () => {
    return {
      type: 'local',
      message: 'Interactive code block selector (coming soon)',
    };
  },
});

registerCommand({
  name: 'rewind',
  description: 'Rewind to previous checkpoint',
  usage: '/rewind',
  execute: () => {
    return {
      type: 'local',
      message: 'Use the checkpoint panel on the right to navigate history',
    };
  },
});

registerCommand({
  name: 'mode',
  description: 'Switch agent mode',
  usage: '/mode <ask|plan|agent|yolo>',
  execute: (args, context) => {
    const mode = args.trim().toLowerCase();
    const validModes = ['ask', 'plan', 'agent', 'yolo'];
    if (!validModes.includes(mode)) {
      return {
        type: 'error',
        message: `Invalid mode. Use one of: ${validModes.join(', ')}`,
      };
    }
    if (context.onSetMode) {
      context.onSetMode(mode);
    }
    return { type: 'local', message: `Switched to ${mode} mode.` };
  },
});

registerCommand({
  name: 'settings',
  description: 'Open settings panel',
  usage: '/settings',
  execute: () => {
    const { useUIStore } = require('../stores');
    useUIStore.getState().toggleSettings();
    return { type: 'local' };
  },
});
