import type { Checkpoint, CheckpointGroup, ICheckpointTree } from '../types';

/**
 * Group checkpoints by time period for sticky headers
 */
export function groupCheckpointsByTime(checkpoints: Checkpoint[]): CheckpointGroup[] {
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

  const thisMonth = new Date(today);
  thisMonth.setDate(1);
  const thisMonthMs = thisMonth.getTime();

  const groups: CheckpointGroup[] = [];
  const sorted = [...checkpoints].sort((a, b) => b.timestamp - a.timestamp);

  const groupMap: Record<string, Checkpoint[]> = {
    'Current': [],
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'This Month': [],
    'Older': [],
  };

  for (const checkpoint of sorted) {
    const ts = checkpoint.timestamp;

    if (checkpoint.metadata.isActive) {
      groupMap['Current'].push(checkpoint);
    } else if (ts >= todayMs) {
      groupMap['Today'].push(checkpoint);
    } else if (ts >= yesterdayMs) {
      groupMap['Yesterday'].push(checkpoint);
    } else if (ts >= thisWeekMs) {
      groupMap['This Week'].push(checkpoint);
    } else if (ts >= thisMonthMs) {
      groupMap['This Month'].push(checkpoint);
    } else {
      groupMap['Older'].push(checkpoint);
    }
  }

  // Build groups array, filtering empty groups
  for (const [label, items] of Object.entries(groupMap)) {
    if (items.length > 0) {
      groups.push({ label, checkpoints: items });
    }
  }

  return groups;
}

/**
 * Get the lineage (path from root) for a checkpoint
 */
export function getCheckpointLineage(
  tree: ICheckpointTree,
  checkpointId: string
): string[] {
  const lineage: string[] = [];
  let current: Checkpoint | undefined = tree.nodes[checkpointId];

  while (current) {
    lineage.unshift(current.id);
    current = current.parentId ? tree.nodes[current.parentId] : undefined;
  }

  return lineage;
}

/**
 * Find common ancestor of two checkpoints
 */
export function findCommonAncestor(
  tree: ICheckpointTree,
  checkpointA: string,
  checkpointB: string
): string | null {
  const lineageA = new Set(getCheckpointLineage(tree, checkpointA));
  const lineageB = getCheckpointLineage(tree, checkpointB);

  for (const id of lineageB) {
    if (lineageA.has(id)) {
      return id;
    }
  }

  return null;
}

/**
 * Get all descendants of a checkpoint
 */
export function getDescendants(
  tree: ICheckpointTree,
  checkpointId: string
): Checkpoint[] {
  const descendants: Checkpoint[] = [];
  const visited = new Set<string>();

  function traverse(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const checkpoint = tree.nodes[id];
    if (!checkpoint) return;

    for (const childId of checkpoint.childIds) {
      const child = tree.nodes[childId];
      if (child) {
        descendants.push(child);
        traverse(childId);
      }
    }
  }

  traverse(checkpointId);
  return descendants;
}

/**
 * Calculate the depth of a checkpoint in the tree
 */
export function getCheckpointDepth(
  tree: ICheckpointTree,
  checkpointId: string
): number {
  let depth = 0;
  let current = tree.nodes[checkpointId];

  while (current?.parentId) {
    depth++;
    current = tree.nodes[current.parentId];
  }

  return depth;
}

/**
 * Format timestamp for display
 */
export function formatCheckpointTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // Less than a minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than an hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} min ago`;
  }

  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Format as date
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate a short summary of file changes
 */
export function summarizeFileChanges(
  changes: Checkpoint['filesChanged']
): string {
  if (changes.length === 0) return 'No changes';

  const added = changes.filter((c) => c.type === 'added').length;
  const modified = changes.filter((c) => c.type === 'modified').length;
  const deleted = changes.filter((c) => c.type === 'deleted').length;

  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (modified > 0) parts.push(`~${modified}`);
  if (deleted > 0) parts.push(`-${deleted}`);

  return parts.join(' ') || 'No changes';
}
