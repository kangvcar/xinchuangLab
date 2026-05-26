# Teacher Experiment Config Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the teacher experiment configuration workbench with explicit delete behavior, visual step editing, safer import defaults, and import-to-save regression coverage.

**Architecture:** Keep the existing FastAPI endpoints and React teacher workbench. Add backend coverage for imported drafts saving as experiments, shift imported drafts to draft status, and add focused frontend step-editor helpers/components that synchronize with the existing JSON payload shape.

**Tech Stack:** FastAPI, SQLite, pytest, React 19, TypeScript, Vite, Tailwind CSS, lucide-react.

---

## Scope Check

This plan covers one subsystem: teacher-side experiment configuration management. It does not add classroom monitoring, student progress dashboards, report lists, grade views, or hard deletion.

## File Structure

- Modify `backend/tests/test_admin_import_file_api.py`: add import-to-save regression tests and draft status assertion.
- Modify `backend/app/experiment_designer.py`: default generated/imported drafts to `draft`.
- Modify `frontend/src/pages/teacherExperimentDraft.ts`: add step editor helpers for parsing, serializing, command lines, and renumbering.
- Create `frontend/src/components/teacher/StepFlowEditor.tsx`: visual step card editor with add, delete, reorder, and field editing.
- Modify `frontend/src/components/teacher/ExperimentSidebar.tsx`: rename the destructive teacher action from停用 to删除 while keeping soft-delete behavior.
- Modify `frontend/src/pages/TeacherPage.tsx`: wire the visual step editor, move JSON steps into advanced config, and improve flow labels.

---

### Task 1: Backend Import Draft Reliability

**Files:**
- Modify: `backend/tests/test_admin_import_file_api.py`
- Modify: `backend/app/experiment_designer.py`

- [ ] **Step 1: Add failing tests for imported draft status and save chain**

Append these tests to `backend/tests/test_admin_import_file_api.py`:

```python
def test_import_file_endpoint_rule_fallback_returns_draft_status(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "deepseek_api_key", "")
    monkeypatch.setattr(main.settings, "ai_mode", "auto")
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
        headers=ADMIN_HEADERS,
        files={"file": ("linux-basic.md", b"# Linux Basic\n\n```bash\npwd\n```", "text/markdown")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["draft"]["status"] == "draft"


def test_import_file_draft_can_be_saved_as_experiment(monkeypatch, tmp_path) -> None:
    db = main.Database(tmp_path / "linux_ai_lab.db")
    db.initialize()
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(main.settings, "deepseek_api_key", "")
    monkeypatch.setattr(main.settings, "ai_mode", "auto")
    client = TestClient(main.app)

    import_response = client.post(
        "/api/admin/experiments/import-file",
        headers=ADMIN_HEADERS,
        files={"file": ("linux-basic.md", b"# Linux Basic\n\n```bash\npwd\n```", "text/markdown")},
    )
    draft = import_response.json()["draft"]

    save_response = client.post(
        "/api/admin/experiments",
        headers={**ADMIN_HEADERS, "Content-Type": "application/json"},
        json=draft,
    )

    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved["id"] == draft["experiment_id"]
    assert saved["status"] == "draft"
    assert saved["task_config"]["steps"]
```

- [ ] **Step 2: Run tests and verify the draft status test fails**

Run:

```powershell
cd backend
python -m pytest tests/test_admin_import_file_api.py::test_import_file_endpoint_rule_fallback_returns_draft_status tests/test_admin_import_file_api.py::test_import_file_draft_can_be_saved_as_experiment -q
```

Expected: FAIL because imported defaults still use `active`.

- [ ] **Step 3: Change experiment designer defaults to draft**

In `backend/app/experiment_designer.py`, replace both status defaults:

```python
"status": str(draft.get("status") or "active"),
normalized.setdefault("status", "active")
```

with:

```python
"status": str(draft.get("status") or "draft"),
normalized.setdefault("status", "draft")
```

- [ ] **Step 4: Run import tests and verify they pass**

Run:

```powershell
cd backend
python -m pytest tests/test_admin_import_file_api.py -q
```

Expected: PASS.

---

### Task 2: Step Editing Helpers

**Files:**
- Modify: `frontend/src/pages/teacherExperimentDraft.ts`

- [ ] **Step 1: Add helper functions**

Add exported helpers near `buildSavePayload`:

```ts
export function parseStepsText(stepsText: string): Step[] {
  const parsed = JSON.parse(stepsText || '[]');
  return Array.isArray(parsed) ? (parsed as Step[]) : [];
}

export function serializeSteps(steps: Step[]): string {
  return JSON.stringify(renumberSteps(steps), null, 2);
}

export function renumberSteps(steps: Step[]): Step[] {
  return steps.map((step, index) => ({ ...step, id: index + 1 }));
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
```

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

---

### Task 3: Visual Step Flow Editor

**Files:**
- Create: `frontend/src/components/teacher/StepFlowEditor.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/teacher/StepFlowEditor.tsx` with a controlled editor that receives `stepsText`, `disabled`, `onStepsTextChange`, and `onValidationError`.

The component must:

- Parse `stepsText` into `Step[]`.
- Show parse errors inline.
- Render one card per step.
- Edit `title`, `goal`, `instructions`, `try_commands`, `success_criteria`, `success_hint`, and `coach_focus`.
- Add a blank step with the next id.
- Delete a step and renumber.
- Move a step up or down and renumber.
- Preserve unknown fields, including `verification`.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS after the new component compiles.

---

### Task 4: Wire Teacher Page Flow

**Files:**
- Modify: `frontend/src/components/teacher/ExperimentSidebar.tsx`
- Modify: `frontend/src/pages/TeacherPage.tsx`

- [ ] **Step 1: Rename sidebar action to delete**

In `ExperimentSidebar`, keep the callback names but change the button label from `停用` to `删除` and use clearer title text. Keep `Archive` or replace it with `Trash2` from lucide-react.

- [ ] **Step 2: Import and render StepFlowEditor**

In `TeacherPage.tsx`, import:

```ts
import StepFlowEditor from '@/components/teacher/StepFlowEditor';
```

Add a `steps` tab panel that renders:

```tsx
<StepFlowEditor
  stepsText={adminStepsText}
  disabled={isBuildRunning}
  onStepsTextChange={setAdminStepsText}
  onValidationError={(message) => {
    setValidationErrors(message ? [message] : []);
  }}
/>
```

Move the raw steps JSON textarea into an advanced tab or an advanced section under the existing config tabs.

- [ ] **Step 3: Improve teacher flow labels**

Use tab labels:

- `导入文档`
- `步骤流程`
- `高级配置`
- `保存发布`

The advanced tab should contain both container JSON and steps JSON.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

---

### Task 5: Final Verification

**Files:**
- No source files unless verification reveals a defect.

- [ ] **Step 1: Run backend regression tests**

Run:

```powershell
cd backend
python -m pytest tests/test_database_experiments.py tests/test_admin_experiment_management_api.py tests/test_experiment_builder.py tests/test_admin_import_file_api.py tests/test_session_lifecycle.py -q
```

Expected: PASS.

- [ ] **Step 2: Run frontend production build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Browser verification**

Open `http://127.0.0.1:5173/teacher`, log in with `linuxai`, and verify:

- Left experiment library loads.
- New experiment creates a draft.
- File import loads a draft into the editor.
- Visual step editor can add, edit, reorder, and delete a step.
- Save persists the imported draft.
- Delete marks an experiment as deleted/inactive.
- Student page does not show draft or deleted experiments.

- [ ] **Step 4: Check git status**

Run:

```powershell
git status --short
```

Expected: only intentional files are changed.

