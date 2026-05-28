import { ArrowDown, ArrowUp, Copy, FilePlus2, Search, Trash2 } from 'lucide-react';
import type { Experiment } from '@/types';
import type { ExperimentSortMode, StatusFilter } from '@/pages/teacherExperimentDraft';
import {
  experimentStepCount,
  matchesExperimentSearch,
  matchesStatusFilter,
  normalizeExperimentStatus,
  sortExperiments,
  statusBadgeClass,
  statusLabel,
} from '@/pages/teacherExperimentDraft';

interface ExperimentSidebarProps {
  experiments: Experiment[];
  selectedExperimentId: string;
  searchQuery: string;
  statusFilter: StatusFilter;
  sortMode: ExperimentSortMode;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onSortModeChange: (value: ExperimentSortMode) => void;
  onSelect: (experimentId: string) => void;
  onCreateBlank: () => void;
  onCopySelected: () => void;
  onDeactivateSelected: () => void;
  onMoveExperiment: (experimentId: string, direction: -1 | 1) => void;
  canCopySelected: boolean;
  canDeactivateSelected: boolean;
  disabled?: boolean;
  hideHeader?: boolean;
}

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
];

const SORT_OPTIONS: Array<{ value: ExperimentSortMode; label: string }> = [
  { value: 'manual', label: '学生端顺序' },
  { value: 'name', label: '按名称' },
  { value: 'id', label: '按ID' },
  { value: 'status', label: '按状态' },
  { value: 'steps', label: '按步骤数' },
];

export default function ExperimentSidebar({
  experiments,
  selectedExperimentId,
  searchQuery,
  statusFilter,
  sortMode,
  onSearchChange,
  onStatusFilterChange,
  onSortModeChange,
  onSelect,
  onCreateBlank,
  onCopySelected,
  onDeactivateSelected,
  onMoveExperiment,
  canCopySelected,
  canDeactivateSelected,
  disabled = false,
  hideHeader = false,
}: ExperimentSidebarProps) {
  const visibleExperiments = sortExperiments(
    experiments.filter(
      (experiment) => matchesExperimentSearch(experiment, searchQuery) && matchesStatusFilter(experiment, statusFilter)
    ),
    sortMode
  );

  return (
    <aside className="w-full lg:w-[320px] shrink-0 border-r border-slate-200/80 bg-slate-50/80 flex flex-col min-h-0">
      {!hideHeader && (
      <div className="p-4 border-b border-slate-200/80 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <strong className="text-sm font-bold text-dark">实验库</strong>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{experiments.length} 个实验</span>
        </div>
        <label className="relative block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索名称、ID、镜像"
            className="w-full h-9 pl-8 pr-3 rounded-xl border-0 bg-slate-50 text-sm text-dark outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white placeholder:text-slate-400"
          />
        </label>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onStatusFilterChange(item.value)}
              className={`h-8 rounded-lg text-xs font-semibold border transition-all ${
                statusFilter === item.value
                  ? 'bg-dark border-dark text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2">
          <span className="shrink-0 text-xs font-bold text-dark">排序</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as ExperimentSortMode)}
            className="h-8 min-w-0 flex-1 rounded-lg border-0 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 outline-none ring-1 ring-slate-200 transition-all hover:ring-slate-300 focus:ring-2 focus:ring-brand-400 focus:bg-white"
          >
            {SORT_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            type="button"
            onClick={onCreateBlank}
            disabled={disabled}
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <FilePlus2 size={13} className="text-brand-500" />
            新建
          </button>
          <button
            type="button"
            onClick={onCopySelected}
            disabled={disabled || !canCopySelected}
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Copy size={13} className="text-accent-500" />
            复制
          </button>
          <button
            type="button"
            onClick={onDeactivateSelected}
            disabled={disabled || !canDeactivateSelected}
            title="删除实验入口，历史记录会保留"
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <Trash2 size={13} />
            删除
          </button>
        </div>
      </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visibleExperiments.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-slate-400">
            <Search size={20} className="mx-auto mb-2 text-slate-300" />
            没有匹配的实验
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleExperiments.map((experiment) => {
              const selected = experiment.id === selectedExperimentId;
              const normalizedStatus = normalizeExperimentStatus(experiment.status);
              const manualSort = sortMode === 'manual';
              return (
                <div
                  key={experiment.id}
                  className={`rounded-xl border transition-all duration-200 relative overflow-hidden ${
                    selected
                      ? 'bg-white border-brand-300 shadow-md shadow-brand-100/30'
                      : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm hover:shadow-slate-100/50'
                  } ${normalizedStatus === 'inactive' ? 'opacity-60' : ''}`}
                >
                  {/* Selected indicator */}
                  {selected && (
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
                  )}
                  <button type="button" onClick={() => onSelect(experiment.id)} className="w-full text-left px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm font-bold text-dark leading-snug">{experiment.name}</strong>
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${statusBadgeClass(experiment.status)}`}>
                        {statusLabel(experiment.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 font-mono truncate">{experiment.id}</div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium">
                      <span className="bg-slate-50 px-1.5 py-0.5 rounded text-slate-500">{experimentStepCount(experiment)} 个步骤</span>
                      <span className="truncate text-slate-400">{experiment.image_name || '未设置镜像'}</span>
                    </div>
                  </button>
                  <div className="mx-3 flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-[11px] text-slate-400">
                    <span className="text-slate-400">{manualSort ? '可调整顺序' : '按当前排序显示'}</span>
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMoveExperiment(experiment.id, -1);
                        }}
                        disabled={disabled || !manualSort}
                        title="上移"
                        className="grid h-6 w-6 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-dark disabled:cursor-not-allowed disabled:opacity-30 transition-all shadow-sm"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMoveExperiment(experiment.id, 1);
                        }}
                        disabled={disabled || !manualSort}
                        title="下移"
                        className="grid h-6 w-6 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-dark disabled:cursor-not-allowed disabled:opacity-30 transition-all shadow-sm"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
