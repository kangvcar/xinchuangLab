from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from .config import Settings
from .log_processor import ERROR_RE, LogProcessor


class CoachProvider:
    name = "base"

    async def explain(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> str:
        raise NotImplementedError

    async def explain_stream(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """Yield text chunks as they arrive from the AI provider.

        Default implementation falls back to explain() and yields the full text once.
        Subclasses should override for true streaming.
        """
        text = await self.explain(
            experiment=experiment,
            command_context=command_context,
            knowledge_context=knowledge_context,
            step_progress=step_progress,
        )
        yield text


class MockCoachProvider(CoachProvider):
    name = "mock"

    async def explain(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> str:
        processor = LogProcessor()
        command = processor.extract_latest_command(command_context)
        has_error = bool(ERROR_RE.search(command_context))
        if has_error:
            return (
                f"哟，`{command or '这条命令'}` 翻车了？让我看看啥情况。\n\n"
                "大概率是命令拼写手滑、路径没找对、或者权限不够。你先瞄一眼错误提示里的关键词，"
                "然后用 `pwd` 看看自己在哪，再用 `ls -l` 瞄一下目标文件还在不在。小问题，稳住。"
            )
        return (
            f"`{command or '这条命令'}` 跑完了，这波操作还行。\n\n"
            "终端输出就是现场证据，路径、文件名、权限位这些信息都在跟你打招呼呢，好好读读。"
            "继续往下走，每步都看看输出对不对；要是输出空了，也可能是命令跑成功了但没废话。"
        )

    async def explain_stream(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        """Simulate streaming by yielding the mock response word-by-word."""
        full_text = await self.explain(
            experiment=experiment,
            command_context=command_context,
            knowledge_context=knowledge_context,
            step_progress=step_progress,
        )
        # Split by words and yield a few at a time for visible typing effect
        words = full_text.split(" ")
        chunk_size = 3
        for i in range(0, len(words), chunk_size):
            chunk = " ".join(words[i : i + chunk_size])
            yield chunk + " "
            # Tiny delay to make the streaming visible in UI
            import asyncio
            await asyncio.sleep(0.05)


class DeepSeekCoachProvider(CoachProvider):
    name = "deepseek"

    def __init__(self, settings: Settings):
        self.settings = settings

    async def explain(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> str:
        url, headers, payload = self._build_request(
            experiment=experiment,
            command_context=command_context,
            knowledge_context=knowledge_context,
            step_progress=step_progress,
        )
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        content = str(data["choices"][0]["message"].get("content") or "").strip()
        if not content:
            raise RuntimeError("DeepSeek returned empty response")
        return content

    async def explain_stream(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        url, headers, payload = self._build_request(
            experiment=experiment,
            command_context=command_context,
            knowledge_context=knowledge_context,
            step_progress=step_progress,
            stream=True,
        )
        has_content = False
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    content = _extract_stream_delta(line)
                    if not content:
                        continue
                    has_content = True
                    yield content
        if not has_content:
            raise RuntimeError("DeepSeek returned empty response")

    def _build_request(
        self,
        *,
        experiment: dict,
        command_context: str,
        knowledge_context: str,
        step_progress: list[dict[str, Any]] | None = None,
        stream: bool = False,
    ) -> tuple[str, dict[str, str], dict[str, Any]]:
        if not self.settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")
        progress_text = _build_progress_text(experiment, step_progress)
        current_step_text = _build_current_step_text(experiment, step_progress)

        prompt = (
            "你是坐在学生旁边的 Linux 实操损友陪练，说话像关系很好的同学，带点调侃和碎碎念，但关键时刻会兜底。\n"
            "请根据实验目标、当前相关步骤、学生当前步骤进度和学生刚执行的命令，用损友口吻讲解和引导。\n"
            "输出要求：\n"
            "1. 不要使用固定标题模板，不要写“刚才做了什么/结果怎么看/下一步建议”这种机械分段。\n"
            "2. 用 2 到 3 个短段落，语气像损友碎碎念：具体、有点调侃、能一针见血指出问题，但不会打击人。\n"
            "3. 如果命令成功，解释它的作用和输出该怎么看，顺手夸一句或吐槽一句，和当前实验步骤联系起来。\n"
            "4. 如果命令失败，先吐槽或安抚一下，再指出可能原因，给一个最小可执行修正方向。\n"
            "5. 不要替学生一次性完成整套实验，不要输出长篇理论，不要编造终端没有出现的信息。\n"
            "6. 不要假设学生已经完成了尚未解锁的步骤，只根据当前已确认的进度来评价。\n\n"
            f"实验名称：{experiment['name']}\n"
            f"实验目标：{experiment['task_config'].get('objective', '')}\n"
            f"当前相关步骤：\n{current_step_text}\n\n"
            f"学生当前步骤进度：\n{progress_text}\n\n"
            f"知识库：\n{knowledge_context}\n\n"
            f"最近终端片段：\n{command_context}"
        )
        payload = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": "你是坐在学生旁边的 Linux 实操损友陪练，说话像关系很好的同学，带点调侃和碎碎念，但核心目的是帮对方理解和纠错。不执行命令，不直接代做整套实验。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 420,
        }
        if stream:
            payload["stream"] = True
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.deepseek_base_url}/chat/completions"
        return url, headers, payload


def create_coach_provider(settings: Settings) -> CoachProvider:
    if settings.ai_mode == "deepseek":
        return DeepSeekCoachProvider(settings)
    if settings.ai_mode == "auto" and settings.deepseek_api_key:
        return DeepSeekCoachProvider(settings)
    return MockCoachProvider()


def _extract_stream_delta(line: str) -> str | None:
    line = line.strip()
    if not line.startswith("data:"):
        return None
    data = line.removeprefix("data:").strip()
    if not data or data == "[DONE]":
        return None
    payload = json.loads(data)
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
    if not isinstance(delta, dict):
        return None
    content = delta.get("content")
    return content if isinstance(content, str) and content else None


def _build_progress_text(
    experiment: dict,
    step_progress: list[dict[str, Any]] | None,
) -> str:
    if not step_progress:
        return "暂无进度信息"
    status_map = {
        "locked": "未解锁",
        "pending": "进行中",
        "completed": "已检测完成",
        "confirmed": "已确认完成",
    }
    steps = experiment.get("task_config", {}).get("steps", [])
    step_title_map = {s["id"]: s.get("title", f"步骤{s['id']}") for s in steps}
    lines = []
    for progress in step_progress:
        title = step_title_map.get(progress["step_id"], f"步骤{progress['step_id']}")
        status = status_map.get(progress["status"], progress["status"])
        lines.append(f"- 步骤{progress['step_id']}「{title}」：{status}")
    return "\n".join(lines)


def _build_current_step_text(
    experiment: dict,
    step_progress: list[dict[str, Any]] | None,
) -> str:
    steps = experiment.get("task_config", {}).get("steps", [])
    if not steps:
        return "暂无步骤信息"
    current_step_id = _current_step_id(step_progress)
    current_step = next((step for step in steps if step.get("id") == current_step_id), steps[0])
    fields = [
        f"- 步骤{current_step.get('id')}：{current_step.get('title', '')}",
        f"- 目标：{current_step.get('goal', '')}",
        f"- 指令：{current_step.get('instructions', '')}",
        f"- 成功标准：{current_step.get('success_criteria', '')}",
        f"- 陪练关注点：{current_step.get('coach_focus', '')}",
    ]
    return "\n".join(line for line in fields if not line.endswith("："))


def _current_step_id(step_progress: list[dict[str, Any]] | None) -> int | None:
    if not step_progress:
        return None
    status_rank = {"pending": 0, "completed": 1, "confirmed": 2, "locked": 3}
    ordered = sorted(
        step_progress,
        key=lambda item: (status_rank.get(item.get("status"), 99), int(item.get("step_id", 0))),
    )
    return int(ordered[0]["step_id"]) if ordered else None
