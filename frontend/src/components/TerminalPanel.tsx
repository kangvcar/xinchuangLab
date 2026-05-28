import { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, FileText, Play, RefreshCcw, Square, Terminal, Loader2, Download } from 'lucide-react';
import { motion } from 'motion/react';
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
    <section className="min-w-0 min-h-0 h-full overflow-hidden rounded-xl bg-dark flex flex-col shadow-lg shadow-slate-900/20 border border-slate-800">
      {/* Header - Dark themed to blend with terminal */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-slate-700/80 bg-dark/95 shrink-0">
        {activeSession ? (
          <div className="inline-flex items-center gap-2.5 min-w-0">
            <span className="text-white font-bold text-sm truncate max-w-[280px]">
              {selectedExperimentName ?? 'Linux 实验'}
            </span>
            <span className="h-5 inline-flex items-center rounded-md px-2 text-slate-400 bg-slate-800/80 text-[10px] font-semibold border border-slate-700/60">
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
              className="h-8 inline-flex items-center gap-1.5 text-slate-300 bg-slate-800 rounded-lg px-3 text-xs font-medium border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600 active:bg-slate-800 transition-all no-underline"
            >
              <ExternalLink size={13} />
              新窗口
            </a>
          )}
          <button
            onClick={onStopSession}
            disabled={!activeSession || busy}
            className="h-8 inline-flex items-center gap-1.5 text-red-400 bg-slate-800 rounded-lg px-3 text-xs font-medium border border-red-900/40 hover:bg-red-950/40 hover:border-red-800/60 hover:text-red-300 active:bg-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Square size={12} />
            停止
          </button>
          <button
            onClick={onResetSession}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600 active:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="重置实验"
          >
            <RefreshCcw size={13} />
          </button>
          <button
            onClick={onGenerateReport}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600 active:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="生成报告"
          >
            <FileText size={13} />
          </button>
          <button
            onClick={onExportDocx}
            disabled={!activeSession || busy}
            className="h-8 w-8 inline-flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600 active:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="导出 Word 报告"
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-2 bg-dark">
        {hasTerminalFrame ? (
          <div className="relative w-full h-full rounded-lg overflow-hidden bg-dark">
            <iframe
              key={terminalFrameKey}
              className="w-full h-full border-0"
              src={activeSession!.terminal_url}
              title="openEuler terminal"
              onLoad={handleFrameLoad}
            />
            {terminalFrameFailed && !terminalFrameLoaded && (
              <div className="absolute left-4 right-4 bottom-4 max-w-[560px] p-4 border border-slate-700 rounded-xl bg-slate-900/95 text-slate-300 shadow-xl backdrop-blur-sm">
                <strong className="block text-white font-bold text-sm mb-1">终端还没有连上</strong>
                <span className="block text-slate-500 text-xs font-medium break-all mb-3">
                  {activeSession!.terminal_url}
                </span>
                <a
                  href={activeSession!.terminal_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-brand-400 font-semibold text-xs no-underline hover:text-brand-300 transition-colors"
                >
                  <ExternalLink size={12} />
                  在新窗口打开终端
                </a>
              </div>
            )}
          </div>
        ) : activeSession ? (
          <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden bg-dark" />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full rounded-lg flex flex-col items-center justify-center gap-3.5 text-slate-400 text-center bg-dark"
          >
            <div className="w-16 h-16 grid place-items-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-500/20 text-brand-400 border border-brand-500/10">
              <Terminal size={28} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-200">Linux 实验终端</h1>
              <p className="text-xs text-slate-500 mt-1">真实 openEuler 环境，零配置即刻使用</p>
            </div>
            <button
              onClick={onStartSession}
              disabled={busy}
              className="h-10 inline-flex items-center justify-center gap-1.5 px-6 rounded-lg font-semibold text-xs tracking-wide text-white bg-gradient-to-r from-brand-500 to-brand-600 border border-transparent hover:from-brand-600 hover:to-brand-700 hover:shadow-lg hover:shadow-brand-500/25 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {busy ? '正在启动...' : '开始实验'}
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}
