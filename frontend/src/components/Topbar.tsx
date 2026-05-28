import { Clock3, LogOut, Play, Loader2, UserRound } from 'lucide-react';
import LogoIcon from '@/components/LogoIcon';
import { Select } from '@base-ui/react/select';
import { Link } from 'react-router-dom';
import type { Experiment, LabSession } from '@/types';

interface TopbarProps {
  experiments: Experiment[];
  selectedExperimentId: string;
  onSelectExperiment: (id: string) => void;
  activeSession: LabSession | null;
  remainingSeconds: number;
  onStartSession: () => void;
  studentId: string;
  onLogout: () => void;
  busy: boolean;
}

export default function Topbar({
  experiments,
  selectedExperimentId,
  onSelectExperiment,
  activeSession,
  remainingSeconds,
  onStartSession,
  studentId,
  onLogout,
  busy,
}: TopbarProps) {
  const timerText = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const selectedExperimentName =
    experiments.find((exp) => exp.id === selectedExperimentId)?.name ?? selectedExperimentId;

  return (
    <header className="h-14 flex items-center gap-3 sm:gap-6 px-3 sm:px-6 bg-white border-b border-slate-200/80 shrink-0 shadow-sm shadow-slate-100/50">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <LogoIcon variant="dark" size={32} />
        <strong className="hidden sm:block text-dark text-sm font-semibold whitespace-nowrap tracking-tight">
          信创Linux AI实时陪练实训平台
        </strong>
      </div>

      {/* Experiment Selector */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none sm:min-w-[200px]">
        <span className="hidden sm:block text-slate-400 text-xs font-medium shrink-0">实验模块</span>
        <Select.Root
          value={selectedExperimentId}
          onValueChange={(value) => onSelectExperiment(value as string)}
        >
          <Select.Trigger
            disabled={busy}
            className="h-9 w-full sm:w-auto sm:min-w-[180px] sm:max-w-[280px] lg:min-w-[200px] lg:max-w-[360px] px-3 pr-8 rounded-lg border border-slate-200 text-dark bg-white text-sm font-medium relative focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-300 hover:bg-slate-50/50 transition-all shadow-sm"
          >
            <Select.Value className="block truncate">{selectedExperimentName}</Select.Value>
            <Select.Icon className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-50" sideOffset={4}>
              <Select.Popup className="min-w-[var(--anchor-width)] rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 py-1.5 focus:outline-none origin-[var(--transform-origin)] transition-all data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
                <Select.List>
                  {experiments.map((exp) => (
                    <Select.Item
                      key={exp.id}
                      value={exp.id}
                      className="px-3 py-2 text-sm font-medium text-slate-700 cursor-default outline-none select-none flex items-center justify-between data-highlighted:bg-brand-500 data-highlighted:text-white data-selected:text-dark rounded-lg mx-1"
                    >
                      <Select.ItemText>{exp.name}</Select.ItemText>
                      <Select.ItemIndicator className="text-brand-500 ml-2 data-highlighted:text-white">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
        <span className="hidden md:inline-flex items-center gap-1.5 text-slate-600 font-medium text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
          <UserRound size={13} className="text-brand-500" />
          {studentId}
        </span>

        {activeSession && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-500 font-medium text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
            <Clock3 size={13} className="text-accent-500" />
            {timerText}
          </span>
        )}

        <button
          onClick={onStartSession}
          disabled={Boolean(activeSession) || busy}
          className="h-9 inline-flex items-center gap-1.5 px-3 sm:px-4 rounded-lg font-medium text-xs border transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm
            bg-gradient-to-r from-brand-500 to-brand-600 text-white border-transparent hover:from-brand-600 hover:to-brand-700 hover:shadow-md hover:shadow-brand-500/20 hover:-translate-y-px active:translate-y-0
            data-[active=true]:bg-white data-[active=true]:text-emerald-700 data-[active=true]:border-emerald-200 data-[active=true]:cursor-default data-[active=true]:from-white data-[active=true]:to-white data-[active=true]:hover:translate-y-0"
          data-active={Boolean(activeSession)}
        >
          {busy && !activeSession ? (
            <Loader2 size={13} className="animate-spin" />
          ) : activeSession ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <Play size={13} />
          )}
          <span className="hidden sm:inline">{activeSession ? '运行中' : busy ? '启动中...' : '开始实验'}</span>
          <span className="sm:hidden">{activeSession ? '运行' : busy ? '...' : '开始'}</span>
        </button>

        <Link
          to="/teacher"
          className="hidden sm:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg font-medium text-xs border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-dark hover:border-slate-300 active:bg-slate-100 transition-all no-underline shadow-sm"
        >
          教师端
        </Link>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          title="退出登录"
          className="h-9 w-9 grid place-items-center rounded-lg font-medium text-xs border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-red-600 hover:border-red-200 active:bg-slate-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
