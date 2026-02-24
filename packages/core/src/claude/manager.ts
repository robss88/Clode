import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import type {
  ClaudeConfig,
  ClaudeStreamChunk,
  Message,
  ToolCall,
  ToolResult,
} from '../types';

// We'll try to import the official SDK, but fall back to CLI approach if not available
let query: any;
let ClaudeAgentOptions: any;

try {
  const sdk = require('@anthropic-ai/claude-agent-sdk');
  query = sdk.query;
  ClaudeAgentOptions = sdk.ClaudeAgentOptions;
} catch (e) {
  // SDK not available, will use CLI fallback
  console.log('[ClaudeCodeManager] SDK not available, will use CLI fallback');
}

export interface ClaudeCodeManagerOptions {
  claudePath?: string;
  config: ClaudeConfig;
  onChunk?: (chunk: ClaudeStreamChunk) => void;
  onMessage?: (message: Message) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: ToolResult) => void;
  onError?: (error: Error) => void;
}

interface ClaudeManagerEvents {
  chunk: (chunk: ClaudeStreamChunk) => void;
  message: (message: Message) => void;
  'tool:start': (toolCall: ToolCall) => void;
  'tool:complete': (toolCall: ToolCall, result: ToolResult) => void;
  error: (error: Error) => void;
  started: () => void;
  stopped: () => void;
}

export class ClaudeCodeManager extends EventEmitter<ClaudeManagerEvents> {
  private config: ClaudeConfig;
  private isRunning = false;
  private sessionId: string | null = null;
  private messageHistory: Message[] = [];
  private currentAbortController: AbortController | null = null;

  constructor(options: ClaudeCodeManagerOptions) {
    super();
    this.config = options.config;

    if (options.onChunk) this.on('chunk', options.onChunk);
    if (options.onMessage) this.on('message', options.onMessage);
    if (options.onToolCall) this.on('tool:start', options.onToolCall);
    if (options.onToolResult) this.on('tool:complete', options.onToolResult);
    if (options.onError) this.on('error', options.onError);
  }

  get running(): boolean {
    return this.isRunning;
  }

  get history(): Message[] {
    return [...this.messageHistory];
  }

  async spawn(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Claude Code is already running');
    }

    this.isRunning = true;
    this.emit('started');
    console.log('[ClaudeCodeManager] Ready to accept messages');
  }

  setModel(model: string): void {
    this.config.model = model;
  }

  setSessionId(id: string | null): void {
    this.sessionId = id;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async sendMessage(content: string, options?: { extraFlags?: string[]; model?: string }): Promise<void> {
    console.log('[ClaudeCodeManager] sendMessage called with:', content.slice(0, 50));

    if (!this.isRunning) {
      throw new Error('Claude Code is not running - call spawn() first');
    }

    // Note: Claude Code CLI will use subscription auth if logged in via `/login`
    // or fall back to ANTHROPIC_API_KEY if set in environment

    // Add user message to history
    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.messageHistory.push(userMessage);

    // Create abort controller for interruption
    this.currentAbortController = new AbortController();

    try {
      // Always use CLI for now - SDK is not reliable with subscription auth
      console.log('[ClaudeCodeManager] Using CLI approach (SDK available:', !!query, ')');
      await this.sendMessageWithCLI(content, options);
    } catch (err) {
      console.error('[ClaudeCodeManager] sendMessage error:', err);
      if ((err as Error).name !== 'AbortError') {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.currentAbortController = null;
    }
  }

  private async sendMessageWithSDK(content: string): Promise<void> {
    console.log('[ClaudeCodeManager] Sending message via SDK:', content.slice(0, 50));

    const options: any = {
      allowedTools: this.config.allowedTools || ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
      workingDirectory: this.config.workingDir,
    };

    if (this.config.dangerouslySkipPermissions) {
      options.permissionMode = 'bypassPermissions';
    }

    if (this.sessionId) {
      options.resume = this.sessionId;
    }

    if (this.config.systemPrompt) {
      options.appendSystemPrompt = this.config.systemPrompt;
    }

    if (this.config.model) {
      options.model = this.config.model;
    }

    // Build current message
    let currentMessage: Partial<Message> = {
      id: nanoid(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      isStreaming: true,
    };
    const currentToolCalls = new Map<string, ToolCall>();

    try {
      for await (const event of query({ prompt: content, options })) {
        // Check for abort
        if (this.currentAbortController?.signal.aborted) {
          break;
        }

        // Handle different event types from SDK
        if (event.type === 'system' && event.subtype === 'init') {
          this.sessionId = event.session_id;
          console.log('[ClaudeCodeManager] Session ID:', this.sessionId);
          this.emit('chunk', {
            type: 'init',
            content: '',
            sessionId: event.session_id,
          });
        } else if (event.type === 'assistant') {
          // Process assistant message content
          const messageContent = event.message?.content || [];
          for (const block of messageContent) {
            if (block.type === 'text') {
              const newText = block.text || '';
              if (newText !== currentMessage.content) {
                const delta = newText.slice((currentMessage.content || '').length);
                currentMessage.content = newText;
                if (delta) {
                  this.emit('chunk', {
                    type: 'text',
                    content: delta,
                  });
                }
              }
            } else if (block.type === 'tool_use') {
              if (!currentToolCalls.has(block.id)) {
                const toolCall: ToolCall = {
                  id: block.id,
                  name: block.name,
                  input: block.input || {},
                  status: 'running',
                };
                currentToolCalls.set(block.id, toolCall);
                currentMessage.toolCalls?.push(toolCall);
                this.emit('tool:start', toolCall);
                this.emit('chunk', {
                  type: 'tool_call',
                  content: '',
                  toolCall,
                });
              }
            }
          }
        } else if (event.type === 'user') {
          // Tool results
          const messageContent = event.message?.content || [];
          for (const block of messageContent) {
            if (block.type === 'tool_result') {
              const toolCall = currentToolCalls.get(block.tool_use_id);
              if (toolCall) {
                toolCall.status = block.is_error ? 'error' : 'completed';
                const result: ToolResult = {
                  toolCallId: block.tool_use_id,
                  output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
                  isError: block.is_error || false,
                };
                this.emit('tool:complete', toolCall, result);
                this.emit('chunk', {
                  type: 'tool_result',
                  content: result.output,
                  toolResult: result,
                });
              }
            }
          }
        } else if (event.type === 'result') {
          console.log('[ClaudeCodeManager] Result:', event.subtype);
          if (event.subtype === 'error') {
            this.emit('error', new Error(event.error || 'Unknown error'));
          }
          this.emit('chunk', {
            type: 'complete',
            content: event.result || '',
          });
        }
      }
    } catch (err) {
      throw err;
    }

    // Finalize message
    if (currentMessage.content) {
      currentMessage.isStreaming = false;
      const message = currentMessage as Message;
      this.messageHistory.push(message);
      this.emit('message', message);
    }
  }

  private async sendMessageWithCLI(content: string, options?: { extraFlags?: string[]; model?: string }): Promise<void> {
    console.log('[ClaudeCodeManager] Sending message via CLI fallback:', content.slice(0, 50));

    const { spawn } = require('child_process');
    // Create clean environment without Electron-specific vars that could interfere
    // See: https://github.com/anthropics/claude-code/issues/771
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('ELECTRON') && value !== undefined) {
        env[key] = value;
      }
    }

    return new Promise((resolve, reject) => {
      const args = this.buildCliArgs(content, options);
      console.log('[ClaudeCodeManager] Spawning claude with args:', JSON.stringify(args));
      console.log('[ClaudeCodeManager] Working dir:', this.config.workingDir);

      let childProcess;
      try {
        // Find claude in PATH or use common locations
        const claudePath = process.env.CLAUDE_PATH || 'claude';
        console.log('[ClaudeCodeManager] Using claude path:', claudePath);
        console.log('[ClaudeCodeManager] PATH:', process.env.PATH?.split(':').slice(0, 5).join(':') + '...');

        // IMPORTANT: Use 'ignore' for stdin, clean env without ELECTRON vars, and detached
        // See: https://github.com/anthropics/claude-code/issues/771
        childProcess = spawn(claudePath, args, {
          cwd: this.config.workingDir,
          env: {
            ...env,
            // Ensure we have a proper PATH that includes common node locations
            PATH: env.PATH || '/usr/local/bin:/usr/bin:/bin',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });
        console.log('[ClaudeCodeManager] Spawn successful, pid:', childProcess.pid);

        // Debug: Log when process actually starts
        childProcess.on('spawn', () => {
          console.log('[ClaudeCodeManager] Process spawned event fired');
        });
      } catch (spawnErr) {
        console.error('[ClaudeCodeManager] Spawn failed:', spawnErr);
        reject(spawnErr);
        return;
      }

      // Set a timeout to prevent hanging forever (10 minutes for multi-turn sessions)
      const timeout = setTimeout(() => {
        console.log('[ClaudeCodeManager] Timeout after 600s, killing process');
        childProcess.kill('SIGTERM');
        reject(new Error('Claude CLI timeout'));
      }, 600000);

      let buffer = '';
      let currentMessage: Partial<Message> = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [],
        isStreaming: true,
      };
      const currentToolCalls = new Map<string, ToolCall>();

      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        console.log('[ClaudeCodeManager] stdout chunk:', text.slice(0, 100));
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            console.log('[ClaudeCodeManager] Parsed event:', event.type);
            this.processCliEvent(event, currentMessage, currentToolCalls);
          } catch {
            // Non-JSON output, emit as text
            console.log('[ClaudeCodeManager] Non-JSON output:', line.slice(0, 50));
            if (line.trim()) {
              this.emit('chunk', {
                type: 'text',
                content: line,
              });
            }
          }
        }
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const errorText = data.toString();
        console.log('[ClaudeCodeManager] stderr:', errorText);
      });

      childProcess.on('close', (code: number) => {
        clearTimeout(timeout);
        console.log('[ClaudeCodeManager] CLI process closed with code:', code);

        // Finalize message
        if (currentMessage.content) {
          currentMessage.isStreaming = false;
          const message = currentMessage as Message;
          this.messageHistory.push(message);
          this.emit('message', message);
        }

        this.emit('chunk', {
          type: 'complete',
          content: '',
        });

        resolve();
      });

      childProcess.on('error', (err: Error) => {
        clearTimeout(timeout);
        console.error('[ClaudeCodeManager] CLI process error:', err);
        reject(err);
      });

      // Handle abort
      const abortHandler = () => {
        clearTimeout(timeout);
        childProcess.kill('SIGINT');
      };
      this.currentAbortController?.signal.addEventListener('abort', abortHandler);
    });
  }

  private buildCliArgs(prompt: string, options?: { extraFlags?: string[]; model?: string }): string[] {
    const args: string[] = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',  // Required when using stream-json with -p flag
    ];

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    }

    // Use option model override, or fall back to config
    const model = options?.model || this.config.model;
    if (model) {
      args.push('--model', model);
    }

    if (this.config.systemPrompt) {
      args.push('--append-system-prompt', this.config.systemPrompt);
    }

    if (this.config.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // Append extra CLI flags from options
    if (options?.extraFlags) {
      args.push(...options.extraFlags);
    }

    return args;
  }

  private processCliEvent(
    event: any,
    currentMessage: Partial<Message>,
    currentToolCalls: Map<string, ToolCall>
  ): void {
    if (event.type === 'system' && event.subtype === 'init') {
      this.sessionId = event.session_id;
      console.log('[ClaudeCodeManager] Session ID from CLI:', this.sessionId);
      this.emit('chunk', {
        type: 'init',
        content: '',
        sessionId: event.session_id,
      });
    } else if (event.type === 'assistant') {
      const content = event.message?.content || [];
      for (const block of content) {
        if (block.type === 'text') {
          const newText = block.text || '';
          if (newText.length > (currentMessage.content || '').length) {
            const delta = newText.slice((currentMessage.content || '').length);
            currentMessage.content = newText;
            this.emit('chunk', {
              type: 'text',
              content: delta,
            });
          }
        } else if (block.type === 'tool_use' && !currentToolCalls.has(block.id)) {
          const toolCall: ToolCall = {
            id: block.id,
            name: block.name,
            input: block.input || {},
            status: 'running',
          };
          currentToolCalls.set(block.id, toolCall);
          currentMessage.toolCalls?.push(toolCall);
          this.emit('tool:start', toolCall);
          this.emit('chunk', {
            type: 'tool_call',
            content: '',
            toolCall,
          });
        }
      }
    } else if (event.type === 'user') {
      const content = event.message?.content || [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          const toolCall = currentToolCalls.get(block.tool_use_id);
          if (toolCall) {
            toolCall.status = block.is_error ? 'error' : 'completed';
            const result: ToolResult = {
              toolCallId: block.tool_use_id,
              output: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              isError: block.is_error || false,
            };
            this.emit('tool:complete', toolCall, result);
            this.emit('chunk', {
              type: 'tool_result',
              content: result.output,
              toolResult: result,
            });
          }
        }
      }
    } else if (event.type === 'result') {
      if (event.subtype === 'error') {
        this.emit('error', new Error(event.error || 'Unknown error'));
      }
    }
  }

  async interrupt(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
  }

  async terminate(): Promise<void> {
    this.isRunning = false;
    this.sessionId = null;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.emit('stopped');
  }

  clearHistory(): void {
    this.messageHistory = [];
    this.sessionId = null;
  }
}
