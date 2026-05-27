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
