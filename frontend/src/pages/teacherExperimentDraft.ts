import type { Check, ContainerSpec, Experiment, ExperimentStatus, Step, TaskConfig, Verification } from '@/types';

export interface AdminDraft {
  experiment_id: string;
  name: string;
  system: string;
  image_name: string;
  objective: string;
  status: ExperimentStatus;
  schema_version: number;
  sort_order?: number;
}

export interface EditorSnapshot {
  draft: AdminDraft;
  stepsText: string;
  containerSpecText: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export type StatusFilter = 'all' | 'draft' | 'published';
export type ExperimentSortMode = 'manual' | 'name' | 'id' | 'status' | 'steps';

export function defaultContainerSpec(): ContainerSpec {
  return {
    base_image: 'openeuler/openeuler:22.03-lts-sp3',
    packages: [],
    pip_packages: [],
    npm_packages: [],
    student_dirs: [],
    student_files: [],
    sources: {
      openeuler_mirror: 'https://repo.huaweicloud.com/openeuler',
      pip_index_url: 'https://pypi.tuna.tsinghua.edu.cn/simple',
      npm_registry: 'https://registry.npmmirror.com',
    },
  };
}

export function normalizeExperimentStatus(status: string | undefined): ExperimentStatus {
  if (status === 'active') return 'published';
  if (status === 'published' || status === 'inactive' || status === 'draft') return status;
  return 'draft';
}

export function statusLabel(status: string | undefined): string {
  const normalized = normalizeExperimentStatus(status);
  if (normalized === 'published') return '已发布';
  if (normalized === 'inactive') return '已删除';
  return '草稿';
}

export function statusBadgeClass(status: string | undefined): string {
  const normalized = normalizeExperimentStatus(status);
  if (normalized === 'published') return 'text-green-700 border-green-200 bg-green-50';
  if (normalized === 'inactive') return 'text-neutral-500 border-neutral-200 bg-neutral-50';
  return 'text-amber-700 border-amber-200 bg-amber-50';
}

export function experimentStepCount(experiment: Experiment): number {
  return experiment.task_config?.steps?.length ?? 0;
}

export function createSnapshotFromExperiment(experiment: Experiment): EditorSnapshot {
  const config: TaskConfig = experiment.task_config ?? { steps: [] };
  return {
    draft: {
      experiment_id: experiment.id,
      name: experiment.name,
      system: experiment.system_type ?? config.system ?? 'openEuler',
      image_name: experiment.image_name ?? config.image_name ?? '',
      objective: config.objective ?? '',
      status: normalizeExperimentStatus(experiment.status),
      schema_version: config.schema_version ?? 2,
      sort_order: experiment.sort_order ?? config.sort_order,
    },
    stepsText: JSON.stringify(normalizeStepsForEditor(config.steps ?? []), null, 2),
    containerSpecText: JSON.stringify(config.container_spec ?? defaultContainerSpec(), null, 2),
  };
}

export function createBlankSnapshot(existingIds: Set<string>): EditorSnapshot {
  return {
    draft: {
      experiment_id: uniqueExperimentId('new-experiment', existingIds),
      name: '未命名实验',
      system: 'openEuler',
      image_name: '',
      objective: '',
      status: 'draft',
      schema_version: 2,
    },
    stepsText: '[]',
    containerSpecText: JSON.stringify(defaultContainerSpec(), null, 2),
  };
}

export function createCopySnapshot(experiment: Experiment, existingIds: Set<string>): EditorSnapshot {
  const source = createSnapshotFromExperiment(experiment);
  const copiedId = uniqueExperimentId(`${experiment.id}-copy`, existingIds);
  return {
    ...source,
    draft: {
      ...source.draft,
      experiment_id: copiedId,
      name: `${experiment.name} 副本`,
      status: 'draft',
      sort_order: undefined,
    },
  };
}

export function editorSnapshotKey(snapshot: EditorSnapshot | null): string {
  if (!snapshot) return '';
  return JSON.stringify(snapshot);
}

export function buildSavePayload(snapshot: EditorSnapshot): Record<string, unknown> {
  return {
    ...snapshot.draft,
    steps: normalizeStepsForEditor(JSON.parse(snapshot.stepsText || '[]')),
    container_spec: JSON.parse(snapshot.containerSpecText || '{}'),
  };
}

export function parseStepsText(stepsText: string): Step[] {
  const parsed = JSON.parse(stepsText || '[]');
  return normalizeStepsForEditor(parsed);
}

export function serializeSteps(steps: Step[]): string {
  return JSON.stringify(normalizeStepsForEditor(steps), null, 2);
}

export function renumberSteps(steps: Step[]): Step[] {
  return normalizeStepsForEditor(steps);
}

export function normalizeStepsForEditor(value: unknown): Step[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((step, index) => normalizeStepForEditor(step, index));
}

function normalizeStepForEditor(raw: Record<string, unknown>, index: number): Step {
  const tryCommands = stringList(raw.try_commands);
  return {
    id: index + 1,
    title: stringValue(raw.title, `步骤${index + 1}`),
    goal: stringValue(raw.goal),
    instructions: stringValue(raw.instructions || raw.hint),
    try_commands: tryCommands,
    success_criteria: stringValue(raw.success_criteria || raw.success_hint),
    coach_focus: stringValue(raw.coach_focus),
    verification: normalizeVerification(raw.verification, raw.verify, tryCommands),
  };
}

function normalizeVerification(verification: unknown, legacyVerify: unknown, tryCommands: string[]): Verification {
  if (isRecord(verification)) {
    const rawChecks = Array.isArray(verification.checks) ? verification.checks : [];
    const checks = rawChecks.filter(isRecord).map(normalizeCheck).filter(isUsefulCheck);
    return {
      mode: stringValue(verification.mode, 'all'),
      checks: checks.length ? checks : defaultCommandChecks(tryCommands),
    };
  }
  if (isRecord(legacyVerify)) {
    const checks = [];
    const sequence = stringList(legacyVerify.sequence);
    const commands = stringList(legacyVerify.commands);
    if (sequence.length) checks.push({ type: 'command_sequence', sequence });
    if (commands.length) checks.push({ type: 'command_match', commands });
    return { mode: 'all', checks: checks.length ? checks : defaultCommandChecks(tryCommands) };
  }
  return { mode: 'all', checks: defaultCommandChecks(tryCommands) };
}

function normalizeCheck(raw: Record<string, unknown>): Check {
  const type = stringValue(raw.type);
  if (type === 'command_match') {
    const check: Check = {
      type,
      commands: stringList(raw.commands || raw.command),
    };
    if ('require_success' in raw) check.require_success = Boolean(raw.require_success);
    return check;
  }
  if (type === 'command_sequence') return { type, sequence: stringList(raw.sequence) };
  if (type === 'command_set') {
    const check: Check = { type, commands: stringList(raw.commands || raw.command) };
    if ('mode' in raw) check.mode = stringValue(raw.mode, 'all');
    if ('require_success' in raw) check.require_success = Boolean(raw.require_success);
    return check;
  }
  if (type === 'path_exists') {
    const check: Check = { type, path: stringValue(raw.path) };
    if (raw.path_type) check.path_type = stringValue(raw.path_type);
    return check;
  }
  if (type === 'path_absent') return { type, path: stringValue(raw.path) };
  if (type === 'exec_exit_code') {
    return { type, command: stringValue(raw.command), exit_code: Number(raw.exit_code ?? 0) || 0 };
  }
  if (type === 'exec_output_contains') {
    return { type, command: stringValue(raw.command), contains: stringList(raw.contains) };
  }
  if (type === 'file_contains') {
    return { type, path: stringValue(raw.path), text: stringValue(raw.text) };
  }
  return { type };
}

function isUsefulCheck(check: Check): boolean {
  if (check.type === 'command_match') return Boolean(check.commands?.length);
  if (check.type === 'command_sequence') return Boolean(check.sequence?.length);
  if (check.type === 'command_set') return Boolean(check.commands?.length);
  if (check.type === 'path_exists' || check.type === 'path_absent') return Boolean(check.path);
  if (check.type === 'exec_exit_code') return Boolean(check.command);
  if (check.type === 'exec_output_contains') return Boolean(check.command && check.contains?.length);
  if (check.type === 'file_contains') return Boolean(check.path && check.text);
  return false;
}

function defaultCommandChecks(tryCommands: string[]): Check[] {
  return tryCommands.length ? [{ type: 'command_match', commands: tryCommands }] : [];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const text = stringValue(value);
    return text ? [text] : [];
  }
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function commandLinesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function commandListToLines(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => String(item)).join('\n') : '';
}

export function validateSnapshot(snapshot: EditorSnapshot, mode: 'save' | 'publish'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const draft = snapshot.draft;

  if (!draft.experiment_id.trim()) errors.push('实验 ID 不能为空。');
  if (!/^[a-zA-Z0-9_-]+$/.test(draft.experiment_id.trim())) {
    errors.push('实验 ID 只能包含字母、数字、短横线和下划线。');
  }
  if (!draft.name.trim()) errors.push('实验名称不能为空。');
  if (!draft.system.trim()) errors.push('系统类型不能为空。');

  let steps: Step[] = [];
  try {
    const parsedSteps = JSON.parse(snapshot.stepsText || '[]');
    if (!Array.isArray(parsedSteps)) {
      errors.push('步骤配置必须是 JSON 数组。');
    } else {
      steps = parsedSteps as Step[];
    }
  } catch (error) {
    errors.push(`步骤 JSON 格式错误：${error instanceof Error ? error.message : '无法解析'}`);
  }

  try {
    const parsedContainerSpec = JSON.parse(snapshot.containerSpecText || '{}');
    if (!parsedContainerSpec || typeof parsedContainerSpec !== 'object' || Array.isArray(parsedContainerSpec)) {
      errors.push('容器配置必须是 JSON 对象。');
    }
  } catch (error) {
    errors.push(`容器配置 JSON 格式错误：${error instanceof Error ? error.message : '无法解析'}`);
  }

  const seenStepIds = new Set<number>();
  steps.forEach((step, index) => {
    const label = `第 ${index + 1} 个步骤`;
    if (typeof step.id !== 'number') {
      errors.push(`${label} 缺少数字 id。`);
    } else if (seenStepIds.has(step.id)) {
      errors.push(`${label} 的 id ${step.id} 重复。`);
    } else {
      seenStepIds.add(step.id);
    }
    if (!String(step.title ?? '').trim()) errors.push(`${label} 缺少标题。`);
    if (!String(step.goal || step.instructions || step.success_criteria || '').trim()) {
      warnings.push(`${label} 建议补充目标、操作说明或成功标准。`);
    }
    const checks = step.verification?.checks ?? [];
    if (!checks.length) {
      warnings.push(`${label} 未配置自动验证规则，学生可能只能依赖教师人工确认。`);
    }
    checks.forEach((check, checkIndex) => {
      if (check.type === 'command_match' && (check.commands?.length ?? 0) > 1) {
        warnings.push(
          `${label} 的第 ${checkIndex + 1} 个 command_match 中多个 commands 表示“任一命令即可”，如需全部执行请使用 command_set 或 command_sequence。`
        );
      }
    });
  });

  if (mode === 'publish') {
    if (!draft.image_name.trim()) errors.push('发布实验前必须填写 Docker 镜像。');
    if (steps.length === 0) errors.push('发布实验前至少需要一个步骤。');
  }

  return { errors, warnings };
}

export function matchesExperimentSearch(experiment: Experiment, query: string): boolean {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return [experiment.id, experiment.name, experiment.image_name]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword));
}

export function matchesStatusFilter(experiment: Experiment, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return normalizeExperimentStatus(experiment.status) === filter;
}

export function sortExperiments(experiments: Experiment[], sortMode: ExperimentSortMode): Experiment[] {
  return [...experiments].sort((a, b) => {
    if (sortMode === 'manual') {
      return experimentSortOrder(a) - experimentSortOrder(b) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    }
    if (sortMode === 'steps') {
      return experimentStepCount(b) - experimentStepCount(a) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    }
    if (sortMode === 'status') {
      return statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    }
    if (sortMode === 'id') {
      return a.id.localeCompare(b.id, 'en');
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN') || a.id.localeCompare(b.id, 'en');
  });
}

function experimentSortOrder(experiment: Experiment): number {
  const value = experiment.sort_order ?? experiment.task_config?.sort_order;
  return Number.isFinite(Number(value)) ? Number(value) : 1_000_000;
}

function statusRank(status: string | undefined): number {
  const normalized = normalizeExperimentStatus(status);
  if (normalized === 'draft') return 0;
  if (normalized === 'published') return 1;
  return 2;
}

function uniqueExperimentId(base: string, existingIds: Set<string>): string {
  const cleanBase = slugify(base) || 'new-experiment';
  if (!existingIds.has(cleanBase)) return cleanBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${cleanBase}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${cleanBase}-${Date.now()}`;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
