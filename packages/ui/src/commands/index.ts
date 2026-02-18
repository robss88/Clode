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
    context.onSetModel(args.trim());
    return { type: 'local', message: `Model switched to: ${args.trim()}` };
  },
});
