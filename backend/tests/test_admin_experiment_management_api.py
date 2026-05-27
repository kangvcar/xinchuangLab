import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

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


def test_admin_save_experiment_preserves_command_set_verification(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    monkeypatch.setattr(main, "db", db)

    saved = asyncio.run(
        main.admin_save_experiment(
            {
                "experiment_id": "command-set-lab",
                "name": "Command Set Lab",
                "system": "openEuler",
                "image_name": "linux-ai-exp:command-set-lab",
                "steps": [
                    {
                        "id": 1,
                        "title": "识别当前用户",
                        "goal": "确认身份",
                        "try_commands": ["whoami", "id"],
                        "verification": {
                            "mode": "all",
                            "checks": [{"type": "command_set", "commands": ["whoami", "id"]}],
                        },
                    }
                ],
            },
            _admin=None,
        )
    )

    checks = saved["task_config"]["steps"][0]["verification"]["checks"]
    assert checks == [{"type": "command_set", "commands": ["whoami", "id"]}]


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


def test_admin_experiment_list_excludes_deleted_by_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    upsert_experiment(db, "draft-lab", "draft")
    upsert_experiment(db, "published-lab", "published")
    upsert_experiment(db, "deleted-lab", "inactive")
    monkeypatch.setattr(main, "db", db)

    result = asyncio.run(main.admin_list_experiments(_admin=None))

    assert [item["id"] for item in result] == ["draft-lab", "published-lab"]


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


def test_admin_reorder_experiments_controls_teacher_and_student_order(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    upsert_experiment(db, "linux-system", "published")
    upsert_experiment(db, "linux-files", "published")
    upsert_experiment(db, "linux-network", "published")
    monkeypatch.setattr(main, "db", db)

    result = asyncio.run(
        main.admin_reorder_experiments(
            {"experiment_ids": ["linux-network", "linux-system", "linux-files"]},
            _admin=None,
        )
    )

    assert result["experiment_ids"] == ["linux-network", "linux-system", "linux-files"]
    assert [item["id"] for item in asyncio.run(main.admin_list_experiments(_admin=None))] == [
        "linux-network",
        "linux-system",
        "linux-files",
    ]
    assert [item["id"] for item in asyncio.run(main.list_experiments())] == [
        "linux-network",
        "linux-system",
        "linux-files",
    ]


def test_admin_student_roster_controls_student_login(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    monkeypatch.setattr(main, "db", db)

    saved = asyncio.run(main.admin_save_student({"student_id": "2026001", "name": "学生A"}, _admin=None))
    login = asyncio.run(main.student_login({"student_id": "2026001"}))
    students = asyncio.run(main.admin_list_students(_admin=None))

    assert saved["student_id"] == "2026001"
    assert login["student_id"] == "2026001"
    assert [item["student_id"] for item in students] == ["2026001"]

    result = asyncio.run(main.admin_delete_student("2026001", _admin=None))
    assert result == {"status": "deleted", "student_id": "2026001"}

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(main.student_login({"student_id": "2026001"}))

    assert exc_info.value.status_code == 403


def test_admin_import_students_file_creates_updates_and_reports_invalid_rows(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = prepare_database(tmp_path)
    db.upsert_student("2026001", "旧姓名", status="inactive")
    monkeypatch.setattr(main, "db", db)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/students/import-file",
        headers={"X-Admin-Password": "linuxai"},
        files={
            "file": (
                "students.txt",
                "2026001,张三\n2026002,李四\n2026002,李四同学\n\nbad-line\n".encode("utf-8"),
                "text/plain",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["created"] == 1
    assert payload["updated"] == 1
    assert payload["skipped"] == 1
    assert "第 3 行学号 2026002 重复，已使用最后一次" in payload["warnings"]
    assert "第 5 行格式错误，应为：学号,姓名" in payload["warnings"]

    students = {item["student_id"]: item for item in db.list_students()}
    assert students["2026001"]["name"] == "张三"
    assert students["2026001"]["status"] == "active"
    assert students["2026002"]["name"] == "李四同学"
    assert students["2026002"]["status"] == "active"
