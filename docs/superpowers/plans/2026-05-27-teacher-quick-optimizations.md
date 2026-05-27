# Teacher Quick Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve teacher-facing experiment configuration clarity, student roster import, AI import feedback, and verification rule semantics.

**Architecture:** Preserve the existing FastAPI and React/Vite structure. Add one roster import endpoint, one history-based verification check type, and focused teacher UI improvements without changing existing `command_match` behavior.

**Tech Stack:** FastAPI, SQLite, pytest, React 19, TypeScript, Vite, Tailwind CSS, lucide-react.

---

## File Structure

- Modify `backend/app/main.py`: parse TXT student rosters and expose `POST /api/admin/students/import-file`.
- Modify `backend/app/verification_service.py`: add `command_set` verification over per-step command history.
- Modify `backend/tests/test_admin_experiment_management_api.py`: cover roster import behavior.
- Modify `backend/tests/test_verification_service.py`: cover `command_match` alternatives and `command_set`.
- Modify `frontend/src/types/index.ts`: add `StudentImportPayload` and `Check.mode`.
- Modify `frontend/src/hooks/useApi.ts`: add `importStudentsFile`.
- Modify `frontend/src/pages/TeacherPage.tsx`: add roster import UI, AI import animation, and clearer step tabs.
- Modify `frontend/src/components/teacher/StepFlowEditor.tsx`: add friendly verification summary cards.
- Modify `frontend/src/components/teacher/ExperimentSidebar.tsx`: limit experiment list height to roughly eight entries.
- Modify `.gitignore`: ignore `.superpowers/` browser companion artifacts.

## Tasks

- [x] Add failing backend tests for TXT roster import and `command_set`.
- [x] Implement roster import and `command_set` minimally until targeted tests pass.
- [x] Add frontend API typing and hook for roster import.
- [x] Improve teacher page UI for roster import, AI import progress, and step navigation.
- [x] Add teacher-friendly verification summaries while preserving JSON editing.
- [ ] Run full backend regression tests.
- [ ] Run frontend production build.
- [ ] Verify the teacher page in the browser.
