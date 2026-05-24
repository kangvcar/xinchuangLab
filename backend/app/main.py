from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .ai_provider import CoachProvider, create_coach_provider
from .config import settings
from .database import Database
from .docker_manager import DockerManager
from .experiments import sync_experiments
from .knowledge import KnowledgeBase
from .log_processor import LogProcessor
from .report_service import ReportService
from .schemas import ConfirmStepRequest, CreateSessionRequest, SimulateTerminalRequest
from .step_verifier import StepVerifier
from .websocket_manager import WebSocketManager


db = Database(settings.database_path)
docker_manager = DockerManager(settings)
log_processor = LogProcessor()
knowledge_base = KnowledgeBase(settings.knowledge_dir)
coach_provider: CoachProvider = create_coach_provider(settings)
ws_manager = WebSocketManager()
report_service = ReportService(db, settings.reports_dir)
verifier = StepVerifier()
recent_command_fingerprints: dict[str, list[str]] = {}
session_terminal_buffers: dict[str, str] = {}

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
app.mount("/reports-static", StaticFiles(directory=settings.reports_dir), name="reports-static")


@app.on_event("startup")
async def startup() -> None:
    db.initialize()
    sync_experiments(db, settings.experiments_dir)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "runtime": settings.lab_runtime,
        "allow_mock_fallback": settings.allow_mock_fallback,
        "ai_mode": settings.ai_mode,
        "ai_provider": coach_provider.name,
        "deepseek_configured": bool(settings.deepseek_api_key),
    }


@app.get("/api/experiments")
async def list_experiments() -> list[dict[str, Any]]:
    return db.list_experiments()


@app.get("/api/sessions")
async def list_sessions() -> list[dict[str, Any]]:
    return db.list_sessions()


@app.post("/api/sessions")
async def create_session(payload: CreateSessionRequest) -> dict[str, Any]:
    experiment = db.get_experiment(payload.experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="experiment not found")
    
    # 清理同学生的旧 running session 及其容器
    old_sessions = db.list_sessions()
    for old in old_sessions:
        if old["student_id"] == payload.student_id and old["status"] == "running":
            try:
                await docker_manager.stop(old)
            except Exception:
                pass  # 旧容器可能已不存在，忽略错误
            db.update_session_status(old["id"], "stopped")
    
    session_id = f"{payload.student_id}-{payload.experiment_id}-{uuid.uuid4().hex[:8]}"
    runtime = await docker_manager.start(
        session_id=session_id,
        student_id=payload.student_id,
        experiment=experiment,
    )
    session = db.create_session(
        session_id=session_id,
        student_id=payload.student_id,
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
    await docker_manager.stop(session)
    db.update_session_status(session_id, "stopped")
    return {"status": "stopped"}


@app.post("/api/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, Any]:
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    await docker_manager.stop(session)
    db.update_session_status(session_id, "reset")
    experiment = db.get_experiment(session["experiment_id"])
    assert experiment is not None
    runtime = await docker_manager.start(
        session_id=session_id,
        student_id=session["student_id"],
        experiment=experiment,
    )
    db.update_session_status(session_id, "running")
    if experiment:
        db.reset_step_progress(session_id, experiment.get("task_config", {}).get("steps", []))
    with db.connect() as conn:
        conn.execute(
            """
            UPDATE lab_session
            SET container_id = ?, container_name = ?, terminal_url = ?, runtime_mode = ?
            WHERE id = ?
            """,
            (runtime.container_id, runtime.container_name, runtime.terminal_url, runtime.mode, session_id),
        )
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
                "hint": s.get("hint", ""),
                "goal": s.get("goal", ""),
                "try_commands": s.get("try_commands", []),
                "success_hint": s.get("success_hint", ""),
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
    content = f"student@lab:~$ {payload.command}\n{output}".strip()
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
    report["url"] = f"/reports-static/{Path(report['html_path']).name}"
    return report


@app.get("/api/reports/{report_id}")
async def get_report(report_id: int) -> FileResponse:
    with db.connect() as conn:
        row = conn.execute("SELECT html_path FROM lab_report WHERE id = ?", (report_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="report not found")
    return FileResponse(row["html_path"], media_type="text/html")


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
            content = payload.get("content", "")
            if not session_id or not content:
                await websocket.send_json({"ok": False, "error": "session_id and content are required"})
                continue
            result = await _ingest_terminal_event(
                session_id=session_id,
                content=content,
                source="container",
                raw_payload=payload,
            )
            await websocket.send_json({"ok": True, "log_id": result["log"]["id"]})
    except WebSocketDisconnect:
        return


async def _check_step_progress(session_id: str, session: dict[str, Any]) -> None:
    """检查当前 pending 步骤是否可以通过最新终端内容完成。
    
    使用累积终端缓冲区解析命令，解决 ttyd 按字符分块发送导致
    单条消息无法完整解析命令的问题。
    """
    progress = db.get_step_progress(session_id)
    pending = [p for p in progress if p["status"] == "pending"]
    if not pending:
        return
    experiment = db.get_experiment(session["experiment_id"])
    if not experiment:
        return
    steps = experiment.get("task_config", {}).get("steps", [])
    step_map = {s["id"]: s for s in steps}
    logs = db.list_terminal_logs(session_id, limit=50)
    log_contents = [log["clean_content"] for log in logs]
    # 使用累积终端缓冲区解析最新命令事件
    stream_context = log_processor.clean(session_terminal_buffers.get(session_id, ""))
    if stream_context:
        log_contents.append(stream_context)
    command_event = log_processor.parse_command_event(stream_context)
    for item in pending:
        step = step_map.get(item["step_id"])
        if not step:
            continue
        if verifier.verify(step, command_event, log_contents):
            detected_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
            db.update_step_status(session_id, step["id"], "completed", detected_at)
            # 自动解锁下一步为 pending
            next_step_id = db.get_next_step_id(session_id, step["id"])
            if next_step_id is not None:
                db.update_step_status(session_id, next_step_id, "pending")
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
            break


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

    # 先累积终端缓冲区，再用累积内容检查步骤
    # （ttyd 按字符分块发送，单条消息可能不完整）
    _append_terminal_buffer(session_id, content)
    await _check_step_progress(session_id, session)

    # AI 分析异步执行，不阻塞 API 响应
    asyncio.create_task(_analyze_async(session_id, session, content))

    return {"log": log, "ai_record": None, "status": "analyzing"}


async def _analyze_async(session_id: str, session: dict[str, Any], content: str) -> None:
    """后台异步执行 AI 分析，结果通过 WebSocket 推送。"""
    stream_context = log_processor.clean(_append_terminal_buffer(session_id, content))
    command_event = log_processor.parse_command_event(stream_context)
    if not command_event or _is_duplicate_command_event(session_id, command_event):
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
            },
        },
    )

    command_context = log_processor.command_context(command_event)
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


def _write_raw_log(session_id: str, content: str, source: str) -> str:
    safe_session = "".join(ch for ch in session_id if ch.isalnum() or ch in {"-", "_"})
    path = settings.raw_logs_dir / f"{safe_session}.log"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n--- {source} ---\n")
        handle.write(content)
        handle.write("\n")
    return str(path)
