from dataclasses import replace

from fastapi.testclient import TestClient

from app import main


ADMIN_HEADERS = {"X-Admin-Password": "linuxai"}


def test_import_file_endpoint_accepts_markdown(monkeypatch) -> None:
    async def fake_design(*, text: str, filename: str, settings):
        return {
            "draft": {
                "experiment_id": "demo",
                "name": "Demo",
                "system": "openEuler",
                "image_name": "",
                "objective": "练习导入",
                "schema_version": 2,
                "steps": [{"id": 1, "title": "查看目录"}],
            },
            "source": "deepseek",
            "warnings": [],
            "raw_output": "{}",
        }

    monkeypatch.setattr(main, "design_experiment_from_document", fake_design)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
        headers=ADMIN_HEADERS,
        files={"file": ("demo.md", b"# Demo\n\npwd", "text/markdown")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "deepseek"
    assert payload["draft"]["experiment_id"] == "demo"


def test_import_file_endpoint_rule_fallback_returns_draft_status(monkeypatch) -> None:
    monkeypatch.setattr(main, "settings", replace(main.settings, deepseek_api_key="", ai_mode="auto"))
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
    monkeypatch.setattr(main, "settings", replace(main.settings, deepseek_api_key="", ai_mode="auto"))
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


def test_import_file_endpoint_rejects_unknown_extension() -> None:
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
        headers=ADMIN_HEADERS,
        files={"file": ("demo.pdf", b"%PDF", "application/pdf")},
    )

    assert response.status_code == 400
    assert "仅支持" in response.json()["detail"]


def test_import_file_endpoint_returns_diagnostic_payload_for_ai_normalize_failure(
    monkeypatch,
) -> None:
    async def fake_design(*, text: str, filename: str, settings):
        return {
            "draft": None,
            "source": "deepseek",
            "warnings": ["AI 草稿规范化失败：bad step id"],
            "raw_output": '{"steps":[{"id":"step1"}]}',
        }

    monkeypatch.setattr(main, "design_experiment_from_document", fake_design)
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
        headers=ADMIN_HEADERS,
        files={"file": ("demo.md", b"# Demo\n\npwd", "text/markdown")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["draft"] is None
    assert "AI 草稿规范化失败" in payload["warnings"][0]
    assert "step1" in payload["raw_output"]


def test_admin_endpoint_requires_teacher_password() -> None:
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
        files={"file": ("demo.md", b"# Demo\n\npwd", "text/markdown")},
    )

    assert response.status_code == 401
    assert "教师端密码错误" in response.json()["detail"]


def test_admin_auth_accepts_teacher_password() -> None:
    client = TestClient(main.app)

    response = client.post("/api/admin/auth", json={"password": "linuxai"})

    assert response.status_code == 200
    assert response.json() == {"ok": True}
