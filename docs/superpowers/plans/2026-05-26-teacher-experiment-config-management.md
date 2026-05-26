# Teacher Experiment Config Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the teacher page into an experiment configuration workbench with a left experiment library, create/copy/deactivate actions, draft/published/inactive status handling, and save/publish validation.

**Architecture:** Keep the backend API shape mostly intact and make status semantics explicit: admin endpoints see every experiment, student endpoints see only `published` plus legacy `active`, and successful builds publish experiments as `published`. On the frontend, keep `TeacherPage` as the owner of import/build polling state, add a focused teacher sidebar component, and move draft/status validation into a small pure helper module.

**Tech Stack:** FastAPI, SQLite, pytest, React 19, TypeScript, Vite, Tailwind CSS, lucide-react.

---

## Scope Check

This plan covers one subsystem: teacher-side experiment configuration management. It does not add classroom monitoring, student progress dashboards, report lists, grade views, or a full visual step editor.

## File Structure

- Modify `backend/app/database.py`: student-visible experiment filtering treats `published` and legacy `active` as visible.
- Modify `backend/app/main.py`: admin saves default to `draft`; admin delete remains soft delete; public list reuses the database visibility rule.
- Modify `backend/app/experiment_builder.py`: successful builds publish with `status = "published"` instead of legacy `active`.
- Modify `backend/tests/test_database_experiments.py`: cover draft/published/inactive/active visibility.
- Create `backend/tests/test_admin_experiment_management_api.py`: cover admin save defaults, soft delete, and public visibility behavior.
- Modify `backend/tests/test_experiment_builder.py`: expect successful builds to publish as `published`.
- Modify `frontend/src/types/index.ts`: define experiment status values and use them in `Experiment`.
- Modify `frontend/src/hooks/useApi.ts`: add admin experiment list and delete methods.
- Create `frontend/src/pages/teacherExperimentDraft.ts`: pure helper functions for status normalization, blank/copy drafts, draft serialization, dirty snapshots, and validation.
- Create `frontend/src/components/teacher/ExperimentSidebar.tsx`: left experiment library with search, status filter, selection, create/copy/deactivate actions.
- Create `frontend/src/components/teacher/ValidationSummary.tsx`: compact validation message block used near save/publish actions.
- Modify `frontend/src/pages/TeacherPage.tsx`: use admin list, sidebar, dirty switch guard, draft creation/copy/deactivate flows, validation, and clearer status-aware save/build behavior.

---

### Task 1: Backend Experiment Visibility Semantics

**Files:**
- Modify: `backend/tests/test_database_experiments.py`
- Modify: `backend/app/database.py`

- [ ] **Step 1: Replace the active-only database test with status coverage**

In `backend/tests/test_database_experiments.py`, replace `test_list_experiments_can_filter_active` with:

```python
def test_list_experiments_filters_student_visible_statuses(tmp_path: Path) -> None:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    for experiment_id, status in [
        ("active-lab", "active"),
        ("published-lab", "published"),
        ("draft-lab", "draft"),
        ("inactive-lab", "inactive"),
    ]:
        db.upsert_experiment(
            {
                "experiment_id": experiment_id,
                "name": experiment_id,
                "system": "openEuler",
                "image_name": f"linux-ai-exp:{experiment_id}",
                "status": status,
                "steps": [{"id": 1, "title": "step"}],
            }
        )

    assert [item["id"] for item in db.list_experiments(active_only=True)] == [
        "active-lab",
        "published-lab",
    ]
    assert [item["id"] for item in db.list_experiments()] == [
        "active-lab",
        "draft-lab",
        "inactive-lab",
        "published-lab",
    ]
```

- [ ] **Step 2: Run the focused database test and verify it fails**

Run:

```bash
cd backend
python -m pytest tests/test_database_experiments.py::test_list_experiments_filters_student_visible_statuses -q
```

Expected: FAIL because `Database.list_experiments(active_only=True)` currently returns only `status = 'active'`.

- [ ] **Step 3: Update student-visible filtering**

In `backend/app/database.py`, replace the `active_only` SQL branch in `list_experiments` with:

```python
            if active_only:
                rows = conn.execute(
                    """
                    SELECT id, name, system_type, image_name, task_config, status
                    FROM experiment
                    WHERE status IN ('active', 'published')
                    ORDER BY id
                    """
                ).fetchall()
```

Keep the non-filtered branch unchanged.

- [ ] **Step 4: Run the focused database tests and verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_database_experiments.py -q
```

Expected: PASS for both database tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add backend/app/database.py backend/tests/test_database_experiments.py
git commit -m "feat: support published experiment visibility"
```

---

### Task 2: Admin Save Defaults and Soft Delete Behavior

**Files:**
- Create: `backend/tests/test_admin_experiment_management_api.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add admin experiment management tests**

Create `backend/tests/test_admin_experiment_management_api.py`:

```python
import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app import main
from app.database import Database


def prepare_database(tmp_path: Path) -> Database:
    db = Database(tmp_path / "linux_ai_lab.db")
    db.initialize()
    return db


def upsert_experiment(db: Database, experiment_id: str, status: str) -> None:
    db.upsert_experiment(
        {
            "experiment_id": experiment_id,
            "name": experiment_id,
            "system": "openEuler",
            "image_name": f"linux-ai-exp:{experiment_id}",
            "status": status,
            "schema_version": 2,
            "steps": [{"id": 1, "title": "查看目录", "goal": "确认当前目录"}],
        }
    )


def test_admin_save_new_experiment_defaults_to_draft(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    monkeypatch.setattr(main, "db", db)

    saved = asyncio.run(
        main.admin_save_experiment(
            {
                "experiment_id": "draft-lab",
                "name": "Draft Lab",
                "system": "openEuler",
                "image_name": "linux-ai-exp:draft-lab",
                "steps": [{"id": 1, "title": "查看目录", "goal": "确认当前目录"}],
            },
            _admin=None,
        )
    )

    assert saved["id"] == "draft-lab"
    assert saved["status"] == "draft"
    assert db.get_experiment("draft-lab")["status"] == "draft"


def test_admin_delete_experiment_soft_deletes_and_keeps_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    upsert_experiment(db, "published-lab", "published")
    session = db.create_session(
        session_id="session-1",
        student_id="stu001",
        experiment_id="published-lab",
        container_id=None,
        container_name=None,
        terminal_url=None,
        runtime_mode="mock",
    )
    monkeypatch.setattr(main, "db", db)

    result = asyncio.run(main.admin_delete_experiment("published-lab", _admin=None))

    assert result == {"status": "inactive", "experiment_id": "published-lab"}
    assert db.get_experiment("published-lab")["status"] == "inactive"
    assert db.get_session(session["id"]) is not None


def test_admin_delete_unknown_experiment_returns_404(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    monkeypatch.setattr(main, "db", db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(main.admin_delete_experiment("missing-lab", _admin=None))

    assert exc_info.value.status_code == 404


def test_public_experiment_list_excludes_drafts_and_inactive(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    upsert_experiment(db, "active-lab", "active")
    upsert_experiment(db, "published-lab", "published")
    upsert_experiment(db, "draft-lab", "draft")
    upsert_experiment(db, "inactive-lab", "inactive")
    monkeypatch.setattr(main, "db", db)

    result = asyncio.run(main.list_experiments())

    assert [item["id"] for item in result] == ["active-lab", "published-lab"]
```

- [ ] **Step 2: Run the new tests and verify the default status test fails**

Run:

```bash
cd backend
python -m pytest tests/test_admin_experiment_management_api.py -q
```

Expected: FAIL on `test_admin_save_new_experiment_defaults_to_draft` because `admin_save_experiment` currently defaults missing status to `active`.

- [ ] **Step 3: Change admin save/update defaults to draft**

In `backend/app/main.py`, inside `admin_save_experiment`, replace:

```python
    config.setdefault("status", "active")
```

with:

```python
    config.setdefault("status", "draft")
```

Inside `admin_update_experiment`, replace:

```python
    config.setdefault("status", "active")
```

with:

```python
    config.setdefault("status", "draft")
```

- [ ] **Step 4: Run the admin management tests and verify they pass**

Run:

```bash
cd backend
python -m pytest tests/test_admin_experiment_management_api.py -q
```

Expected: PASS.

- [ ] **Step 5: Run backend status-related tests**

Run:

```bash
cd backend
python -m pytest tests/test_database_experiments.py tests/test_admin_experiment_management_api.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add backend/app/main.py backend/tests/test_admin_experiment_management_api.py
git commit -m "feat: default admin experiments to draft"
```

---

### Task 3: Successful Builds Publish Experiments

**Files:**
- Modify: `backend/tests/test_experiment_builder.py`
- Modify: `backend/app/experiment_builder.py`

- [ ] **Step 1: Update build tests to expect published status**

In `backend/tests/test_experiment_builder.py`, replace this assertion in `test_build_success_publishes_experiment`:

```python
    assert experiment["status"] == "active"
```

with:

```python
    assert experiment["status"] == "published"
```

Add this assertion to `test_recover_interrupted_build_publishes_when_image_exists` after `assert db.get_experiment("demo-lab") is not None`:

```python
    assert db.get_experiment("demo-lab")["status"] == "published"
```

- [ ] **Step 2: Run the focused build tests and verify they fail**

Run:

```bash
cd backend
python -m pytest tests/test_experiment_builder.py::test_build_success_publishes_experiment tests/test_experiment_builder.py::test_recover_interrupted_build_publishes_when_image_exists -q
```

Expected: FAIL because `ExperimentBuildService._publish_successful_build` currently writes `active`.

- [ ] **Step 3: Publish successful builds as published**

In `backend/app/experiment_builder.py`, inside `_publish_successful_build`, replace:

```python
        draft["status"] = "active"
```

with:

```python
        draft["status"] = "published"
```

- [ ] **Step 4: Run experiment builder tests**

Run:

```bash
cd backend
python -m pytest tests/test_experiment_builder.py -q
```

Expected: PASS.

- [ ] **Step 5: Run backend regression tests for changed areas**

Run:

```bash
cd backend
python -m pytest tests/test_database_experiments.py tests/test_admin_experiment_management_api.py tests/test_experiment_builder.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add backend/app/experiment_builder.py backend/tests/test_experiment_builder.py
git commit -m "feat: publish successful experiment builds"
```

---

### Task 4: Frontend API and Type Support

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/hooks/useApi.ts`

- [ ] **Step 1: Add experiment status typing**

In `frontend/src/types/index.ts`, add this before `export interface Experiment`:

```ts
export type ExperimentStatus = 'draft' | 'published' | 'inactive' | 'active';
```

Then change the `Experiment.status` field from:

```ts
  status: string;
```

to:

```ts
  status: ExperimentStatus;
```

- [ ] **Step 2: Add admin list and delete API methods**

In `frontend/src/hooks/useApi.ts`, add `ExperimentStatus` only if the file needs it later; the new methods only need existing `Experiment`.

Add this method after `loadExperiments`:

```ts
  const loadAdminExperiments = useCallback(async (): Promise<Experiment[]> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments`, {
      headers: adminHeaders(),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, '读取实验列表失败'));
    }
    return response.json();
  }, []);
```

Add this method after `saveExperiment`:

```ts
  const deleteExperiment = useCallback(async (experimentId: string): Promise<{ status: string; experiment_id: string }> => {
    const response = await fetch(`${API_BASE}/api/admin/experiments/${encodeURIComponent(experimentId)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, '停用实验失败'));
    }
    return response.json();
  }, []);
```

Add both methods to the returned object:

```ts
    loadAdminExperiments,
    deleteExperiment,
```

- [ ] **Step 3: Run frontend type/build check**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS. These API methods are not used yet, so this should type-check after the additions.

- [ ] **Step 4: Commit Task 4**

Run:

```bash
git add frontend/src/types/index.ts frontend/src/hooks/useApi.ts
git commit -m "feat: add admin experiment API client"
```

---

### Task 5: Frontend Draft Helpers and Validation

**Files:**
- Create: `frontend/src/pages/teacherExperimentDraft.ts`

- [ ] **Step 1: Create the teacher experiment draft helper module**

Create `frontend/src/pages/teacherExperimentDraft.ts`:

```ts
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
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS. The helper is compiled even before it is imported.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add frontend/src/pages/teacherExperimentDraft.ts
git commit -m "feat: add teacher experiment draft helpers"
```

---

### Task 6: Teacher Experiment Sidebar and Validation Summary

**Files:**
- Create: `frontend/src/components/teacher/ExperimentSidebar.tsx`
- Create: `frontend/src/components/teacher/ValidationSummary.tsx`

- [ ] **Step 1: Create the experiment sidebar component**

Create `frontend/src/components/teacher/ExperimentSidebar.tsx`:

```tsx
import { Archive, Copy, FilePlus2, Search } from 'lucide-react';
import type { Experiment } from '@/types';
import type { StatusFilter } from '@/pages/teacherExperimentDraft';
import {
  experimentStepCount,
  matchesExperimentSearch,
  matchesStatusFilter,
  normalizeExperimentStatus,
  statusBadgeClass,
  statusLabel,
} from '@/pages/teacherExperimentDraft';

interface ExperimentSidebarProps {
  experiments: Experiment[];
  selectedExperimentId: string;
  searchQuery: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
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
  { value: 'inactive', label: '已停用' },
];

export default function ExperimentSidebar({
  experiments,
  selectedExperimentId,
  searchQuery,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onSelect,
  onCreateBlank,
  onCopySelected,
  onDeactivateSelected,
  canCopySelected,
  canDeactivateSelected,
  disabled = false,
}: ExperimentSidebarProps) {
  const visibleExperiments = experiments.filter(
    (experiment) => matchesExperimentSearch(experiment, searchQuery) && matchesStatusFilter(experiment, statusFilter)
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
        <div className="grid grid-cols-4 gap-1 mt-3">
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
            className="h-8 inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Archive size={13} />
            停用
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
```

- [ ] **Step 2: Create the validation summary component**

Create `frontend/src/components/teacher/ValidationSummary.tsx`:

```tsx
import { AlertTriangle, Info } from 'lucide-react';

interface ValidationSummaryProps {
  errors: string[];
  warnings: string[];
}

export default function ValidationSummary({ errors, warnings }: ValidationSummaryProps) {
  if (!errors.length && !warnings.length) return null;

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-2">
            <AlertTriangle size={13} />
            需要修正后才能继续
          </div>
          <ul className="space-y-1">
            {errors.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-red-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 mb-2">
            <Info size={13} />
            建议检查
          </div>
          <ul className="space-y-1">
            {warnings.map((item) => (
              <li key={item} className="text-xs leading-relaxed text-amber-700">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit Task 6**

Run:

```bash
git add frontend/src/components/teacher/ExperimentSidebar.tsx frontend/src/components/teacher/ValidationSummary.tsx
git commit -m "feat: add teacher experiment sidebar components"
```

---

### Task 7: Teacher Page Workbench Wiring

**Files:**
- Modify: `frontend/src/pages/TeacherPage.tsx`

- [ ] **Step 1: Update imports and remove local default container helper**

In `frontend/src/pages/TeacherPage.tsx`, change the lucide import to include status/action icons used by the new layout:

```ts
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  FlaskConical,
  Loader2,
  Save,
  Send,
  Upload,
  XCircle,
} from 'lucide-react';
```

Add imports:

```ts
import ExperimentSidebar from '@/components/teacher/ExperimentSidebar';
import ValidationSummary from '@/components/teacher/ValidationSummary';
import {
  buildSavePayload,
  createBlankSnapshot,
  createCopySnapshot,
  createSnapshotFromExperiment,
  defaultContainerSpec,
  editorSnapshotKey,
  normalizeExperimentStatus,
  statusBadgeClass,
  statusLabel,
  validateSnapshot,
  type AdminDraft,
  type StatusFilter,
} from './teacherExperimentDraft';
```

Change the type import from:

```ts
import type { Experiment, Step, ContainerSpec, TaskConfig, BuildState, ImportPayload } from '@/types';
```

to:

```ts
import type { Experiment, Step, ContainerSpec, BuildState, ImportPayload, ExperimentStatus } from '@/types';
```

Delete the local `defaultContainerSpec` function from `TeacherPage.tsx` because the helper module now owns it.

- [ ] **Step 2: Add sidebar and dirty-state React state**

In `TeacherPage`, keep the existing `experiments`, `selectedExperimentId`, `adminDraft`, `adminStepsText`, and `adminContainerSpecText` states, and add these states near them:

```ts
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [savedSnapshotKey, setSavedSnapshotKey] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
```

Change the `adminDraft` state type from:

```ts
  const [adminDraft, setAdminDraft] = useState<Record<string, unknown> | null>(null);
```

to:

```ts
  const [adminDraft, setAdminDraft] = useState<AdminDraft | null>(null);
```

Add this derived value after `selectedExperiment`:

```ts
  const currentSnapshot = adminDraft
    ? { draft: adminDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText }
    : null;
  const isDirty = Boolean(currentSnapshot && savedSnapshotKey && editorSnapshotKey(currentSnapshot) !== savedSnapshotKey);
```

- [ ] **Step 3: Add helper functions inside TeacherPage**

Add these callbacks before the first `useEffect` that loads experiments:

```ts
  const resetBuildState = useCallback(() => {
    setCurrentBuildId('');
    setBuildStatus('');
    setBuildLogs('');
    setBuildError('');
    setBuildDockerfile('');
  }, []);

  const applySnapshot = useCallback((snapshot: { draft: AdminDraft; stepsText: string; containerSpecText: string }) => {
    setAdminDraft(snapshot.draft);
    setAdminStepsText(snapshot.stepsText);
    setAdminContainerSpecText(snapshot.containerSpecText);
    setSavedSnapshotKey(editorSnapshotKey(snapshot));
    setValidationErrors([]);
    setValidationWarnings([]);
  }, []);

  const refreshAdminExperiments = useCallback(async (preferredId?: string) => {
    const data = await api.loadAdminExperiments();
    setExperiments(data);
    const nextSelectedId = preferredId || selectedExperimentId;
    if (data.length && !data.find((item) => item.id === nextSelectedId)) {
      setSelectedExperimentId(data[0].id);
    }
    if (preferredId) setSelectedExperimentId(preferredId);
    return data;
  }, [api, selectedExperimentId]);

  const confirmDiscardDirty = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('当前实验有未保存修改，切换后这些修改会丢失。确认继续？');
  }, [isDirty]);
```

- [ ] **Step 4: Load admin experiments instead of student-visible experiments**

Replace the initial load effect:

```ts
  useEffect(() => {
    api.loadExperiments().then((data) => {
      setExperiments(data);
      if (data.length && !data.find((item) => item.id === selectedExperimentId)) {
        setSelectedExperimentId(data[0].id);
      }
    });
  }, []);
```

with:

```ts
  useEffect(() => {
    api.loadAdminExperiments()
      .then((data) => {
        setExperiments(data);
        if (data.length && !data.find((item) => item.id === selectedExperimentId)) {
          setSelectedExperimentId(data[0].id);
        }
        if (!data.length) {
          const snapshot = createBlankSnapshot(new Set());
          applySnapshot(snapshot);
          setSelectedExperimentId(snapshot.draft.experiment_id);
        }
      })
      .catch((error) => setAdminStatus(error instanceof Error ? error.message : '读取实验列表失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Replace the selected-experiment effect:

```ts
  useEffect(() => {
    if (selectedExperiment && !adminDraft) {
      openAdminPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExperiment]);
```

with:

```ts
  useEffect(() => {
    if (selectedExperiment) {
      openAdminPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExperimentId]);
```

- [ ] **Step 5: Update openAdminPanel to use snapshots**

Replace the body of `openAdminPanel` with:

```ts
    const experiment = selectedExperiment;
    if (experiment) {
      applySnapshot(createSnapshotFromExperiment(experiment));
    }
    setImportText('');
    setImportFile(null);
    setImportWarnings([]);
    setImportRawOutput('');
    resetBuildState();
    clearBuildPolling();
    setAdminStatus('');
```

Update the dependency list to:

```ts
  }, [selectedExperiment, applySnapshot, resetBuildState, clearBuildPolling]);
```

- [ ] **Step 6: Update import draft application**

Inside `applyImportedDraft`, in the `if (payload.draft)` branch, replace the manual `setAdminDraft`, `setAdminStepsText`, and `setAdminContainerSpecText` calls with:

```ts
      applySnapshot({
        draft: {
          experiment_id: String(draft.experiment_id ?? draft.id ?? 'imported-experiment'),
          name: String(draft.name ?? '导入实验草稿'),
          system: String(draft.system ?? 'openEuler'),
          image_name: String(draft.image_name ?? ''),
          objective: String(draft.objective ?? ''),
          status: normalizeExperimentStatus(String(draft.status ?? 'draft')),
          schema_version: Number(draft.schema_version ?? 2),
        },
        stepsText: JSON.stringify(steps, null, 2),
        containerSpecText: JSON.stringify(containerSpec, null, 2),
      });
```

Then replace the repeated build-state setters in that branch with:

```ts
      resetBuildState();
```

Update the dependency list to include `applySnapshot`, `resetBuildState`, and `normalizeExperimentStatus` is imported as a function and does not belong in the dependency list.

- [ ] **Step 7: Add create/copy/select/deactivate callbacks**

Add these callbacks before `saveAdminExperiment`:

```ts
  const selectExperiment = useCallback((experimentId: string) => {
    if (!confirmDiscardDirty()) return;
    setSelectedExperimentId(experimentId);
  }, [confirmDiscardDirty]);

  const createBlankExperiment = useCallback(() => {
    if (!confirmDiscardDirty()) return;
    const snapshot = createBlankSnapshot(new Set(experiments.map((item) => item.id)));
    applySnapshot(snapshot);
    setSelectedExperimentId(snapshot.draft.experiment_id);
    setAdminStatus('已创建草稿，请完善后保存');
    resetBuildState();
  }, [applySnapshot, confirmDiscardDirty, experiments, resetBuildState]);

  const copySelectedExperiment = useCallback(() => {
    if (!selectedExperiment || !confirmDiscardDirty()) return;
    const snapshot = createCopySnapshot(selectedExperiment, new Set(experiments.map((item) => item.id)));
    applySnapshot(snapshot);
    setSelectedExperimentId(snapshot.draft.experiment_id);
    setAdminStatus('已复制为草稿，请检查后保存');
    resetBuildState();
  }, [applySnapshot, confirmDiscardDirty, experiments, resetBuildState, selectedExperiment]);

  const deactivateSelectedExperiment = useCallback(async () => {
    if (!selectedExperiment || isBuildRunning) return;
    const confirmed = window.confirm(`停用实验“${selectedExperiment.name}”？历史会话和报告会保留，学生端将不再显示该实验。`);
    if (!confirmed) return;
    setAdminStatus('正在停用实验');
    try {
      await api.deleteExperiment(selectedExperiment.id);
      const data = await refreshAdminExperiments(selectedExperiment.id);
      const refreshed = data.find((item) => item.id === selectedExperiment.id);
      if (refreshed) {
        applySnapshot(createSnapshotFromExperiment(refreshed));
      }
      setAdminStatus('实验已停用');
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : '停用实验失败');
    }
  }, [api, applySnapshot, isBuildRunning, refreshAdminExperiments, selectedExperiment]);
```

- [ ] **Step 8: Validate before save and build**

At the start of `saveAdminExperiment`, after `if (!adminDraft) return;`, add:

```ts
    const snapshot = { draft: adminDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText };
    const validation = validateSnapshot(snapshot, 'save');
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);
    if (validation.errors.length) {
      setAdminStatus('请先修正实验配置');
      return;
    }
```

Replace the manual payload construction:

```ts
      const steps = JSON.parse(adminStepsText || '[]');
      const containerSpec = JSON.parse(adminContainerSpecText || '{}');
      const saved = await api.saveExperiment({ ...adminDraft, steps, container_spec: containerSpec });
      const data = await api.loadExperiments();
      setExperiments(data);
      setSelectedExperimentId(saved.id);
```

with:

```ts
      const saved = await api.saveExperiment(buildSavePayload(snapshot));
      await refreshAdminExperiments(saved.id);
      applySnapshot(createSnapshotFromExperiment(saved));
      setSelectedExperimentId(saved.id);
```

At the start of `buildAdminExperiment`, after `if (!adminDraft || isBuildRunning) return;`, add:

```ts
    const publishDraft: AdminDraft = { ...adminDraft, status: 'published' };
    const snapshot = { draft: publishDraft, stepsText: adminStepsText, containerSpecText: adminContainerSpecText };
    const validation = validateSnapshot(snapshot, 'publish');
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);
    if (validation.errors.length) {
      setAdminStatus('请先修正发布配置');
      return;
    }
```

Replace the manual payload construction in `buildAdminExperiment`:

```ts
      const steps = JSON.parse(adminStepsText || '[]');
      const containerSpec = JSON.parse(adminContainerSpecText || '{}');
      const payload = await api.buildExperiment({ ...adminDraft, steps, container_spec: containerSpec });
```

with:

```ts
      setAdminDraft(publishDraft);
      const payload = await api.buildExperiment(buildSavePayload(snapshot));
```

Update dependency arrays for `saveAdminExperiment` and `buildAdminExperiment` to include `refreshAdminExperiments`, `applySnapshot`, and any newly referenced state.

- [ ] **Step 9: Update build polling refresh**

Inside `startBuildPolling`, replace:

```ts
            const data = await api.loadExperiments();
            setExperiments(data);
            setSelectedExperimentId(payload.experiment_id);
```

with:

```ts
            const data = await refreshAdminExperiments(payload.experiment_id);
            const refreshed = data.find((item) => item.id === payload.experiment_id);
            if (refreshed) applySnapshot(createSnapshotFromExperiment(refreshed));
            setSelectedExperimentId(payload.experiment_id);
```

Update the `startBuildPolling` dependency list to include `refreshAdminExperiments` and `applySnapshot`.

- [ ] **Step 10: Update the status field editor**

In the basic info grid, add a fifth field or replace the four-column grid with a responsive five-field layout. Add this field after Docker image:

```tsx
              <Field.Root>
                <Field.Label className="text-neutral-900 text-xs font-semibold mb-1.5 block">实验状态</Field.Label>
                <select
                  value={adminDraft.status}
                  onChange={(e) => updateDraft('status', e.target.value as ExperimentStatus)}
                  disabled={isBuildRunning}
                  className="w-full h-9 px-3 rounded-md border border-neutral-200 bg-white text-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 disabled:opacity-50 hover:border-neutral-300 transition-colors"
                >
                  <option value="draft">草稿</option>
                  <option value="published">已发布</option>
                  <option value="inactive">已停用</option>
                </select>
              </Field.Root>
```

Change `updateDraft` to accept experiment status values:

```ts
  const updateDraft = useCallback((field: keyof AdminDraft, value: string | ExperimentStatus) => {
    setAdminDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);
```

- [ ] **Step 11: Replace the top-level layout with sidebar plus editor**

Keep the existing header, but remove the topbar current-experiment `<select>` block. Add a status pill near the title:

```tsx
          {adminDraft && (
            <span className={`h-6 inline-flex items-center rounded-md border px-2 text-xs font-medium ${statusBadgeClass(adminDraft.status)}`}>
              {statusLabel(adminDraft.status)}
            </span>
          )}
```

Replace the `<main className="flex-1 p-6">` opening with:

```tsx
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <ExperimentSidebar
          experiments={experiments}
          selectedExperimentId={selectedExperimentId}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onSelect={selectExperiment}
          onCreateBlank={createBlankExperiment}
          onCopySelected={copySelectedExperiment}
          onDeactivateSelected={deactivateSelectedExperiment}
          canCopySelected={Boolean(selectedExperiment)}
          canDeactivateSelected={Boolean(selectedExperiment && normalizeExperimentStatus(selectedExperiment.status) !== 'inactive')}
          disabled={isBuildRunning}
        />
        <section className="flex-1 min-w-0 overflow-auto p-6">
```

Replace the `</main>` closing with:

```tsx
        </section>
      </main>
```

Keep the existing editor card inside the new section.

- [ ] **Step 12: Add validation summary near save/build actions**

Insert this above `<Tabs.Root defaultValue="text" className="mt-4">`:

```tsx
            <ValidationSummary errors={validationErrors} warnings={validationWarnings} />
```

In the build tab button row, add a secondary save button before the build button:

```tsx
                  <button
                    onClick={saveAdminExperiment}
                    disabled={isBuildRunning}
                    className="h-9 inline-flex items-center gap-1.5 px-4 rounded-md font-medium text-xs text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 active:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save size={14} />
                    保存草稿
                  </button>
```

Change the build button icon for the non-running state to:

```tsx
                        <Send size={14} />
                        构建镜像并发布
```

- [ ] **Step 13: Run frontend build and fix type errors in the touched file**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS. If TypeScript reports a missing dependency in a hook, add the named dependency. If TypeScript reports an unused import, remove that import.

- [ ] **Step 14: Commit Task 7**

Run:

```bash
git add frontend/src/pages/TeacherPage.tsx
git commit -m "feat: wire teacher experiment workbench"
```

---

### Task 8: End-to-End Verification

**Files:**
- No source files unless verification exposes a defect.

- [ ] **Step 1: Run backend regression tests**

Run:

```bash
cd backend
python -m pytest tests/test_database_experiments.py tests/test_admin_experiment_management_api.py tests/test_experiment_builder.py tests/test_admin_import_file_api.py tests/test_session_lifecycle.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend production build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Start the backend**

Run from the repository root in a long-running terminal:

```bash
cd backend
python -m uvicorn app.main:app --reload --reload-exclude generated/* --host 127.0.0.1 --port 8000
```

Expected: server starts and logs an application startup line.

- [ ] **Step 4: Start the frontend**

Run from the repository root in a second long-running terminal:

```bash
cd frontend
npm run dev -- --port 5173
```

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 5: Verify teacher page in the browser**

Open `http://127.0.0.1:5173/teacher`, enter the teacher password `linuxai`, then verify:

- The left sidebar shows experiments and a search box.
- Clicking an experiment updates the editor.
- `新建` creates a draft with a generated experiment ID.
- `复制` creates a draft copy of the selected experiment.
- `停用` asks for confirmation and then changes the selected experiment to `已停用`.
- Invalid steps JSON shows a validation error and prevents save/build.
- A draft or inactive experiment is not shown on the student page at `http://127.0.0.1:5173/`.

- [ ] **Step 6: Capture final status**

Run:

```bash
git status --short
```

Expected: only intentionally changed source files are present. Existing unrelated dirty files from before this plan may still appear; do not revert them.

- [ ] **Step 7: Commit verification fixes only if any were needed**

If Step 5 exposed a defect and source files were changed, run:

```bash
git add backend/app/database.py backend/app/main.py backend/app/experiment_builder.py backend/tests/test_database_experiments.py backend/tests/test_admin_experiment_management_api.py backend/tests/test_experiment_builder.py frontend/src/types/index.ts frontend/src/hooks/useApi.ts frontend/src/pages/teacherExperimentDraft.ts frontend/src/components/teacher/ExperimentSidebar.tsx frontend/src/components/teacher/ValidationSummary.tsx frontend/src/pages/TeacherPage.tsx
git commit -m "fix: polish teacher experiment workbench"
```

Expected: a commit is created only when verification produced a source fix.

## Self-Review Notes

- Spec coverage: left experiment list is Task 6 and Task 7; add/copy/deactivate is Task 7; draft/published/inactive status is Tasks 1-3 and Task 7; student visibility is Task 1 and Task 2; validation is Task 5 and Task 7; build publish behavior is Task 3 and Task 7.
- Scope check: no classroom monitoring, student progress dashboard, report list, grade view, or full visual step editor is included.
- Type consistency: frontend status values are `draft`, `published`, `inactive`, with backend compatibility for legacy `active`.
