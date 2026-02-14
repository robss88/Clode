import { useCallback, useEffect } from 'react';
import type { CheckpointManager, Message } from '@claude-agent/core';
import { useCheckpointStore } from '../stores';

interface UseCheckpointsOptions {
  manager: CheckpointManager | null;
}

export function useCheckpoints({ manager }: UseCheckpointsOptions) {
  const {
    checkpoints,
    currentId,
    previewId,
    canGoForward,
    canGoBack,
    currentBranch,
    setCheckpoints,
    setCurrentId,
    setPreviewId,
    setNavigation,
    setCurrentBranch,
    addCheckpoint,
    removeCheckpoint,
  } = useCheckpointStore();

  // Sync state from manager
  useEffect(() => {
    if (!manager) return;

    const syncState = async () => {
      const allCheckpoints = manager.getAllCheckpoints();
      const branch = await manager.getCurrentBranch();

      setCheckpoints(allCheckpoints);
      setCurrentId(manager.current?.id || null);
      setNavigation(manager.canGoForward, manager.canGoBack);
      setCurrentBranch(branch);
    };

    // Initial sync
    syncState();

    // Listen for changes
    manager.on('checkpoint:created', () => syncState());
    manager.on('checkpoint:restored', () => syncState());
    manager.on('checkpoint:deleted', () => syncState());
    manager.on('navigation:forward', () => syncState());
    manager.on('navigation:back', () => syncState());

    return () => {
      manager.off('checkpoint:created', syncState);
      manager.off('checkpoint:restored', syncState);
      manager.off('checkpoint:deleted', syncState);
      manager.off('navigation:forward', syncState);
      manager.off('navigation:back', syncState);
    };
  }, [manager, setCheckpoints, setCurrentId, setNavigation, setCurrentBranch]);

  // Create checkpoint
  const createCheckpoint = useCallback(async (
    title?: string,
    description?: string,
    messages: Message[] = []
  ) => {
    if (!manager) return null;

    try {
      const checkpoint = await manager.createCheckpoint(title, description, messages);
      return checkpoint;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }, [manager]);

  // Navigate to checkpoint
  const navigateToCheckpoint = useCallback(async (checkpointId: string) => {
    if (!manager) return;

    try {
      await manager.restoreCheckpoint(checkpointId);
    } catch (error) {
      console.error('Failed to navigate to checkpoint:', error);
    }
  }, [manager]);

  // Navigate forward
  const navigateForward = useCallback(async () => {
    if (!manager || !canGoForward) return;

    try {
      await manager.navigateForward();
    } catch (error) {
      console.error('Failed to navigate forward:', error);
    }
  }, [manager, canGoForward]);

  // Navigate back
  const navigateBack = useCallback(async () => {
    if (!manager || !canGoBack) return;

    try {
      await manager.navigateBack();
    } catch (error) {
      console.error('Failed to navigate back:', error);
    }
  }, [manager, canGoBack]);

  // Delete checkpoint
  const deleteCheckpoint = useCallback(async (checkpointId: string) => {
    if (!manager) return false;

    try {
      return await manager.deleteCheckpoint(checkpointId);
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
      return false;
    }
  }, [manager]);

  // Get diff for checkpoint
  const getCheckpointDiff = useCallback(async (checkpointId: string) => {
    if (!manager) return '';

    try {
      return await manager.getCheckpointDiff(checkpointId);
    } catch (error) {
      console.error('Failed to get checkpoint diff:', error);
      return '';
    }
  }, [manager]);

  // Preview checkpoint (just set the ID, UI handles the rest)
  const previewCheckpoint = useCallback((checkpointId: string) => {
    setPreviewId(checkpointId);
  }, [setPreviewId]);

  // Clear preview
  const clearPreview = useCallback(() => {
    setPreviewId(null);
  }, [setPreviewId]);

  return {
    checkpoints,
    currentId,
    previewId,
    canGoForward,
    canGoBack,
    currentBranch,
    createCheckpoint,
    navigateToCheckpoint,
    navigateForward,
    navigateBack,
    deleteCheckpoint,
    getCheckpointDiff,
    previewCheckpoint,
    clearPreview,
  };
}
