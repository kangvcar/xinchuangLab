import asyncio
from types import SimpleNamespace

import pytest

from app import ai_provider
from app.ai_provider import DeepSeekCoachProvider


def settings() -> SimpleNamespace:
    return SimpleNamespace(
        deepseek_api_key="sk-test",
        deepseek_base_url="https://api.deepseek.test",
        deepseek_model="deepseek-chat",
    )


def experiment() -> dict:
    return {
        "name": "Linux 系统认知",
        "task_config": {
            "objective": "认识 openEuler 系统信息。",
            "steps": [
                {
                    "id": 1,
                    "title": "查看当前目录",
                    "goal": "确认当前工作目录。",
                    "instructions": "执行 pwd。",
                    "try_commands": ["pwd"],
                    "success_criteria": "能看到当前路径。",
                    "coach_focus": "解释当前工作目录。",
                    "verification": {"mode": "all", "checks": [{"type": "command_match", "commands": ["pwd"]}]},
                },
                {
                    "id": 2,
                    "title": "查看系统版本",
                    "goal": "确认 openEuler 版本。",
                    "instructions": "执行 cat /etc/os-release。",
                    "try_commands": ["cat /etc/os-release"],
                    "success_criteria": "能看到 openEuler。",
                    "coach_focus": "解释发行版字段。",
                    "verification": {"mode": "all", "checks": [{"type": "command_match", "commands": ["cat /etc/os-release"]}]},
                },
            ],
        },
    }


def test_deepseek_prompt_uses_compact_step_context(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "继续观察输出。"}}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, json):
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", FakeClient)

    provider = DeepSeekCoachProvider(settings())
    asyncio.run(
        provider.explain(
            experiment=experiment(),
            command_context="命令：cat /etc/os-release\n输出：NAME=openEuler",
            knowledge_context="openEuler 是国产 Linux 发行版。",
            step_progress=[
                {"step_id": 1, "status": "confirmed"},
                {"step_id": 2, "status": "pending"},
            ],
        )
    )

    user_prompt = captured["payload"]["messages"][1]["content"]
    assert "当前相关步骤：" in user_prompt
    assert "查看系统版本" in user_prompt
    assert "verification" not in user_prompt
    assert "try_commands" not in user_prompt


def test_deepseek_empty_response_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "  "}}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers, json):
            return FakeResponse()

    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", FakeClient)

    provider = DeepSeekCoachProvider(settings())
    with pytest.raises(RuntimeError, match="empty response"):
        asyncio.run(
            provider.explain(
                experiment=experiment(),
                command_context="命令：pwd",
                knowledge_context="",
                step_progress=[{"step_id": 1, "status": "pending"}],
            )
        )
