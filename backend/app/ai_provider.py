from __future__ import annotations

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
                f"`{command or '这条命令'}` 没有顺利执行。先别急，这通常是命令拼写、路径位置或权限不匹配导致的。\n\n"
                "建议你先看错误提示里的关键词，再用 `pwd` 确认当前位置，必要时用 `ls -l` 看看目标文件或目录是否存在。"
            )
        return (
            f"`{command or '这条命令'}` 已经执行完成。你可以把终端输出当作现场证据来读：路径、文件名、权限位这些信息都会告诉你系统当前处在什么状态。\n\n"
            "继续按当前任务步骤往下做，每执行一步都留意输出有没有符合预期；如果输出为空，也可能表示命令执行成功但没有额外提示。"
        )


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
        if not self.settings.deepseek_api_key:
            raise RuntimeError("DEEPSEEK_API_KEY is not configured")

        # 构建步骤进度描述
        progress_text = ""
        if step_progress:
            status_map = {
                "locked": "未解锁",
                "pending": "进行中",
                "completed": "已检测完成",
                "confirmed": "已确认完成",
            }
            steps = experiment.get("task_config", {}).get("steps", [])
            step_title_map = {s["id"]: s.get("title", f"步骤{s['id']}") for s in steps}
            lines = []
            for p in step_progress:
                title = step_title_map.get(p["step_id"], f"步骤{p['step_id']}")
                status = status_map.get(p["status"], p["status"])
                lines.append(f"- 步骤{p['step_id']}「{title}」：{status}")
            progress_text = "\n".join(lines)
        else:
            progress_text = "暂无进度信息"

        prompt = (
            "你是一名坐在学生旁边的 Linux 实操陪练老师，正在指导高职学生完成信创 Linux openEuler 课堂实验。\n"
            "请根据实验目标、任务配置、知识库、学生当前步骤进度和学生刚执行的命令，自然地讲解和引导。\n"
            "输出要求：\n"
            "1. 不要使用固定标题模板，不要写“刚才做了什么/结果怎么看/下一步建议”这种机械分段。\n"
            "2. 用 2 到 5 个短段落，语气像真人陪练：具体、鼓励、能指出学生当前状态。\n"
            "3. 如果命令成功，解释它的作用、输出该怎么看、和当前实验步骤的关系。\n"
            "4. 如果命令失败，先稳定学生情绪，再指出可能原因，给一个最小可执行修正方向。\n"
            "5. 不要替学生一次性完成整套实验，不要输出长篇理论，不要编造终端没有出现的信息。\n"
            "6. 不要假设学生已经完成了尚未解锁的步骤，只根据当前已确认的进度来评价。\n\n"
            f"实验名称：{experiment['name']}\n"
            f"实验目标：{experiment['task_config'].get('objective', '')}\n"
            f"任务配置：{experiment['task_config']}\n\n"
            f"学生当前步骤进度：\n{progress_text}\n\n"
            f"知识库：\n{knowledge_context}\n\n"
            f"最近终端片段：\n{command_context}"
        )
        payload = {
            "model": self.settings.deepseek_model,
            "messages": [
                {"role": "system", "content": "你是旁路 Linux 实操陪练，只解释和引导，不执行命令，不直接代做整套实验。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 500,
        }
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.settings.deepseek_base_url}/chat/completions"
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"].strip()


def create_coach_provider(settings: Settings) -> CoachProvider:
    if settings.ai_mode == "deepseek":
        return DeepSeekCoachProvider(settings)
    if settings.ai_mode == "auto" and settings.deepseek_api_key:
        return DeepSeekCoachProvider(settings)
    return MockCoachProvider()
