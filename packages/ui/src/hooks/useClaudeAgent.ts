import { useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { ClaudeCodeManager, Message, ClaudeStreamChunk } from '@claude-agent/core';
import { useAgentStore } from '../stores';

interface UseClaudeAgentOptions {
  manager: ClaudeCodeManager | null;
  onCheckpointTrigger?: (messages: Message[]) => void;
}

export function useClaudeAgent({ manager, onCheckpointTrigger }: UseClaudeAgentOptions) {
  const {
    messages,
    isStreaming,
    streamingContent,
    addMessage,
    updateMessage,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
    setCurrentToolCall,
    addStreamingToolCall,
    updateStreamingToolCall,
    clearStreamingToolCalls,
  } = useAgentStore();

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Set up event listeners
  useEffect(() => {
    if (!manager) return;

    const handleChunk = (chunk: ClaudeStreamChunk) => {
      if (chunk.type === 'text') {
        appendStreamingContent(chunk.content);
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        setCurrentToolCall(chunk.toolCall);
        // Add to streaming tool calls list (avoid duplicates)
        const existing = useAgentStore.getState().streamingToolCalls;
        if (!existing.some((t) => t.id === chunk.toolCall!.id)) {
          addStreamingToolCall(chunk.toolCall);
        }
      } else if (chunk.type === 'tool_result' && chunk.toolResult) {
        // Update the completed tool call in streaming list
        updateStreamingToolCall(chunk.toolResult.toolCallId, {
          status: chunk.toolResult.isError ? 'error' : 'completed',
          output: chunk.toolResult.output,
        });
      }
    };

    const handleMessage = (message: Message) => {
      clearStreamingContent();
      clearStreamingToolCalls();
      addMessage(message);
      setStreaming(false);
      setCurrentToolCall(null);

      // Check if we should trigger a checkpoint
      if (message.toolCalls?.some((t) =>
        ['write', 'edit', 'bash'].includes(t.name.toLowerCase())
      )) {
        onCheckpointTrigger?.(messagesRef.current);
      }
    };

    const handleToolStart = (toolCall: any) => {
      setCurrentToolCall(toolCall);
    };

    const handleToolComplete = () => {
      setCurrentToolCall(null);
    };

    const handleError = (error: Error) => {
      console.error('Claude error:', error);
      setStreaming(false);
      clearStreamingContent();

      // Add error message
      addMessage({
        id: nanoid(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      });
    };

    manager.on('chunk', handleChunk);
    manager.on('message', handleMessage);
    manager.on('tool:start', handleToolStart);
    manager.on('tool:complete', handleToolComplete);
    manager.on('error', handleError);

    return () => {
      manager.off('chunk', handleChunk);
      manager.off('message', handleMessage);
      manager.off('tool:start', handleToolStart);
      manager.off('tool:complete', handleToolComplete);
      manager.off('error', handleError);
    };
  }, [manager, addMessage, appendStreamingContent, clearStreamingContent, setStreaming, setCurrentToolCall, addStreamingToolCall, updateStreamingToolCall, clearStreamingToolCalls, onCheckpointTrigger]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!manager || isStreaming) return;

    // Add user message immediately
    const userMessage: Message = {
      id: nanoid(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(userMessage);
    setStreaming(true);

    try {
      await manager.sendMessage(content);
    } catch (error) {
      console.error('Failed to send message:', error);
      setStreaming(false);
    }
  }, [manager, isStreaming, addMessage, setStreaming]);

  // Interrupt generation
  const interrupt = useCallback(async () => {
    if (!manager || !isStreaming) return;

    try {
      await manager.interrupt();
      setStreaming(false);
      clearStreamingContent();
    } catch (error) {
      console.error('Failed to interrupt:', error);
    }
  }, [manager, isStreaming, setStreaming, clearStreamingContent]);

  return {
    messages,
    isStreaming,
    streamingContent,
    sendMessage,
    interrupt,
  };
}
