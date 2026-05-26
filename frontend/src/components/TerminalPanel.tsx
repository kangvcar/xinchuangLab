import { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, FileText, Play, RefreshCcw, Square, Terminal, Loader2, Download } from 'lucide-react';
import { useXterm } from '@/hooks/useXterm';
import type { LabSession } from '@/types';

interface TerminalPanelProps {
  activeSession: LabSession | null;
  selectedExperimentName?: string;
  runtimeLabel: string;
  hasTerminalFrame: boolean;
  onStartSession: () => void;
  onStopSession: () => void;
  onResetSession: () => void;
  onGenerateReport: () => void;
  onExportDocx: () => void;
  onSendMockCommand: (cmd: string) => void;
  busy: boolean;
}

export default function TerminalPanel({
  activeSession,
  selectedExperimentName,
  runtimeLabel,
  hasTerminalFrame,
  onStartSession,
  onStopSession,
  onResetSession,
  onGenerateReport,
  onExportDocx,
  onSendMockCommand,
  busy,
}: TerminalPanelProps) {
  const [terminalFrameKey, setTerminalFrameKey] = useState(0);
  const [terminalFrameLoaded, setTerminalFrameLoaded] = useState(false);
  const [terminalFrameFailed, setTerminalFrameFailed] = useState(false);
  const frameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { containerRef, init, destroy, write, fit } = useXterm(onSendMockCommand);

  useEffect(() => {
    if (activeSession?.terminal_url) {
      destroy();
      setTerminalFrameLoaded(false);
      setTerminalFrameFailed(false);
      setTerminalFrameKey((k) => k + 1);
      frameTimerRef.current = setTimeout(() => {
        setTerminalFrameFailed(true);
      }, 5000);
    } else if (activeSession) {
      clearFrameTimer();
      const timer = setTimeout(() => init(), 50);
      return () => clearTimeout(timer);
    } else {
      clearFrameTimer();
      destroy();
    }
  }, [activeSession]);

  const clearFrameTimer = useCallback(() => {
    if (frameTimerRef.current) {
      clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
    }
  }, []);

  const handleFrameLoad = useCallback(() => {
    setTerminalFrameLoaded(true);
    setTerminalFrameFailed(false);
    clearFrameTimer();
  }, [clearFrameTimer]);

  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  return (
    <section className="min-w-0 min-h-0 overflow-hidden border border-neutral-200 rounded-lg bg-neutral-900 flex flex-col">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-neutral-700 bg-white shrink-0">
        {activeSession ? (
          <div className="inline-flex items-center gap-2 min-w-0">
            <span className="text-neutral-900 font-semibold text-sm truncate max-w-[280px]">
              {selectedExperimentName ?? 'Linux 实验'}
            </span>
            <span className="h-5 inline-flex items-center rounded-md px-2 text-neutral-500 bg-neutral-50 text-[10px] font-semibold border border-neutral-200">
              {runtimeLabel}
            </span>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          {activeSession?.terminal_url && (
            <a
              href={activeSession.terminal_url}
              target="_blank"
              rel="noreferrer"
              className="h-8 inline-flex items-center gap-1.5 text-neutral-600 bg-white rounded-md px-3 text-xs font-medium border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors no-underline"
            >
              <ExternalLink size={13} />
              新窗口
            </a>
          )}
          <button
            onClick={onStopSession}
            disabled={!activeSession || busy}
            className="h-8 inline-flex items-center gap-1.5 text-red-600 bg-white rounded-md px-3 text-xs font-medium border border-red-200 hover:bg-red-50 hover:border-red-300 active:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Square size={12} />
            停止
          </button>
          <button
            onClick={onResetSession}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 bg-white rounded-md border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="重置实验"
          >
            <RefreshCcw size={13} />
          </button>
          <button
            onClick={onGenerateReport}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 bg-white rounded-md border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="生成报告"
          >
            <FileText size={13} />
          </button>
          <button
            onClick={onExportDocx}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-neutral-600 bg-white rounded-md border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="导出 Word 报告"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-2 bg-neutral-900">
        {hasTerminalFrame ? (
          <div className="relative w-full h-full rounded-md overflow-hidden bg-neutral-900">
            <iframe
              key={terminalFrameKey}
              className="w-full h-full border-0"
              src={activeSession!.terminal_url}
              title="openEuler terminal"
              onLoad={handleFrameLoad}
            />
            {terminalFrameFailed && !terminalFrameLoaded && (
              <div className="absolute left-4 right-4 bottom-4 max-w-[560px] p-3 border border-neutral-200 rounded-md bg-white text-neutral-700 shadow-lg">
                <strong className="block text-neutral-900 font-semibold text-sm mb-1">终端还没有连上</strong>
                <span className="block text-neutral-500 text-xs font-medium break-all mb-2">
                  {activeSession!.terminal_url}
                </span>
                <a
                  href={activeSession!.terminal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-neutral-900 font-semibold text-xs no-underline hover:underline"
                >
                  <ExternalLink size={12} />
                  在新窗口打开终端
                </a>
              </div>
            )}
          </div>
        ) : activeSession ? (
          <div ref={containerRef} className="w-full h-full rounded-md overflow-hidden bg-neutral-900" />
        ) : (
          <div className="w-full h-full rounded-md flex flex-col items-center justify-center gap-3 text-neutral-300 text-center bg-neutral-900">
            <div className="w-12 h-12 grid place-items-center rounded-lg bg-neutral-800 text-neutral-400">
              <Terminal size={24} />
            </div>
            <h1 className="text-base font-semibold text-neutral-200">Linux 实验终端</h1>
            <button
              onClick={onStartSession}
              disabled={busy}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-5 rounded-md font-medium text-xs tracking-wide text-white bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 active:bg-neutral-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {busy ? '正在启动...' : '开始实验'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
