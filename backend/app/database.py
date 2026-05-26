from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS experiment (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    system_type TEXT NOT NULL,
                    image_name TEXT NOT NULL,
                    task_config TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active'
                );

                CREATE TABLE IF NOT EXISTS lab_session (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    experiment_id TEXT NOT NULL,
                    container_id TEXT,
                    container_name TEXT,
                    terminal_url TEXT,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    status TEXT NOT NULL,
                    runtime_mode TEXT NOT NULL,
                    FOREIGN KEY (experiment_id) REFERENCES experiment(id)
                );

                CREATE TABLE IF NOT EXISTS terminal_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    raw_ref TEXT,
                    clean_content TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES lab_session(id)
                );

                CREATE TABLE IF NOT EXISTS ai_coach_record (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    command_context TEXT NOT NULL,
                    ai_response TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES lab_session(id)
                );

                CREATE TABLE IF NOT EXISTS lab_report (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    markdown_path TEXT NOT NULL,
                    html_path TEXT NOT NULL,
                    pdf_path TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES lab_session(id)
                );

                CREATE TABLE IF NOT EXISTS step_progress (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    step_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'locked',
                    detected_at TEXT,
                    confirmed_at TEXT,
                    UNIQUE(session_id, step_id)
                );

                CREATE TABLE IF NOT EXISTS experiment_build (
                    id TEXT PRIMARY KEY,
                    experiment_id TEXT NOT NULL,
                    image_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    logs TEXT NOT NULL DEFAULT '',
                    error TEXT,
                    dockerfile TEXT NOT NULL,
                    draft_config TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    finished_at TEXT
                );
                """
            )

    def init_step_progress(self, session_id: str, steps: list[dict[str, Any]]) -> None:
        """初始化会话的步骤进度；按 step.id 排序，第一个为 pending，其余为 locked。"""
        sorted_steps = sorted(steps, key=lambda s: s["id"])
        with self.connect() as conn:
            for i, step in enumerate(sorted_steps):
                status = "pending" if i == 0 else "locked"
                conn.execute(
                    """
                    INSERT INTO step_progress (session_id, step_id, status, detected_at, confirmed_at)
                    VALUES (?, ?, ?, NULL, NULL)
                    ON CONFLICT(session_id, step_id) DO NOTHING
                    """,
                    (session_id, step["id"], status),
                )

    def reset_step_progress(self, session_id: str, steps: list[dict[str, Any]]) -> None:
        """重置会话的步骤进度；先删除旧记录，再重新初始化。"""
        with self.connect() as conn:
            conn.execute("DELETE FROM step_progress WHERE session_id = ?", (session_id,))
        self.init_step_progress(session_id, steps)

    def get_step_progress(self, session_id: str) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT step_id, status, detected_at, confirmed_at
                FROM step_progress
                WHERE session_id = ?
                ORDER BY step_id
                """,
                (session_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def update_step_status(
        self,
        session_id: str,
        step_id: int,
        status: str,
        detected_at: str | None = None,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE step_progress
                SET status = ?, detected_at = COALESCE(?, detected_at)
                WHERE session_id = ? AND step_id = ?
                """,
                (status, detected_at, session_id, step_id),
            )

    def confirm_step(self, session_id: str, step_id: int, next_step_id: int | None = None) -> None:
        confirmed_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE step_progress
                SET status = 'confirmed', confirmed_at = ?
                WHERE session_id = ? AND step_id = ?
                """,
                (confirmed_at, session_id, step_id),
            )
            if next_step_id is not None:
                conn.execute(
                    """
                    UPDATE step_progress
                    SET status = 'pending'
                    WHERE session_id = ? AND step_id = ? AND status = 'locked'
                    """,
                    (session_id, next_step_id),
                )

    def upsert_experiment(self, config: dict[str, Any]) -> None:
        experiment_id = config["experiment_id"]
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO experiment (id, name, system_type, image_name, task_config, status)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    system_type = excluded.system_type,
                    image_name = excluded.image_name,
                    task_config = excluded.task_config,
                    status = excluded.status
                """,
                (
                    experiment_id,
                    config["name"],
                    config.get("system", "openEuler"),
                    config.get("image_name", ""),
                    json.dumps(config, ensure_ascii=False),
                    config.get("status", "active"),
                ),
            )

    def list_experiments(self, *, active_only: bool = False) -> list[dict[str, Any]]:
        with self.connect() as conn:
            if active_only:
                rows = conn.execute(
                    "SELECT id, name, system_type, image_name, task_config, status FROM experiment WHERE status = 'active' ORDER BY id"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, name, system_type, image_name, task_config, status FROM experiment ORDER BY id"
                ).fetchall()
        return [self._experiment_row(row) for row in rows]

    def get_experiment(self, experiment_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT id, name, system_type, image_name, task_config, status FROM experiment WHERE id = ?",
                (experiment_id,),
            ).fetchone()
        return self._experiment_row(row) if row else None

    def create_session(
        self,
        *,
        session_id: str,
        student_id: str,
        experiment_id: str,
        container_id: str | None,
        container_name: str | None,
        terminal_url: str | None,
        runtime_mode: str,
    ) -> dict[str, Any]:
        started_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO lab_session
                    (id, student_id, experiment_id, container_id, container_name, terminal_url, start_time, status, runtime_mode)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
                """,
                (
                    session_id,
                    student_id,
                    experiment_id,
                    container_id,
                    container_name,
                    terminal_url,
                    started_at,
                    runtime_mode,
                ),
            )
        session = self.get_session(session_id)
        assert session is not None
        return session

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT s.*, e.name AS experiment_name, e.system_type, e.image_name, e.task_config
                FROM lab_session s
                JOIN experiment e ON e.id = s.experiment_id
                WHERE s.id = ?
                """,
                (session_id,),
            ).fetchone()
        return self._session_row(row) if row else None

    def list_sessions(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT s.*, e.name AS experiment_name, e.system_type, e.image_name, e.task_config
                FROM lab_session s
                JOIN experiment e ON e.id = s.experiment_id
                ORDER BY s.start_time DESC
                LIMIT 100
                """
            ).fetchall()
        return [self._session_row(row) for row in rows]

    def get_latest_running_session(
        self,
        *,
        student_id: str,
        experiment_id: str | None = None,
    ) -> dict[str, Any] | None:
        filters = ["s.student_id = ?", "s.status = 'running'"]
        params: list[Any] = [student_id]
        if experiment_id:
            filters.append("s.experiment_id = ?")
            params.append(experiment_id)
        where_clause = " AND ".join(filters)
        with self.connect() as conn:
            row = conn.execute(
                f"""
                SELECT s.*, e.name AS experiment_name, e.system_type, e.image_name, e.task_config
                FROM lab_session s
                JOIN experiment e ON e.id = s.experiment_id
                WHERE {where_clause}
                ORDER BY s.start_time DESC
                LIMIT 1
                """,
                params,
            ).fetchone()
        return self._session_row(row) if row else None

    def update_session_status(self, session_id: str, status: str) -> None:
        ended_at = datetime.utcnow().isoformat(timespec="seconds") + "Z" if status != "running" else None
        with self.connect() as conn:
            conn.execute(
                "UPDATE lab_session SET status = ?, end_time = ? WHERE id = ?",
                (status, ended_at, session_id),
            )

    def update_session_runtime(
        self,
        session_id: str,
        *,
        container_id: str | None,
        container_name: str | None,
        terminal_url: str | None,
        runtime_mode: str,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE lab_session
                SET container_id = ?, container_name = ?, terminal_url = ?, runtime_mode = ?
                WHERE id = ?
                """,
                (container_id, container_name, terminal_url, runtime_mode, session_id),
            )

    def clear_session_runtime(self, session_id: str) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE lab_session
                SET container_id = NULL, container_name = NULL, terminal_url = NULL
                WHERE id = ?
                """,
                (session_id,),
            )

    def add_terminal_log(self, session_id: str, clean_content: str, raw_ref: str | None = None) -> dict[str, Any]:
        timestamp = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO terminal_log (session_id, timestamp, raw_ref, clean_content)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, timestamp, raw_ref, clean_content),
            )
            log_id = cursor.lastrowid
        return {
            "id": log_id,
            "session_id": session_id,
            "timestamp": timestamp,
            "raw_ref": raw_ref,
            "clean_content": clean_content,
        }

    def list_terminal_logs(self, session_id: str, limit: int = 200) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, session_id, timestamp, raw_ref, clean_content
                FROM terminal_log
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def add_ai_record(self, session_id: str, command_context: str, ai_response: str) -> dict[str, Any]:
        created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO ai_coach_record (session_id, command_context, ai_response, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, command_context, ai_response, created_at),
            )
            record_id = cursor.lastrowid
        return {
            "id": record_id,
            "session_id": session_id,
            "command_context": command_context,
            "ai_response": ai_response,
            "created_at": created_at,
        }

    def list_ai_records(self, session_id: str, limit: int = 200) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, session_id, command_context, ai_response, created_at
                FROM ai_coach_record
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (session_id, limit),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def add_report(self, session_id: str, markdown_path: Path, html_path: Path, pdf_path: Path | None = None) -> dict[str, Any]:
        created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO lab_report (session_id, markdown_path, html_path, pdf_path, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, str(markdown_path), str(html_path), str(pdf_path) if pdf_path else None, created_at),
            )
            report_id = cursor.lastrowid
        return {
            "id": report_id,
            "session_id": session_id,
            "markdown_path": str(markdown_path),
            "html_path": str(html_path),
            "pdf_path": str(pdf_path) if pdf_path else None,
            "created_at": created_at,
        }

    def get_next_step_id(self, session_id: str, current_step_id: int) -> int | None:
        """获取当前步骤之后下一个 locked 或 pending 的 step_id。"""
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT step_id FROM step_progress
                WHERE session_id = ? AND step_id > ?
                ORDER BY step_id
                LIMIT 1
                """,
                (session_id, current_step_id),
            ).fetchone()
        return row["step_id"] if row else None

    def create_experiment_build(
        self,
        *,
        build_id: str,
        experiment_id: str,
        image_name: str,
        dockerfile: str,
        draft_config: dict[str, Any],
    ) -> dict[str, Any]:
        created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO experiment_build
                    (id, experiment_id, image_name, status, logs, error, dockerfile, draft_config, created_at, finished_at)
                VALUES (?, ?, ?, 'queued', '', NULL, ?, ?, ?, NULL)
                """,
                (
                    build_id,
                    experiment_id,
                    image_name,
                    dockerfile,
                    json.dumps(draft_config, ensure_ascii=False),
                    created_at,
                ),
            )
        build = self.get_experiment_build(build_id)
        assert build is not None
        return build

    def get_experiment_build(self, build_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, experiment_id, image_name, status, logs, error, dockerfile, draft_config, created_at, finished_at
                FROM experiment_build
                WHERE id = ?
                """,
                (build_id,),
            ).fetchone()
        return self._experiment_build_row(row) if row else None

    def list_unfinished_experiment_builds(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, experiment_id, image_name, status, logs, error, dockerfile, draft_config, created_at, finished_at
                FROM experiment_build
                WHERE status IN ('queued', 'running')
                ORDER BY created_at
                """
            ).fetchall()
        return [self._experiment_build_row(row) for row in rows]

    def set_experiment_build_status(
        self,
        build_id: str,
        status: str,
        *,
        error: str | None = None,
        finished: bool = False,
    ) -> None:
        finished_at = datetime.utcnow().isoformat(timespec="seconds") + "Z" if finished else None
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE experiment_build
                SET status = ?,
                    error = ?,
                    finished_at = COALESCE(?, finished_at)
                WHERE id = ?
                """,
                (status, error, finished_at, build_id),
            )

    def append_experiment_build_log(self, build_id: str, line: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE experiment_build SET logs = logs || ? WHERE id = ?",
                (line, build_id),
            )

    def _experiment_row(self, row: sqlite3.Row) -> dict[str, Any]:
        task_config = json.loads(row["task_config"])
        return {
            "id": row["id"],
            "name": row["name"],
            "system_type": row["system_type"],
            "image_name": row["image_name"],
            "task_config": task_config,
            "status": row["status"],
        }

    def _session_row(self, row: sqlite3.Row) -> dict[str, Any]:
        task_config = json.loads(row["task_config"])
        return {
            "id": row["id"],
            "student_id": row["student_id"],
            "experiment_id": row["experiment_id"],
            "experiment_name": row["experiment_name"],
            "system_type": row["system_type"],
            "image_name": row["image_name"],
            "task_config": task_config,
            "container_id": row["container_id"],
            "container_name": row["container_name"],
            "terminal_url": row["terminal_url"],
            "start_time": row["start_time"],
            "end_time": row["end_time"],
            "status": row["status"],
            "runtime_mode": row["runtime_mode"],
        }

    def _experiment_build_row(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "build_id": row["id"],
            "experiment_id": row["experiment_id"],
            "image_name": row["image_name"],
            "status": row["status"],
            "logs": row["logs"],
            "error": row["error"],
            "dockerfile": row["dockerfile"],
            "draft_config": json.loads(row["draft_config"]),
            "created_at": row["created_at"],
            "finished_at": row["finished_at"],
        }
