import type { ContextItem, FileNode, Message, ToolCall } from '@claude-agent/core';
import { ChronologicalChat } from '@claude-agent/ui';
import { useCallback } from 'react';
import { useUIStore } from '@claude-agent/ui';
import { useBridge } from '../bridge/context';

interface ChatPanelProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  currentToolCall: ToolCall | null;
  fileTree: FileNode | null;
  checkpointMessageIds: Set<string>;
  restoredAtMessageId: string | null;
  onSendMessage: (content: string, context?: ContextItem[]) => void;
  onInterrupt: () => void;
  onRestoreToMessage: (messageId: string) => void;
  onEditMessageAndContinue: (messageId: string, newContent: string, context?: ContextItem[]) => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  streamingContent,
  currentToolCall,
  fileTree,
  checkpointMessageIds,
  restoredAtMessageId,
  onSendMessage,
  onInterrupt,
  onRestoreToMessage,
  onEditMessageAndContinue,
}: ChatPanelProps) {
  const bridge = useBridge();

  const handleModelChange = useCallback((model: 'sonnet' | 'opus' | 'haiku') => {
    useUIStore.getState().setModel(model);
    bridge.setModel(model);
  }, [bridge]);

  const handleReadFile = useCallback((path: string) => {
    return bridge.readFile(path);
  }, [bridge]);

  return (
    <ChronologicalChat
      messages={messages}
      isStreaming={isStreaming}
      streamingContent={streamingContent}
      currentToolCall={currentToolCall}
      fileTree={fileTree}
      checkpointMessageIds={checkpointMessageIds}
      onSendMessage={onSendMessage}
      onInterrupt={onInterrupt}
      onRestoreToMessage={onRestoreToMessage}
      onEditMessageAndContinue={onEditMessageAndContinue}
      restoredAtMessageId={restoredAtMessageId}
      onReadFile={handleReadFile}
      onModelChange={handleModelChange}
    />
  );
}