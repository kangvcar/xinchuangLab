import { Copy, FilePlus2, Search, Trash2 } from 'lucide-react';
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
  canCopySelected: boolean;
  canDeactivateSelected: boolean;
  disabled?: boolean;
}

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
];

const SORT_OPTIONS: Array<{ value: ExperimentSortMode; label: string }> = [
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
  canCopySelected,
  canDeactivateSelected,
  disabled = false,
}: ExperimentSidebarProps) {
  const visibleExperiments = sortExperiments(
    experiments.filter(
      (experiment) => matchesExperimentSearch(experiment, searchQuery) && matchesStatusFilter(experiment, statusFilter)
    ),
    sortMode
  );

  return (
    <aside className="w-full lg:w-[320px] shrink-0 border-r border-neutral-200 bg-neutral-50/60 flex flex-col min-h-0">
      <div className="p-4 border-b border-neutral-200 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3">
          <strong className="text-sm font-semibold text-neutral-900">实验库</strong>
          <span className="text-xs font-medium text-neutral-500">{experiments.length} 个实验</span>
        </div>
        <label className="relative block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索名称、ID、镜像"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900"
          />
        </label>
        <div className="grid grid-cols-3 gap-1 mt-3">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onStatusFilterChange(item.value)}
              className={`h-8 rounded-md text-xs font-medium border transition-colors ${
                statusFilter === item.value
                  ? 'bg-neutral-900 border-neutral-900 text-white'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-neutral-900">排序</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as ExperimentSortMode)}
            className="h-8 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900"
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
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FilePlus2 size={13} />
            新建
          </button>
          <button
            type="button"
            onClick={onCopySelected}
            disabled={disabled || !canCopySelected}
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy size={13} />
            复制
          </button>
          <button
            type="button"
            onClick={onDeactivateSelected}
            disabled={disabled || !canDeactivateSelected}
            title="删除实验入口，历史记录会保留"
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={13} />
            删除
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2">
        {visibleExperiments.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-neutral-500">没有匹配的实验</div>
        ) : (
          <div className="space-y-1.5">
            {visibleExperiments.map((experiment) => {
              const selected = experiment.id === selectedExperimentId;
              const normalizedStatus = normalizeExperimentStatus(experiment.status);
              return (
                <button
                  key={experiment.id}
                  type="button"
                  onClick={() => onSelect(experiment.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selected
                      ? 'bg-white border-neutral-900 shadow-sm'
                      : 'bg-white border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  } ${normalizedStatus === 'inactive' ? 'opacity-75' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm font-semibold text-neutral-900 leading-snug">{experiment.name}</strong>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${statusBadgeClass(experiment.status)}`}>
                      {statusLabel(experiment.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500 font-mono truncate">{experiment.id}</div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                    <span>{experimentStepCount(experiment)} 个步骤</span>
                    <span className="truncate">{experiment.image_name || '未设置镜像'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
