from __future__ import annotations

import uuid
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
from .schemas import CreateSessionRequest, SimulateTerminalRequest
from .websocket_manager import WebSocketManager


db = Database(settings.database_path)
docker_manager = DockerManager(settings)
log_processor = LogProcessor()
knowledge_base = KnowledgeBase(settings.knowledge_dir)
coach_provider: CoachProvider = create_coach_provider(settings)
ws_manager = WebSocketManager()
report_service = ReportService(db, settings.reports_dir)
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
    ai_record = None
    stream_context = log_processor.clean(_append_terminal_buffer(session_id, content))
    command_event = log_processor.parse_command_event(stream_context)
    if command_event and not _is_duplicate_command_event(session_id, command_event):
        experiment = db.get_experiment(session["experiment_id"])
        if experiment:
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
            try:
                ai_text = await coach_provider.explain(
                    experiment=experiment,
                    command_context=command_context,
                    knowledge_context=knowledge_base.load_context(session["experiment_id"]),
                )
            except Exception as exc:
                ai_text = (
                    f"我已经看到你执行了 `{command_event.command}`，不过这次 AI 服务暂时没有成功返回：{exc}\n\n"
                    "你可以先继续观察终端输出，按任务步骤往下做；这些日志已经保存，稍后仍然可以在记录里回看。"
                )
            ai_record = db.add_ai_record(session_id, command_context, ai_text)
            await ws_manager.send_json(session_id, {"type": "ai_coach", "payload": ai_record})
    return {"log": log, "ai_record": ai_record}


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
