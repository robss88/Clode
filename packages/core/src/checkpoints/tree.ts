import type {
  Checkpoint,
  ICheckpointTree,
  CheckpointGroup,
} from '../types';

/**
 * CheckpointTree - Manages the checkpoint tree structure
 * Supports bidirectional navigation (forward and backward)
 */
export class CheckpointTree {
  private tree: ICheckpointTree;

  constructor(initialTree?: Partial<ICheckpointTree>) {
    this.tree = {
      root: initialTree?.root || null,
      nodes: initialTree?.nodes || {},
      currentId: initialTree?.currentId || null,
      activeLineage: initialTree?.activeLineage || [],
    };
  }

  get root(): string | null {
    return this.tree.root;
  }

  get current(): Checkpoint | null {
    return this.tree.currentId ? this.tree.nodes[this.tree.currentId] : null;
  }

  get currentId(): string | null {
    return this.tree.currentId;
  }

  get nodes(): Record<string, Checkpoint> {
    return { ...this.tree.nodes };
  }

  get lineage(): string[] {
    return [...this.tree.activeLineage];
  }

  /**
   * Add a new checkpoint to the tree
   */
  add(checkpoint: Checkpoint): void {
    // Set parent to current if not specified
    if (checkpoint.parentId === undefined) {
      checkpoint.parentId = this.tree.currentId;
    }

    // Add to nodes
    this.tree.nodes[checkpoint.id] = checkpoint;

    // Update parent's children
    if (checkpoint.parentId && this.tree.nodes[checkpoint.parentId]) {
      const parent = this.tree.nodes[checkpoint.parentId];
      if (!parent.childIds.includes(checkpoint.id)) {
        parent.childIds.push(checkpoint.id);
      }
    }

    // Set as root if first checkpoint
    if (!this.tree.root) {
      this.tree.root = checkpoint.id;
    }

    // Set as current
    this.tree.currentId = checkpoint.id;
    this.updateLineage();
  }

  /**
   * Get a checkpoint by ID
   */
  get(id: string): Checkpoint | null {
    return this.tree.nodes[id] || null;
  }

  /**
   * Navigate to a checkpoint (restore)
   * Returns the checkpoint and the navigation path
   */
  navigateTo(id: string): { checkpoint: Checkpoint; path: string[] } | null {
    const checkpoint = this.tree.nodes[id];
    if (!checkpoint) return null;

    // Mark previous current as not active
    if (this.tree.currentId && this.tree.nodes[this.tree.currentId]) {
      this.tree.nodes[this.tree.currentId].metadata.isActive = false;
    }

    // Update current
    this.tree.currentId = id;
    checkpoint.metadata.isActive = true;

    this.updateLineage();

    return {
      checkpoint,
      path: this.tree.activeLineage,
    };
  }

  /**
   * Navigate forward to a child checkpoint
   * If multiple children exist, navigates to the most recent one
   */
  navigateForward(): { checkpoint: Checkpoint; path: string[] } | null {
    const current = this.current;
    if (!current || current.childIds.length === 0) return null;

    // Find the most recent child
    const children = current.childIds
      .map((id) => this.tree.nodes[id])
      .filter(Boolean)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (children.length === 0) return null;

    return this.navigateTo(children[0].id);
  }

  /**
   * Navigate backward to parent checkpoint
   */
  navigateBack(): { checkpoint: Checkpoint; path: string[] } | null {
    const current = this.current;
    if (!current || !current.parentId) return null;

    return this.navigateTo(current.parentId);
  }

  /**
   * Get forward checkpoints (children of current and their descendants on active lineage)
   */
  getForwardCheckpoints(): Checkpoint[] {
    const current = this.current;
    if (!current) return [];

    const forward: Checkpoint[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const checkpoint = this.tree.nodes[id];
      if (!checkpoint) return;

      for (const childId of checkpoint.childIds) {
        const child = this.tree.nodes[childId];
        if (child) {
          forward.push(child);
          traverse(childId);
        }
      }
    };

    traverse(current.id);
    return forward.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get backward checkpoints (ancestors of current)
   */
  getBackwardCheckpoints(): Checkpoint[] {
    const backward: Checkpoint[] = [];
    let current = this.current;

    while (current?.parentId) {
      const parent = this.tree.nodes[current.parentId];
      if (parent) {
        backward.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    return backward;
  }

  /**
   * Check if can navigate forward
   */
  canNavigateForward(): boolean {
    const current = this.current;
    return current !== null && current.childIds.length > 0;
  }

  /**
   * Check if can navigate backward
   */
  canNavigateBack(): boolean {
    const current = this.current;
    return current !== null && current.parentId !== null;
  }

  /**
   * Get all checkpoints as a flat array, sorted by timestamp
   */
  getAllCheckpoints(): Checkpoint[] {
    return Object.values(this.tree.nodes).sort((a: Checkpoint, b: Checkpoint) => b.timestamp - a.timestamp);
  }

  /**
   * Get checkpoints grouped by time period
   */
  getGroupedCheckpoints(): CheckpointGroup[] {
    const checkpoints = this.getAllCheckpoints();
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMs = yesterday.getTime();

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisWeekMs = thisWeek.getTime();

    const groups: CheckpointGroup[] = [
      { label: 'Now', checkpoints: [] },
      { label: 'Today', checkpoints: [] },
      { label: 'Yesterday', checkpoints: [] },
      { label: 'This Week', checkpoints: [] },
      { label: 'Older', checkpoints: [] },
    ];

    for (const checkpoint of checkpoints) {
      const ts = checkpoint.timestamp;

      // Current checkpoint
      if (checkpoint.metadata.isActive) {
        groups[0].checkpoints.push(checkpoint);
      } else if (ts >= todayMs) {
        groups[1].checkpoints.push(checkpoint);
      } else if (ts >= yesterdayMs) {
        groups[2].checkpoints.push(checkpoint);
      } else if (ts >= thisWeekMs) {
        groups[3].checkpoints.push(checkpoint);
      } else {
        groups[4].checkpoints.push(checkpoint);
      }
    }

    // Filter out empty groups
    return groups.filter((g) => g.checkpoints.length > 0);
  }

  /**
   * Remove a checkpoint and update tree structure
   */
  remove(id: string): boolean {
    const checkpoint = this.tree.nodes[id];
    if (!checkpoint) return false;

    // Cannot remove root if it has children
    if (id === this.tree.root && checkpoint.childIds.length > 0) {
      return false;
    }

    // Update parent's children
    if (checkpoint.parentId && this.tree.nodes[checkpoint.parentId]) {
      const parent = this.tree.nodes[checkpoint.parentId];
      parent.childIds = parent.childIds.filter((cid: string) => cid !== id);
    }

    // Reparent children to this checkpoint's parent
    for (const childId of checkpoint.childIds) {
      const child = this.tree.nodes[childId];
      if (child) {
        child.parentId = checkpoint.parentId;
        if (checkpoint.parentId && this.tree.nodes[checkpoint.parentId]) {
          this.tree.nodes[checkpoint.parentId].childIds.push(childId);
        }
      }
    }

    // Remove from nodes
    delete this.tree.nodes[id];

    // Update root if needed
    if (id === this.tree.root) {
      this.tree.root = null;
    }

    // Update current if needed
    if (id === this.tree.currentId) {
      this.tree.currentId = checkpoint.parentId;
      this.updateLineage();
    }

    return true;
  }

  /**
   * Update the active lineage (path from root to current)
   */
  private updateLineage(): void {
    const lineage: string[] = [];
    let current = this.current;

    while (current) {
      lineage.unshift(current.id);
      current = current.parentId ? this.tree.nodes[current.parentId] : null;
    }

    this.tree.activeLineage = lineage;
  }

  /**
   * Export tree for serialization
   */
  export(): ICheckpointTree {
    return JSON.parse(JSON.stringify(this.tree));
  }

  /**
   * Import tree from serialized data
   */
  import(data: ICheckpointTree): void {
    this.tree = {
      root: data.root,
      nodes: data.nodes,
      currentId: data.currentId,
      activeLineage: data.activeLineage,
    };
  }
}
