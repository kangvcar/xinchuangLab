from __future__ import annotations

import asyncio
import json
import secrets
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .ai_provider import CoachProvider, create_coach_provider
from .config import settings
from .database import Database
from .docker_manager import DockerManager
from .experiment_builder import ExperimentBuildError, ExperimentBuildService
from .experiment_designer import (
    SUPPORTED_IMPORT_EXTENSIONS,
    design_experiment_from_document,
    ensure_experiment_draft_defaults,
)
from .experiments import import_steps_from_text, normalize_steps_schema, sync_experiments
from .knowledge import KnowledgeBase
from .log_processor import ERROR_RE, CommandEvent, LogProcessor
from .report_service import ReportService
from .schemas import ConfirmStepRequest, CreateSessionRequest, SimulateTerminalRequest
from .step_verifier import StepVerifier
from .verification_service import VerificationService
from .websocket_manager import WebSocketManager


db = Database(settings.database_path)
docker_manager = DockerManager(settings)
log_processor = LogProcessor()
knowledge_base = KnowledgeBase(settings.knowledge_dir)
coach_provider: CoachProvider = create_coach_provider(settings)
ws_manager = WebSocketManager()
report_service = ReportService(db, settings.reports_dir)
verifier = StepVerifier()
verification_service = VerificationService(docker_manager)
build_service = ExperimentBuildService(db, settings)
recent_command_fingerprints: dict[str, list[str]] = {}
session_terminal_buffers: dict[str, str] = {}
session_processed_event_counts: dict[str, int] = {}
session_step_command_events: dict[tuple[str, int], list[CommandEvent]] = {}

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.reports_dir.mkdir(parents=True, exist_ok=True)
settings.raw_logs_dir.mkdir(parents=True, exist_ok=True)
settings.builds_dir.mkdir(parents=True, exist_ok=True)
app.mount("/reports-static", StaticFiles(directory=settings.reports_dir), name="reports-static")


def _normalize_experiment_response(experiment: dict[str, Any]) -> dict[str, Any]:
    item = dict(experiment)
    task_config = dict(item.get("task_config") or {})
    task_config["steps"] = normalize_steps_schema(task_config.get("steps"))
    if "sort_order" in task_config:
        item["sort_order"] = task_config["sort_order"]
    item["task_config"] = task_config
    return item


def _sort_experiment_responses(experiments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        experiments,
        key=lambda item: (
            _sort_order_value(item.get("task_config", {}).get("sort_order")),
            str(item.get("name") or item.get("id") or ""),
            str(item.get("id") or ""),
        ),
    )


def _sort_order_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1_000_000


def require_admin_password(x_admin_password: str | None = Header(default=None)) -> None:
    if not settings.admin_password:
        return
    if not secrets.compare_digest(x_admin_password or "", settings.admin_password):
        raise HTTPException(status_code=401, detail="教师端密码错误")


def _require_active_student(student_id: str) -> dict[str, Any]:
    clean_student_id = str(student_id or "").strip()
    if not clean_student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    student = db.get_student(clean_student_id)
    if not student or student.get("status") != "active":
        raise HTTPException(status_code=403, detail="学号未登记，请联系教师录入后再进入实验")
    return student


@app.on_event("startup")
async def startup() -> None:
    db.initialize()
    await build_service.recover_interrupted_builds()
    sync_experiments(db, settings.experiments_dir)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    try:
        experiments = db.list_experiments()
    except Exception:
        experiments = []
    docker_diagnostics = await docker_manager.preflight(experiments)
    return {
        "status": "ok",
        "runtime": settings.lab_runtime,
        "allow_mock_fallback": False,
        "configured_allow_mock_fallback": settings.allow_mock_fallback,
        "fallback_policy": "mock-only",
        "terminal_event_ws_url": docker_diagnostics.get("terminal_event_ws_url"),
        "warnings": docker_diagnostics.get("warnings", []),
        "docker": docker_diagnostics,
        "ai_mode": settings.ai_mode,
        "ai_provider": coach_provider.name,
        "deepseek_configured": bool(settings.deepseek_api_key),
    }


@app.get("/api/experiments")
async def list_experiments() -> list[dict[str, Any]]:
    return _sort_experiment_responses(
        [_normalize_experiment_response(item) for item in db.list_experiments(active_only=True)]
    )


@app.get("/api/admin/experiments")
async def admin_list_experiments(_admin: None = Depends(require_admin_password)) -> list[dict[str, Any]]:
    return _sort_experiment_responses(
        [_normalize_experiment_response(item) for item in db.list_experiments() if item.get("status") != "inactive"]
    )


@app.put("/api/admin/experiments/order")
async def admin_reorder_experiments(
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    experiment_ids = payload.get("experiment_ids")
    if not isinstance(experiment_ids, list) or not experiment_ids:
        raise HTTPException(status_code=400, detail="experiment_ids must be a non-empty list")
    ordered_ids = [str(item).strip() for item in experiment_ids if str(item).strip()]
    if len(ordered_ids) != len(set(ordered_ids)):
        raise HTTPException(status_code=400, detail="experiment_ids contains duplicate values")

    visible_experiments = [item for item in db.list_experiments() if item.get("status") != "inactive"]
    visible_ids = {item["id"] for item in visible_experiments}
    unknown_ids = [experiment_id for experiment_id in ordered_ids if experiment_id not in visible_ids]
    if unknown_ids:
        raise HTTPException(status_code=404, detail=f"experiment not found: {', '.join(unknown_ids)}")

    remaining = [item["id"] for item in _sort_experiment_responses(visible_experiments) if item["id"] not in ordered_ids]
    final_order = [*ordered_ids, *remaining]
    for index, experiment_id in enumerate(final_order, start=1):
        experiment = db.get_experiment(experiment_id)
        if not experiment:
            continue
        task_config = dict(experiment["task_config"])
        task_config["sort_order"] = index
        db.upsert_experiment(task_config)
    return {"experiment_ids": final_order}


@app.post("/api/admin/auth")
async def admin_auth(payload: dict[str, Any]) -> dict[str, bool]:
    password = str(payload.get("password") or "")
    if not settings.admin_password or secrets.compare_digest(password, settings.admin_password):
        return {"ok": True}
    raise HTTPException(status_code=401, detail="教师端密码错误")


@app.get("/api/admin/students")
async def admin_list_students(_admin: None = Depends(require_admin_password)) -> list[dict[str, Any]]:
    return db.list_students()


@app.post("/api/admin/students")
async def admin_save_student(
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    student_id = str(payload.get("student_id") or "").strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    name = str(payload.get("name") or "").strip()
    return db.upsert_student(student_id, name=name, status="active")


@app.delete("/api/admin/students/{student_id}")
async def admin_delete_student(
    student_id: str,
    _admin: None = Depends(require_admin_password),
) -> dict[str, str]:
    if not db.delete_student(student_id):
        raise HTTPException(status_code=404, detail="student not found")
    return {"status": "deleted", "student_id": student_id}


@app.post("/api/students/login")
async def student_login(payload: dict[str, Any]) -> dict[str, Any]:
    return _require_active_student(str(payload.get("student_id") or ""))


@app.post("/api/admin/experiments")
async def admin_save_experiment(
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    experiment_id = str(payload.get("experiment_id") or payload.get("id") or "").strip()
    if not experiment_id:
        raise HTTPException(status_code=400, detail="experiment_id is required")
    config = dict(payload)
    config["experiment_id"] = experiment_id
    config.setdefault("name", experiment_id)
    config.setdefault("system", "openEuler")
    config.setdefault("image_name", "")
    config.setdefault("status", "draft")
    config.setdefault("schema_version", 2)
    config.setdefault("steps", [])
    config = ensure_experiment_draft_defaults(config)
    db.upsert_experiment(config)
    saved = db.get_experiment(config["experiment_id"])
    assert saved is not None
    return saved


@app.put("/api/admin/experiments/{experiment_id}")
async def admin_update_experiment(
    experiment_id: str,
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    existing = db.get_experiment(experiment_id)
    config = dict(payload)
    config["experiment_id"] = experiment_id
    if existing:
        existing_config = dict(existing["task_config"])
        existing_config.update(config)
        config = existing_config
    config.setdefault("schema_version", 2)
    config.setdefault("status", "draft")
    config.setdefault("name", experiment_id)
    config.setdefault("system", "openEuler")
    config.setdefault("image_name", "")
    config.setdefault("steps", [])
    config = ensure_experiment_draft_defaults(config)
    db.upsert_experiment(config)
    saved = db.get_experiment(config["experiment_id"])
    assert saved is not None
    return saved


@app.put("/api/admin/experiments/{experiment_id}/steps")
async def admin_update_steps(
    experiment_id: str,
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    experiment = db.get_experiment(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")
    task_config = dict(experiment["task_config"])
    steps = payload.get("steps")
    if not isinstance(steps, list):
        raise HTTPException(status_code=400, detail="steps must be a list")
    task_config["steps"] = normalize_steps_schema(steps)
    task_config["schema_version"] = 2
    db.upsert_experiment(task_config)
    saved = db.get_experiment(experiment_id)
    assert saved is not None
    return saved


@app.delete("/api/admin/experiments/{experiment_id}")
async def admin_delete_experiment(
    experiment_id: str,
    _admin: None = Depends(require_admin_password),
) -> dict[str, str]:
    experiment = db.get_experiment(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")
    task_config = dict(experiment["task_config"])
    task_config["status"] = "inactive"
    db.upsert_experiment(task_config)
    return {"status": "inactive", "experiment_id": experiment_id}


@app.post("/api/admin/experiments/import")
async def admin_import_experiment(
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    text = str(payload.get("text", "") or "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    result = await design_experiment_from_document(
        text=text,
        filename=str(payload.get("filename", "") or "pasted.md"),
        settings=settings,
    )
    if result.get("draft"):
        result["steps"] = result["draft"].get("steps", [])
    else:
        result["steps"] = import_steps_from_text(text)
    return result


@app.post("/api/admin/experiments/import-file")
async def admin_import_experiment_file(
    file: UploadFile = File(...),
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    filename = file.filename or "uploaded.txt"
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_IMPORT_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_IMPORT_EXTENSIONS))
        raise HTTPException(status_code=400, detail=f"仅支持 {allowed} 文件")
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="ignore")
    if not text.strip():
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    return await design_experiment_from_document(text=text, filename=filename, settings=settings)


@app.post("/api/admin/experiments/build")
async def admin_build_experiment(
    payload: dict[str, Any],
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    try:
        return await build_service.start_build(payload)
    except ExperimentBuildError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"启动镜像构建失败：{exc}") from exc


@app.get("/api/admin/experiments/builds/{build_id}")
async def admin_get_experiment_build(
    build_id: str,
    _admin: None = Depends(require_admin_password),
) -> dict[str, Any]:
    build = db.get_experiment_build(build_id)
    if not build:
        raise HTTPException(status_code=404, detail="build not found")
    return build


@app.get("/api/sessions")
async def list_sessions() -> list[dict[str, Any]]:
    return db.list_sessions()


@app.get("/api/sessions/current")
async def get_current_session(student_id: str, experiment_id: str | None = None) -> dict[str, Any]:
    student = _require_active_student(student_id)
    session = db.get_latest_running_session(student_id=student["student_id"], experiment_id=experiment_id)
    if not session:
        raise HTTPException(status_code=404, detail="running session not found")
    return session


@app.post("/api/sessions")
async def create_session(payload: CreateSessionRequest) -> dict[str, Any]:
    student = _require_active_student(payload.student_id)
    student_id = student["student_id"]
    experiment = db.get_experiment(payload.experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")
    
    # 清理同学生的旧 running session 及其容器
    old_sessions = db.list_sessions()
    for old in old_sessions:
        if old["student_id"] == student_id and old["status"] == "running":
            try:
                await docker_manager.stop(old)
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"清理旧实验环境失败：{exc}") from exc
            db.clear_session_runtime(old["id"])
            db.update_session_status(old["id"], "stopped")
            _clear_session_runtime_state(old["id"])
    
    session_id = f"{student_id}-{payload.experiment_id}-{uuid.uuid4().hex[:8]}"
    try:
        runtime = await docker_manager.start(
            session_id=session_id,
            student_id=student_id,
            experiment=experiment,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"启动实验环境失败：{exc}") from exc
    session = db.create_session(
        session_id=session_id,
        student_id=student_id,
        experiment_id=payload.experiment_id,
        container_id=runtime.container_id,
        container_name=runtime.container_name,
        terminal_url=runtime.terminal_url,
        runtime_mode=runtime.mode,
    )
    experiment = db.get_experiment(payload.experiment_id)
    if experiment:
        db.init_step_progress(session_id, experiment.get("task_config", {}).get("steps", []))
    return session


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str) -> dict[str, str]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    try:
        await docker_manager.stop(session)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"停止实验环境失败：{exc}") from exc
    db.update_session_status(session_id, "stopped")
    db.clear_session_runtime(session_id)
    _clear_session_runtime_state(session_id)
    return {"status": "stopped"}


@app.post("/api/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    try:
        await docker_manager.stop(session)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"停止旧实验环境失败：{exc}") from exc
    db.clear_session_runtime(session_id)
    _clear_session_runtime_state(session_id)

    experiment = db.get_experiment(session["experiment_id"])
    assert experiment is not None
    try:
        runtime = await docker_manager.start(
            session_id=session_id,
            student_id=session["student_id"],
            experiment=experiment,
        )
    except Exception as exc:
        db.update_session_status(session_id, "stopped")
        raise HTTPException(status_code=500, detail=f"重置实验环境失败：{exc}") from exc

    db.update_session_runtime(
        session_id,
        container_id=runtime.container_id,
        container_name=runtime.container_name,
        terminal_url=runtime.terminal_url,
        runtime_mode=runtime.mode,
    )
    if experiment:
        db.reset_step_progress(session_id, experiment.get("task_config", {}).get("steps", []))
    db.update_session_status(session_id, "running")
    refreshed = db.get_session(session_id)
    assert refreshed is not None
    return refreshed


@app.get("/api/sessions/{session_id}/steps")
async def get_steps(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    progress = db.get_step_progress(session_id)
    experiment = db.get_experiment(session["experiment_id"])
    steps = experiment.get("task_config", {}).get("steps", []) if experiment else []
    step_map = {s["id"]: s for s in steps}
    return {
        "progress": progress,
        "steps": [
            {
                "id": s["id"],
                "title": s.get("title", ""),
                "goal": s.get("goal", ""),
                "try_commands": s.get("try_commands", []),
                "coach_focus": s.get("coach_focus", ""),
            }
            for s in steps
        ],
    }


@app.post("/api/sessions/{session_id}/steps/{step_id}/confirm")
async def confirm_step(session_id: str, step_id: int) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    progress = db.get_step_progress(session_id)
    progress_map = {p["step_id"]: p for p in progress}
    current = progress_map.get(step_id)
    if not current:
        raise HTTPException(status_code=404, detail="step not found")
    if current["status"] != "completed":
        raise HTTPException(status_code=400, detail="step is not completed yet")
    next_step_id = db.get_next_step_id(session_id, step_id)
    db.confirm_step(session_id, step_id, next_step_id)
    updated_progress = db.get_step_progress(session_id)
    return {"status": "confirmed", "step_id": step_id, "next_step_id": next_step_id, "progress": updated_progress}


@app.get("/api/sessions/{session_id}/logs")
async def get_logs(session_id: str) -> dict[str, Any]:
    if not db.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return {
        "logs": db.list_terminal_logs(session_id),
        "ai_records": db.list_ai_records(session_id),
    }


@app.post("/api/sessions/{session_id}/simulate-terminal")
async def simulate_terminal(session_id: str, payload: SimulateTerminalRequest) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    output = log_processor.mock_command_output(payload.command)
    output_block = f"\n{output}" if output else ""
    content = f"student@lab:~$ {payload.command}{output_block}\nstudent@lab:~$"
    return await _ingest_terminal_event(
        session_id=session_id,
        content=content,
        source="mock-terminal",
    )


@app.post("/api/sessions/{session_id}/report")
async def generate_report(session_id: str) -> dict[str, Any]:
    if not db.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    report = report_service.generate(session_id)
    static_path = f"reports-static/{Path(report['html_path']).name}"
    report["url"] = urljoin(settings.backend_public_url.rstrip("/") + "/", static_path)
    if report.get("docx_path"):
        docx_static_path = f"reports-static/{Path(report['docx_path']).name}"
        report["docx_url"] = urljoin(settings.backend_public_url.rstrip("/") + "/", docx_static_path)
    return report


@app.get("/api/reports/{report_id}")
async def get_report(report_id: int) -> FileResponse:
    with db.connect() as conn:
        row = conn.execute("SELECT html_path FROM lab_report WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="report not found")
    return FileResponse(row["html_path"], media_type="text/html")


@app.get("/api/reports/{report_id}/docx")
async def get_report_docx(report_id: int) -> FileResponse:
    with db.connect() as conn:
        row = conn.execute("SELECT docx_path FROM lab_report WHERE id = ?", (report_id,)).fetchone()
    if not row or not row["docx_path"]:
        raise HTTPException(status_code=404, detail="docx report not found")
    return FileResponse(
        row["docx_path"],
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"report-{report_id}.docx",
    )


@app.websocket("/ws/ai-coach/{session_id}")
async def ai_coach_socket(websocket: WebSocket, session_id: str) -> None:
    await ws_manager.connect(session_id, websocket)
    try:
        await websocket.send_json({"type": "connected", "session_id": session_id})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(session_id, websocket)


@app.websocket("/ws/terminal-log")
async def terminal_log_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            session_id = payload.get("session_id")
            payload_type = payload.get("type", "terminal_stream")
            if not session_id:
                await websocket.send_json({"ok": False, "error": "session_id is required"})
                continue
            if payload_type == "command_event":
                result = await _ingest_command_event(session_id=session_id, payload=payload)
            else:
                content = payload.get("content", "")
                if not content:
                    await websocket.send_json({"ok": False, "error": "content is required"})
                    continue
                result = await _ingest_terminal_event(
                    session_id=session_id,
                    content=content,
                    source="container",
                    raw_payload=payload,
                )
            log = result.get("log")
            await websocket.send_json({"ok": True, "log_id": log["id"] if log else None})
    except WebSocketDisconnect:
        return


async def _check_step_progress(
    session_id: str,
    session: dict[str, Any],
    command_event: CommandEvent,
) -> dict[str, Any] | None:
    """检查当前 pending 步骤是否可以通过最新完整命令完成。"""
    progress = db.get_step_progress(session_id)
    pending = [p for p in progress if p["status"] == "pending"]
    if not pending:
        return None
    experiment = db.get_experiment(session["experiment_id"])
    if not experiment:
        return None
    steps = experiment.get("task_config", {}).get("steps", [])
    step_map = {s["id"]: s for s in steps}
    logs = db.list_terminal_logs(session_id, limit=50)
    log_contents = [log["clean_content"] for log in logs]
    stream_context = log_processor.clean(session_terminal_buffers.get(session_id, ""))
    if stream_context:
        log_contents.append(stream_context)

    # 线性推进：只检测最靠前的 pending 步骤；下一步由 confirm 接口解锁。
    item = sorted(pending, key=lambda p: p["step_id"])[0]
    step = step_map.get(item["step_id"])
    if not step:
        return None

    history_key = (session_id, step["id"])
    step_events = session_step_command_events.setdefault(history_key, [])
    step_events.append(command_event)

    verification_result = await verification_service.verify_step(
        session=session,
        step=step,
        command_event=command_event,
        terminal_logs=log_contents,
        command_events=step_events,
    )

    if verification_result["passed"]:
        detected_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        db.update_step_status(session_id, step["id"], "completed", detected_at)
        await ws_manager.send_json(
            session_id,
            {
                "type": "step_completed",
                "payload": {
                    "step_id": step["id"],
                    "title": step.get("title", ""),
                },
            },
        )
    return {"step": step, "verification_result": verification_result}


async def _ingest_terminal_event(
    *,
    session_id: str,
    content: str,
    source: str,
    raw_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    clean_content = log_processor.clean(content)
    if not clean_content:
        return {"log": None, "ai_record": None}
    raw_ref = _write_raw_log(session_id, content, source)
    log = db.add_terminal_log(session_id, clean_content=clean_content, raw_ref=raw_ref)
    await ws_manager.send_json(session_id, {"type": "terminal_log", "payload": log})

    should_parse_stream = source != "container" or (raw_payload or {}).get("type") != "terminal_stream"
    new_command_events: list[CommandEvent] = []
    if should_parse_stream:
        _append_terminal_buffer(session_id, content)
        new_command_events = _collect_new_command_events(session_id)

    for command_event in new_command_events:
        step_context = await _check_step_progress(session_id, session, command_event)
        asyncio.create_task(
            _analyze_async(
                session_id,
                session,
                command_event,
                current_step=(step_context or {}).get("step"),
                verification_result=(step_context or {}).get("verification_result"),
            )
        )

    return {
        "log": log,
        "ai_record": None,
        "status": "analyzing" if new_command_events else "recorded",
    }


async def _ingest_command_event(*, session_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    command = str(payload.get("command", "")).strip()
    if not command:
        return {"log": None, "ai_record": None, "status": "ignored"}
    output = str(payload.get("output", "") or "")
    exit_code = payload.get("exit_code")
    try:
        exit_code = int(exit_code) if exit_code is not None else None
    except (TypeError, ValueError):
        exit_code = None
    is_error = bool(payload.get("is_error")) or (exit_code not in (None, 0)) or bool(ERROR_RE.search(output))
    raw_context = f"{payload.get('cwd', '')}$ {command}\n{output}".strip()
    command_event = CommandEvent(
        command=command,
        output=output,
        is_error=is_error,
        raw_context=raw_context,
        trigger_reason="structured-command",
        cwd=str(payload.get("cwd", "") or ""),
        exit_code=exit_code,
        started_at=payload.get("started_at"),
        finished_at=payload.get("finished_at"),
        source=str(payload.get("source", "bash-hook")),
        confidence=str(payload.get("confidence", "high")),
    )
    raw_ref = _write_raw_log(session_id, json.dumps(payload, ensure_ascii=False), "command-event")
    await ws_manager.send_json(
        session_id,
        {
            "type": "command_event",
            "payload": {
                "session_id": session_id,
                "command": command_event.command,
                "cwd": command_event.cwd,
                "exit_code": command_event.exit_code,
                "is_error": command_event.is_error,
                "raw_ref": raw_ref,
            },
        },
    )
    step_context = await _check_step_progress(session_id, session, command_event)
    asyncio.create_task(
        _analyze_async(
            session_id,
            session,
            command_event,
            current_step=(step_context or {}).get("step"),
            verification_result=(step_context or {}).get("verification_result"),
        )
    )
    return {"log": None, "ai_record": None, "status": "analyzing"}


async def _analyze_async(
    session_id: str,
    session: dict[str, Any],
    command_event: CommandEvent,
    *,
    current_step: dict[str, Any] | None = None,
    verification_result: dict[str, Any] | None = None,
) -> None:
    """后台异步执行 AI 分析，结果通过 WebSocket 推送。"""
    if _is_duplicate_command_event(session_id, command_event):
        return

    experiment = db.get_experiment(session["experiment_id"])
    if not experiment:
        return

    await ws_manager.send_json(
        session_id,
        {
            "type": "ai_pending",
            "payload": {
                "session_id": session_id,
                "command": command_event.command,
                "trigger_reason": command_event.trigger_reason,
                "cwd": command_event.cwd,
                "exit_code": command_event.exit_code,
            },
        },
    )

    command_context = log_processor.command_context(
        command_event,
        current_step=current_step,
        verification_result=verification_result,
    )
    step_progress = db.get_step_progress(session_id)
    try:
        ai_text = await coach_provider.explain(
            experiment=experiment,
            command_context=command_context,
            knowledge_context=knowledge_base.load_context(session["experiment_id"]),
            step_progress=step_progress,
        )
    except Exception as exc:
        ai_text = (
            f"我已经看到你执行了 `{command_event.command}`，不过这次 AI 服务暂时没有成功返回：{exc}\n\n"
            "你可以先继续观察终端输出，按任务步骤往下做；这些日志已经保存，稍后仍然可以在记录里回看。"
        )
    ai_record = db.add_ai_record(session_id, command_context, ai_text)
    await ws_manager.send_json(session_id, {"type": "ai_coach", "payload": ai_record})


def _is_duplicate_command_event(session_id: str, command_event: Any) -> bool:
    fingerprint = log_processor.event_fingerprint(command_event)
    recent = recent_command_fingerprints.setdefault(session_id, [])
    if fingerprint in recent:
        return True
    recent.append(fingerprint)
    if len(recent) > 30:
        del recent[:-30]
    return False


def _append_terminal_buffer(session_id: str, content: str) -> str:
    existing = session_terminal_buffers.get(session_id, "")
    combined = f"{existing}{content}"
    if len(combined) > 20000:
        combined = combined[-20000:]
        first_newline = combined.find("\n")
        if first_newline >= 0:
            combined = combined[first_newline + 1 :]
    session_terminal_buffers[session_id] = combined
    return combined


def _collect_new_command_events(session_id: str) -> list[CommandEvent]:
    stream_context = log_processor.clean(session_terminal_buffers.get(session_id, ""))
    events = log_processor.parse_command_events(stream_context)
    processed_count = session_processed_event_counts.get(session_id, 0)
    if processed_count > len(events):
        processed_count = 0
    new_events = events[processed_count:]
    session_processed_event_counts[session_id] = len(events)
    return new_events


def _clear_session_runtime_state(session_id: str) -> None:
    recent_command_fingerprints.pop(session_id, None)
    session_terminal_buffers.pop(session_id, None)
    session_processed_event_counts.pop(session_id, None)
    stale_keys = [key for key in session_step_command_events if key[0] == session_id]
    for key in stale_keys:
        session_step_command_events.pop(key, None)


def _write_raw_log(session_id: str, content: str, source: str) -> str:
    safe_session = "".join(ch for ch in session_id if ch.isalnum() or ch in {"-", "_"})
    path = settings.raw_logs_dir / f"{safe_session}.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n--- {source} ---\n")
        handle.write(content)
        handle.write("\n")
    return str(path)
