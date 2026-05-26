import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app import main
from app.database import Database
from app.docker_manager import RuntimeInfo


STEPS = [
    {"id": 1, "title": "查看当前目录", "verify": {"commands": ["pwd"]}},
    {"id": 2, "title": "查看目录内容", "verify": {"commands": ["ls"]}},
]


class FakeDockerManager:
    def __init__(
        self,
        *,
        start_result: RuntimeInfo | None = None,
        start_error: Exception | None = None,
        stop_error: Exception | None = None,
    ) -> None:
        self.start_result = start_result or RuntimeInfo(
            mode="docker",
            container_id="new-container-id",
            container_name="linux-ai-new",
            terminal_url="http://localhost:22222",
        )
        self.start_error = start_error
        self.stop_error = stop_error
        self.started: list[dict] = []
        self.stopped: list[dict] = []

    async def stop(self, session: dict) -> None:
        self.stopped.append(session)
        if self.stop_error:
            raise self.stop_error

    async def start(self, *, session_id: str, student_id: str, experiment: dict) -> RuntimeInfo:
        self.started.append(
            {
                "session_id": session_id,
                "student_id": student_id,
                "experiment_id": experiment["id"],
            }
        )
        if self.start_error:
            raise self.start_error
        return self.start_result


class FakeDiagnosticsDockerManager:
    async def preflight(self, experiments: list[dict]) -> dict:
        return {
            "runtime": "docker",
            "terminal_event_ws_url": "ws://host.docker.internal:8001/ws/terminal-log",
            "warnings": ["diagnostic warning"],
            "images": [{"name": item["image_name"], "exists": True} for item in experiments],
        }


def prepare_database(tmp_path: Path) -> Database:
    db = Database(tmp_path / "linux_ai_lab.db")
    db.initialize()
    db.upsert_experiment(
        {
            "experiment_id": "file-basic",
            "name": "Linux 文件管理基础实验",
            "system": "openEuler",
            "image_name": "linux-ai-exp:test",
            "status": "active",
            "steps": STEPS,
        }
    )
    return db


def create_running_session(db: Database, session_id: str = "session-1") -> dict:
    session = db.create_session(
        session_id=session_id,
        student_id="stu001",
        experiment_id="file-basic",
        container_id="old-container-id",
        container_name="linux-ai-old",
        terminal_url="http://localhost:11111",
        runtime_mode="docker",
    )
    db.init_step_progress(session_id, STEPS)
    return session


def test_stop_session_removes_container_and_clears_runtime(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    create_running_session(db)
    fake_docker = FakeDockerManager()
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(main, "docker_manager", fake_docker)

    result = asyncio.run(main.stop_session("session-1"))

    session = db.get_session("session-1")
    assert result == {"status": "stopped"}
    assert fake_docker.stopped[0]["container_name"] == "linux-ai-old"
    assert session is not None
    assert session["status"] == "stopped"
    assert session["container_id"] is None
    assert session["container_name"] is None
    assert session["terminal_url"] is None


def test_reset_session_recreates_container_and_resets_steps(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    create_running_session(db)
    db.update_step_status("session-1", 1, "completed", "2026-05-25T00:00:00Z")
    fake_docker = FakeDockerManager()
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(main, "docker_manager", fake_docker)

    refreshed = asyncio.run(main.reset_session("session-1"))
    progress = db.get_step_progress("session-1")

    assert fake_docker.stopped[0]["container_name"] == "linux-ai-old"
    assert fake_docker.started == [
        {
            "session_id": "session-1",
            "student_id": "stu001",
            "experiment_id": "file-basic",
        }
    ]
    assert refreshed["status"] == "running"
    assert refreshed["container_id"] == "new-container-id"
    assert refreshed["container_name"] == "linux-ai-new"
    assert refreshed["terminal_url"] == "http://localhost:22222"
    assert [item["status"] for item in progress] == ["pending", "locked"]
    assert all(item["detected_at"] is None for item in progress)


def test_reset_session_start_failure_stops_session_and_clears_runtime(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    create_running_session(db)
    fake_docker = FakeDockerManager(start_error=RuntimeError("docker run failed"))
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(main, "docker_manager", fake_docker)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(main.reset_session("session-1"))

    session = db.get_session("session-1")
    assert exc_info.value.status_code == 500
    assert "docker run failed" in str(exc_info.value.detail)
    assert session is not None
    assert session["status"] == "stopped"
    assert session["container_id"] is None
    assert session["container_name"] is None
    assert session["terminal_url"] is None


def test_get_current_session_returns_latest_running_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    create_running_session(db, "session-old")
    latest = create_running_session(db, "session-latest")
    with db.connect() as conn:
        conn.execute(
            "UPDATE lab_session SET start_time = ? WHERE id = ?",
            ("2026-05-26T11:00:00Z", "session-old"),
        )
        conn.execute(
            "UPDATE lab_session SET start_time = ? WHERE id = ?",
            ("2026-05-26T12:00:00Z", latest["id"]),
        )
    monkeypatch.setattr(main, "db", db)

    result = asyncio.run(main.get_current_session(student_id="stu001", experiment_id="file-basic"))

    assert result["id"] == latest["id"]
    assert result["status"] == "running"
    assert result["terminal_url"] == "http://localhost:11111"


def test_get_current_session_ignores_stopped_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    create_running_session(db)
    db.update_session_status("session-1", "stopped")
    monkeypatch.setattr(main, "db", db)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(main.get_current_session(student_id="stu001", experiment_id="file-basic"))

    assert exc_info.value.status_code == 404


def test_health_exposes_terminal_event_ws_diagnostics(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(main, "docker_manager", FakeDiagnosticsDockerManager())

    result = asyncio.run(main.health())

    assert result["terminal_event_ws_url"] == "ws://host.docker.internal:8001/ws/terminal-log"
    assert result["warnings"] == ["diagnostic warning"]
    assert result["docker"]["terminal_event_ws_url"] == "ws://host.docker.internal:8001/ws/terminal-log"
