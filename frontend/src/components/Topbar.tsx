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
    <header className="h-14 flex items-center gap-4 px-4 bg-[#181925] shrink-0">
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2.5 shrink-0 no-underline">
        <LogoIcon variant="light" size={32} />
        <strong className="text-white text-sm font-semibold whitespace-nowrap hidden lg:block">
          信创Linux AI
        </strong>
      </Link>

      {/* Divider */}
      <div className="w-px h-4 bg-white/20 shrink-0" />

      {/* Experiment Selector */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white/50 text-xs font-medium shrink-0">实验</span>
        <Select.Root
          value={selectedExperimentId}
          onValueChange={(value) => onSelectExperiment(value as string)}
        >
          <Select.Trigger
            disabled={busy}
            className="h-8 min-w-[160px] max-w-[300px] px-3 pr-7 rounded-full border border-white/20 text-white bg-white/10 text-xs font-medium relative focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/15 transition-colors"
          >
            <Select.Value className="block truncate">{selectedExperimentName}</Select.Value>
            <Select.Icon className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner className="z-50" sideOffset={6}>
              <Select.Popup className="min-w-[var(--anchor-width)] rounded-xl border border-white/10 bg-[#181925] shadow-xl py-1 focus:outline-none origin-[var(--transform-origin)] transition-all data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0">
                <Select.List>
                  {experiments.map((exp) => (
                    <Select.Item
                      key={exp.id}
                      value={exp.id}
                      className="px-3 py-2 text-xs font-medium text-white/70 cursor-default outline-none select-none flex items-center justify-between data-highlighted:bg-white/10 data-highlighted:text-white data-selected:text-white"
                    >
                      <Select.ItemText>{exp.name}</Select.ItemText>
                      <Select.ItemIndicator className="text-[#9580ff] ml-2">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
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
      <div className="flex items-center gap-2 ml-auto">
        {/* Student ID */}
        <span className="inline-flex items-center gap-1.5 text-white/70 text-xs font-medium px-3 py-1.5 rounded-full border border-white/20 bg-white/10">
          <UserRound size={12} />
          {studentId}
        </span>

        {/* Timer */}
        {activeSession && (
          <span className="inline-flex items-center gap-1.5 text-white/70 text-xs font-medium px-3 py-1.5 rounded-full border border-white/20 bg-white/10">
            <Clock3 size={12} />
            {timerText}
          </span>
        )}

        {/* Divider */}
        <div className="w-px h-4 bg-white/20" />

        {/* Start */}
        <button
          onClick={onStartSession}
          disabled={Boolean(activeSession) || busy}
          className="h-8 inline-flex items-center gap-1.5 px-4 rounded-full text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
            bg-[#9580ff] text-white hover:bg-[#9580ff]/90
            data-[active=true]:bg-white/10 data-[active=true]:text-white/70 data-[active=true]:border data-[active=true]:border-white/20 data-[active=true]:cursor-default"
          data-active={Boolean(activeSession)}
        >
          {busy && !activeSession ? (
            <Loader2 size={12} className="animate-spin" />
          ) : activeSession ? (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          ) : (
            <Play size={12} />
          )}
          {activeSession ? '运行中' : busy ? '启动中...' : '开始实验'}
        </button>

        {/* Teacher link */}
        <Link
          to="/teacher"
          className="h-8 inline-flex items-center px-3 rounded-full text-xs font-medium border border-white/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors no-underline"
        >
          教师端
        </Link>

        {/* Logout */}
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          title="退出登录"
          className="h-8 w-8 grid place-items-center rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={13} />
        </button>
      </div>
    </header>
  );
}
