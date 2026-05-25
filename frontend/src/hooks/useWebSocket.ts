import { useRef, useCallback } from 'react';
import type { TerminalLog, AICoachRecord } from '@/types';

export interface CoachMessage {
  type: 'terminal_log' | 'ai_pending' | 'ai_coach' | 'step_completed';
  payload: TerminalLog | { command: string } | AICoachRecord | unknown;
}

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);

  const connect = useCallback((sessionId: string, handlers: {
    onTerminalLog?: (log: TerminalLog) => void;
    onAIPending?: (command: string) => void;
    onAICoach?: (record: AICoachRecord) => void;
    onStepCompleted?: () => void;
  }) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/ai-coach/${sessionId}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const message: CoachMessage = JSON.parse(event.data);
        switch (message.type) {
          case 'terminal_log':
            handlers.onTerminalLog?.(message.payload as TerminalLog);
            break;
          case 'ai_pending':
            handlers.onAIPending?.((message.payload as { command: string }).command ?? '刚才的命令');
            break;
          case 'ai_coach':
            handlers.onAICoach?.(message.payload as AICoachRecord);
            break;
          case 'step_completed':
            handlers.onStepCompleted?.();
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      socketRef.current = null;
    };

    return socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  return { connect, disconnect, socketRef };
}
