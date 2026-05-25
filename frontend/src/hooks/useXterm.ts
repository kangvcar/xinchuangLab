import { useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function useXterm(onCommand: (cmd: string) => void) {
  const termRef = useRef<XTerm | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputBufferRef = useRef('');

  const init = useCallback(() => {
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'Cascadia Mono', 'Consolas', 'Fira Code', monospace",
      fontSize: 14,
      theme: {
        background: '#1f180f',
        foreground: '#f3f4f6',
        cursor: '#f3f4f6',
        selectionBackground: '#4a3f32',
        black: '#2b2118',
        red: '#e05a5a',
        green: '#a8d4a0',
        yellow: '#f5c31c',
        blue: '#7eb8da',
        magenta: '#c8a0c8',
        cyan: '#88d8d8',
        white: '#f3f4f6',
      },
      scrollback: 1000,
      allowProposedApi: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    (term as unknown as Record<string, unknown>)._fitAddon = fitAddon;

    let inputBuffer = '';
    term.onData((data) => {
      const code = data.charCodeAt(0);
      if (data === '\r' || data === '\n') {
        term.write('\r\n');
        if (inputBuffer.trim()) {
          onCommand(inputBuffer.trim());
        } else {
          term.write('student@lab:~$ ');
        }
        inputBuffer = '';
        inputBufferRef.current = '';
      } else if (code === 127) {
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          inputBufferRef.current = inputBuffer;
          term.write('\b \b');
        }
      } else if (code < 32) {
        // ignore other control chars
      } else {
        inputBuffer += data;
        inputBufferRef.current = inputBuffer;
        term.write(data);
      }
    });

    term.write('student@lab:~$ ');
    termRef.current = term;
  }, [onCommand]);

  const destroy = useCallback(() => {
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
  }, []);

  const write = useCallback((text: string) => {
    termRef.current?.write(text);
  }, []);

  const fit = useCallback(() => {
    const fitAddon = (termRef.current as unknown as Record<string, unknown>)?._fitAddon as FitAddon | undefined;
    if (fitAddon) fitAddon.fit();
  }, []);

  return { termRef, containerRef, init, destroy, write, fit };
}
