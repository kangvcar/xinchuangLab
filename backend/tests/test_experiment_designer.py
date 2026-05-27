import asyncio
from types import SimpleNamespace

from app import experiment_designer as designer
from app.experiment_designer import (
    ExperimentDesignError,
    _build_prompt,
    design_experiment_from_document,
    normalize_experiment_draft,
    normalize_experiment_draft_with_warnings,
    normalize_container_spec,
    parse_ai_json,
)


def settings(*, api_key: str = "", ai_mode: str = "auto") -> SimpleNamespace:
    return SimpleNamespace(
        ai_mode=ai_mode,
        deepseek_api_key=api_key,
        deepseek_model="deepseek-chat",
        deepseek_base_url="https://api.deepseek.com",
    )


def test_parse_ai_json_accepts_fenced_json() -> None:
    parsed = parse_ai_json('```json\n{"experiment_id":"demo","steps":[{"title":"查看目录"}]}\n```')

    assert parsed["experiment_id"] == "demo"
    assert parsed["steps"][0]["title"] == "查看目录"


def test_parse_ai_json_failure_keeps_raw_output() -> None:
    raw_output = "这里不是 JSON"

    try:
        parse_ai_json(raw_output)
    except ExperimentDesignError as exc:
        assert "不是合法 JSON" in str(exc)
        assert exc.raw_output == raw_output
    else:
        raise AssertionError("Expected ExperimentDesignError")


def test_normalize_experiment_draft_outputs_v2_schema() -> None:
    draft = normalize_experiment_draft(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "objective": "练习 pwd",
            "steps": [
                {
                    "title": "查看当前目录",
                    "try_commands": ["pwd"],
                    "verification": {"checks": [{"type": "command_match", "commands": ["pwd"]}]},
                }
            ],
        }
    )

    assert draft["schema_version"] == 2
    assert draft["experiment_id"] == "demo-lab"
    assert draft["steps"][0]["id"] == 1
    assert draft["steps"][0]["verification"]["mode"] == "all"
    assert draft["image_name"] == "linux-ai-exp:demo-lab-v1"
    assert draft["container_spec"]["base_image"] == "openeuler/openeuler:22.03-lts-sp3"


def test_normalize_experiment_draft_strips_redundant_step_fields() -> None:
    draft = normalize_experiment_draft(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "steps": [
                {
                    "id": "old-1",
                    "title": "查看目录",
                    "hint": "旧版提示",
                    "goal": "确认当前目录。",
                    "instructions": "执行 pwd。",
                    "try_commands": ["pwd"],
                    "success_criteria": "输出当前目录。",
                    "success_hint": "旧版完成提示",
                    "coach_focus": "解释当前目录。",
                    "extra_field": "ignore",
                    "verification": {"checks": [{"type": "command_match", "commands": ["pwd"]}]},
                }
            ],
        }
    )

    assert set(draft["steps"][0]) == {
        "id",
        "title",
        "goal",
        "instructions",
        "try_commands",
        "success_criteria",
        "coach_focus",
        "verification",
    }


def test_normalize_experiment_draft_rewrites_ai_step_ids_by_order() -> None:
    draft = normalize_experiment_draft(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "steps": [
                {"id": "step1", "title": "第一步"},
                {"id": "步骤2", "title": "第二步"},
                {"id": "step1", "title": "第三步"},
                {"title": "第四步"},
            ],
        }
    )

    assert [step["id"] for step in draft["steps"]] == [1, 2, 3, 4]


def test_normalize_experiment_draft_replaces_system_name_image() -> None:
    draft, warnings = normalize_experiment_draft_with_warnings(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "image_name": "openEuler",
            "steps": [{"title": "查看目录"}],
        }
    )

    assert draft["image_name"] == "linux-ai-exp:demo-lab-v1"
    assert any("image_name=openEuler" in warning for warning in warnings)


def test_normalize_experiment_draft_replaces_base_image_as_image_name() -> None:
    draft, warnings = normalize_experiment_draft_with_warnings(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "image_name": "openeuler/openeuler:22.03-lts-sp3",
            "steps": [{"title": "查看目录"}],
        }
    )

    assert draft["image_name"] == "linux-ai-exp:demo-lab-v1"
    assert any("openeuler/openeuler:22.03-lts-sp3" in warning for warning in warnings)


def test_normalize_experiment_draft_preserves_valid_custom_image_name() -> None:
    draft, warnings = normalize_experiment_draft_with_warnings(
        {
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "image_name": "linux-ai-exp:custom-v1",
            "steps": [{"title": "查看目录"}],
        }
    )

    assert draft["image_name"] == "linux-ai-exp:custom-v1"
    assert not warnings


def test_build_prompt_defines_image_fields_with_examples() -> None:
    prompt = _build_prompt(text="# Demo", filename="demo.md")

    assert '"image_name": "linux-ai-exp:file-basic-v1"' in prompt
    assert 'image_name 不能是 "openEuler"' in prompt
    assert '"base_image": "openeuler/openeuler:22.03-lts-sp3"' in prompt
    assert "success_hint" not in prompt
    assert "hint" not in prompt
    assert "6-10" in prompt


def test_container_spec_rejects_unsafe_values() -> None:
    spec = normalize_container_spec(
        {
            "packages": ["tree", "bad package"],
            "student_dirs": ["linux_lab", "../escape"],
            "student_files": [
                {"path": "linux_lab/readme.txt", "content": "hello"},
                {"path": "/etc/passwd", "content": "bad"},
            ],
        }
    )

    assert spec["packages"] == ["tree"]
    assert spec["student_dirs"] == ["linux_lab"]
    assert spec["student_files"] == [{"path": "linux_lab/readme.txt", "content": "hello"}]


def test_document_design_uses_rule_fallback_without_ai_key() -> None:
    result = asyncio.run(
        design_experiment_from_document(
            text="# Linux 入门\n\n## 步骤1：查看当前目录\n```bash\npwd\n```",
            filename="intro.md",
            settings=settings(api_key=""),
        )
    )

    assert result["source"] == "rule_fallback"
    assert result["draft"]["schema_version"] == 2
    assert result["draft"]["steps"][0]["try_commands"] == ["pwd"]


def test_document_design_falls_back_to_rule_draft_when_ai_normalization_fails(monkeypatch) -> None:
    async def fake_design(**_kwargs):
        raise ExperimentDesignError("AI 草稿规范化失败：bad step", raw_output='{"steps":[{"id":"bad"}]}')

    monkeypatch.setattr(designer, "_design_with_deepseek", fake_design)

    result = asyncio.run(
        design_experiment_from_document(
            text="# Linux 入门\n\n## 步骤1：查看当前目录\n```bash\npwd\n```",
            filename="intro.md",
            settings=settings(api_key="sk-test", ai_mode="deepseek"),
        )
    )

    assert result["source"] == "rule_fallback"
    assert result["draft"]["steps"][0]["try_commands"] == ["pwd"]
    assert "AI 草稿规范化失败" in result["warnings"][0]
    assert "bad" in result["raw_output"]
