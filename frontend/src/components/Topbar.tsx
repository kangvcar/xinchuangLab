import { Clock3, FlaskConical, LogOut, Play, Loader2, UserRound } from 'lucide-react';
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
    <header className="h-14 flex items-center gap-6 px-6 bg-white border-b border-neutral-200 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-[178px]">
        <div className="w-8 h-8 grid place-items-center rounded-md text-white bg-neutral-900">
          <FlaskConical size={18} />
        </div>
        <strong className="text-neutral-900 text-sm font-semibold whitespace-nowrap">
          信创Linux AI 陪练实训平台
        </strong>
      </div>

      {/* Experiment Selector */}
      <div className="flex items-center gap-2.5 min-w-[280px]">
        <span className="text-neutral-500 text-xs font-medium">实验模块</span>
        <Select.Root
          value={selectedExperimentId}
          onValueChange={(value) => onSelectExperiment(value as string)}
        >
          <Select.Trigger
            disabled={busy}
            className="h-9 min-w-[200px] max-w-[360px] px-3 pr-8 rounded-md border border-neutral-200 text-neutral-900 bg-white text-sm font-medium relative focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
          >
            <Select.Value className="block truncate">{selectedExperimentName}</Select.Value>
            <Select.Icon className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-50" sideOffset={4}>
              <Select.Popup className="min-w-[var(--anchor-width)] rounded-md border border-neutral-200 bg-white shadow-lg py-1 focus:outline-none origin-[var(--transform-origin)] transition-all data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
                <Select.List>
                  {experiments.map((exp) => (
                    <Select.Item
                      key={exp.id}
                      value={exp.id}
                      className="px-3 py-2 text-sm font-medium text-neutral-700 cursor-default outline-none select-none flex items-center justify-between data-highlighted:bg-neutral-900 data-highlighted:text-white data-selected:text-neutral-900"
                    >
                      <Select.ItemText>{exp.name}</Select.ItemText>
                      <Select.ItemIndicator className="text-neutral-900 ml-2">
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
      <div className="flex items-center gap-3 ml-auto">
        <span className="inline-flex items-center gap-1.5 text-neutral-600 font-medium text-xs bg-neutral-50 px-3 py-1.5 rounded-md border border-neutral-200">
          <UserRound size={13} />
          {studentId}
        </span>

        {activeSession && (
          <span className="inline-flex items-center gap-1.5 text-neutral-500 font-medium text-xs bg-neutral-50 px-3 py-1.5 rounded-md border border-neutral-200">
            <Clock3 size={13} />
            {timerText}
          </span>
        )}

        <button
          onClick={onStartSession}
          disabled={Boolean(activeSession) || busy}
          className="h-9 inline-flex items-center gap-1.5 px-4 rounded-md font-medium text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100
            data-[active=true]:bg-green-50 data-[active=true]:text-green-700 data-[active=true]:border-green-200 data-[active=true]:cursor-default"
          data-active={Boolean(activeSession)}
        >
          {busy && !activeSession ? (
            <Loader2 size={13} className="animate-spin" />
          ) : activeSession ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          ) : (
            <Play size={13} />
          )}
          {activeSession ? '运行中' : busy ? '启动中...' : '开始实验'}
        </button>

        <Link
          to="/teacher"
          className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md font-medium text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors no-underline"
        >
          教师端
        </Link>
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          title="退出登录"
          className="h-9 w-9 grid place-items-center rounded-md font-medium text-xs border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 hover:border-neutral-300 active:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
