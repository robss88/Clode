import type { ClaudeStreamChunk, ToolCall, ContentBlock } from '../types';

/**
 * Parse a raw stream chunk from Claude Code output (stream-json format)
 */
export function parseStreamChunk(raw: string): ClaudeStreamChunk | null {
  if (!raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    // Handle assistant messages with content blocks
    if (parsed.type === 'assistant' && parsed.message?.content) {
      const content = parsed.message.content;
      if (Array.isArray(content) && content.length > 0) {
        const firstBlock = content[0];
        if (firstBlock.type === 'text') {
          return {
            type: 'text',
            content: firstBlock.text || '',
          };
        }
        if (firstBlock.type === 'tool_use') {
          return {
            type: 'tool_call',
            content: '',
            toolCall: {
              id: firstBlock.id,
              name: firstBlock.name,
              input: firstBlock.input || {},
              status: 'pending',
            },
          };
        }
      }
    }

    // Handle system init
    if (parsed.type === 'system' && parsed.subtype === 'init') {
      return {
        type: 'init',
        content: '',
        sessionId: parsed.session_id,
      };
    }

    // Handle result events
    if (parsed.type === 'result') {
      if (parsed.subtype === 'error') {
        return {
          type: 'error',
          content: parsed.error || 'Unknown error',
        };
      }
      return {
        type: 'complete',
        content: parsed.result || '',
      };
    }

    // Handle user events (tool results)
    if (parsed.type === 'user' && parsed.message?.content) {
      const content = parsed.message.content;
      if (Array.isArray(content) && content.length > 0) {
        const firstBlock = content[0];
        if (firstBlock.type === 'tool_result') {
          return {
            type: 'tool_result',
            content: firstBlock.content || '',
            toolResult: {
              toolCallId: firstBlock.tool_use_id,
              output: firstBlock.content || '',
              isError: firstBlock.is_error || false,
            },
          };
        }
      }
    }

    // Default fallback
    return {
      type: 'text',
      content: raw,
    };
  } catch {
    // Not JSON, treat as plain text
    return {
      type: 'text',
      content: raw,
    };
  }
}

/**
 * Parse a tool call from Claude Code output
 */
export function parseToolCall(raw: unknown): ToolCall | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;

  if (!data.name || typeof data.name !== 'string') {
    return null;
  }

  return {
    id: (data.id as string) || crypto.randomUUID(),
    name: data.name,
    input: (data.input as Record<string, unknown>) || {},
    status: 'pending',
  };
}

/**
 * Extract file changes from tool calls
 */
export function extractFileChanges(toolCalls: ToolCall[]): Array<{
  path: string;
  type: 'read' | 'write' | 'edit' | 'delete';
}> {
  const changes: Array<{ path: string; type: 'read' | 'write' | 'edit' | 'delete' }> = [];

  for (const tool of toolCalls) {
    const input = tool.input;

    switch (tool.name.toLowerCase()) {
      case 'read':
      case 'read_file':
        if (input.file_path && typeof input.file_path === 'string') {
          changes.push({ path: input.file_path, type: 'read' });
        }
        break;

      case 'write':
      case 'write_file':
        if (input.file_path && typeof input.file_path === 'string') {
          changes.push({ path: input.file_path, type: 'write' });
        }
        break;

      case 'edit':
      case 'edit_file':
        if (input.file_path && typeof input.file_path === 'string') {
          changes.push({ path: input.file_path, type: 'edit' });
        }
        break;

      case 'bash':
        // Try to detect file operations in bash commands
        const command = input.command as string;
        if (command) {
          if (command.includes('rm ') || command.includes('rm -')) {
            const match = command.match(/rm\s+(?:-\w+\s+)*([^\s]+)/);
            if (match) {
              changes.push({ path: match[1], type: 'delete' });
            }
          }
        }
        break;
    }
  }

  return changes;
}
