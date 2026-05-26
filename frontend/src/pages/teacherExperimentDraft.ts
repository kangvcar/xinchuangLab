import type { ContainerSpec, Experiment, ExperimentStatus, Step, TaskConfig } from '@/types';

export interface AdminDraft {
  experiment_id: string;
  name: string;
  system: string;
  image_name: string;
  objective: string;
  status: ExperimentStatus;
  schema_version: number;
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

export type StatusFilter = 'all' | 'draft' | 'published' | 'inactive';

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
  if (normalized === 'inactive') return '已停用';
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
    },
    stepsText: JSON.stringify(config.steps ?? [], null, 2),
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
    steps: JSON.parse(snapshot.stepsText || '[]'),
    container_spec: JSON.parse(snapshot.containerSpecText || '{}'),
  };
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
    if (!String(step.goal ?? step.instructions ?? step.success_criteria ?? '').trim()) {
      warnings.push(`${label} 建议补充目标、操作说明或成功标准。`);
    }
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
