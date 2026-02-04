import { EventEmitter } from 'eventemitter3';
import { CheckpointTree } from './tree';
import { GitCheckpointStorage } from './git';
import type { Checkpoint, Message, FileChange } from '../types';

export interface CheckpointManagerOptions {
  workingDir: string;
  sessionId?: string;
  autoCheckpoint?: boolean;
  checkpointOnToolCall?: boolean;
}

interface CheckpointManagerEvents {
  'checkpoint:created': (checkpoint: Checkpoint) => void;
  'checkpoint:restored': (checkpoint: Checkpoint) => void;
  'checkpoint:deleted': (checkpointId: string) => void;
  'navigation:forward': (checkpoint: Checkpoint) => void;
  'navigation:back': (checkpoint: Checkpoint) => void;
  error: (error: Error) => void;
}

/**
 * CheckpointManager - High-level API for managing checkpoints
 * Combines the CheckpointTree (in-memory) with GitCheckpointStorage (persistence)
 */
export class CheckpointManager extends EventEmitter<CheckpointManagerEvents> {
  private tree: CheckpointTree;
  private storage: GitCheckpointStorage;
  private options: CheckpointManagerOptions;
  private initialized = false;

  constructor(options: CheckpointManagerOptions) {
    super();
    this.options = {
      autoCheckpoint: true,
      checkpointOnToolCall: true,
      ...options,
    };
    this.tree = new CheckpointTree();
    this.storage = new GitCheckpointStorage({
      workingDir: options.workingDir,
      sessionId: options.sessionId,
    });
  }

  get current(): Checkpoint | null {
    return this.tree.current;
  }

  get canGoForward(): boolean {
    return this.tree.canNavigateForward();
  }

  get canGoBack(): boolean {
    return this.tree.canNavigateBack();
  }

  /**
   * Initialize the checkpoint manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.storage.initialize();

      // Load existing checkpoints
      const savedTree = await this.storage.loadCheckpointMetadata();
      if (savedTree.root) {
        this.tree.import(savedTree);
      }

      this.initialized = true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Create a new checkpoint
   */
  async createCheckpoint(
    title?: string,
    description?: string,
    messages: Message[] = []
  ): Promise<Checkpoint> {
    await this.initialize();

    const autoTitle = title || this.generateTitle(messages);
    const autoDescription = description || this.generateDescription(messages);

    try {
      const checkpoint = await this.storage.createCheckpoint(
        autoTitle,
        autoDescription,
        messages,
        this.tree.currentId
      );

      this.tree.add(checkpoint);
      this.emit('checkpoint:created', checkpoint);

      return checkpoint;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Restore to a specific checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<Checkpoint> {
    await this.initialize();

    const checkpoint = this.tree.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    try {
      await this.storage.restoreCheckpoint(checkpoint);
      this.tree.navigateTo(checkpointId);
      this.emit('checkpoint:restored', checkpoint);

      return checkpoint;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Navigate forward (to most recent child)
   */
  async navigateForward(): Promise<Checkpoint | null> {
    await this.initialize();

    const result = this.tree.navigateForward();
    if (!result) return null;

    try {
      await this.storage.restoreCheckpoint(result.checkpoint);
      this.emit('navigation:forward', result.checkpoint);
      return result.checkpoint;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Navigate backward (to parent)
   */
  async navigateBack(): Promise<Checkpoint | null> {
    await this.initialize();

    const result = this.tree.navigateBack();
    if (!result) return null;

    try {
      await this.storage.restoreCheckpoint(result.checkpoint);
      this.emit('navigation:back', result.checkpoint);
      return result.checkpoint;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Get all checkpoints
   */
  getAllCheckpoints(): Checkpoint[] {
    return this.tree.getAllCheckpoints();
  }

  /**
   * Get checkpoints grouped by time
   */
  getGroupedCheckpoints() {
    return this.tree.getGroupedCheckpoints();
  }

  /**
   * Get forward checkpoints from current
   */
  getForwardCheckpoints(): Checkpoint[] {
    return this.tree.getForwardCheckpoints();
  }

  /**
   * Get backward checkpoints from current
   */
  getBackwardCheckpoints(): Checkpoint[] {
    return this.tree.getBackwardCheckpoints();
  }

  /**
   * Get diff for a checkpoint
   */
  async getCheckpointDiff(checkpointId: string): Promise<string> {
    await this.initialize();
    return this.storage.getCheckpointDiff(checkpointId);
  }

  /**
   * Get a specific checkpoint
   */
  getCheckpoint(id: string): Checkpoint | null {
    return this.tree.get(id);
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const success = this.tree.remove(checkpointId);
    if (success) {
      this.emit('checkpoint:deleted', checkpointId);
    }
    return success;
  }

  /**
   * Export checkpoint tree for persistence
   */
  exportTree() {
    return this.tree.export();
  }

  /**
   * Generate automatic title from messages
   */
  private generateTitle(messages: Message[]): string {
    if (messages.length === 0) return 'Initial checkpoint';

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      const content = lastUserMessage.content.slice(0, 50);
      return content.length < lastUserMessage.content.length ? `${content}...` : content;
    }

    return `Checkpoint at ${new Date().toLocaleTimeString()}`;
  }

  /**
   * Generate automatic description from messages
   */
  private generateDescription(messages: Message[]): string {
    const recentMessages = messages.slice(-3);
    const toolCalls = recentMessages.flatMap((m) => m.toolCalls || []);

    if (toolCalls.length > 0) {
      const toolNames = [...new Set(toolCalls.map((t) => t.name))];
      return `Tools used: ${toolNames.join(', ')}`;
    }

    return '';
  }
}
