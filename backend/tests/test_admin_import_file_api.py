from fastapi.testclient import TestClient

from app import main


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
        files={"file": ("demo.md", b"# Demo\n\npwd", "text/markdown")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "deepseek"
    assert payload["draft"]["experiment_id"] == "demo"


def test_import_file_endpoint_rejects_unknown_extension() -> None:
    client = TestClient(main.app)

    response = client.post(
        "/api/admin/experiments/import-file",
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
        files={"file": ("demo.md", b"# Demo\n\npwd", "text/markdown")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["draft"] is None
    assert "AI 草稿规范化失败" in payload["warnings"][0]
    assert "step1" in payload["raw_output"]
