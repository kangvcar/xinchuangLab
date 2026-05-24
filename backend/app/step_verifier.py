from __future__ import annotations

from typing import Any


class StepVerifier:
    """步骤验证引擎：根据实验配置验证学生是否完成某一步骤。"""

    def verify(
        self,
        step: dict[str, Any],
        command_event: Any | None,
        terminal_logs: list[str],
    ) -> bool:
        """
        验证步骤是否完成。

        优先级：
        1. step.verify 配置（精确验证）
        2. step.keywords 回退（兼容旧配置，在全部终端日志中子串匹配）
        """
        verify_config = step.get("verify")
        if verify_config:
            return self._verify_with_config(verify_config, command_event)
        return self._verify_with_keywords(step.get("keywords", []), terminal_logs)

    def _verify_with_config(
        self,
        verify: dict[str, Any],
        command_event: Any | None,
    ) -> bool:
        # 1. 命令匹配：最新执行的命令必须以预期命令列表中的某一项开头
        expected_commands = verify.get("commands", [])
        if expected_commands:
            if command_event is None:
                return False
            cmd = command_event.command.strip()
            if not any(cmd.startswith(ec) for ec in expected_commands):
                return False

        # 2. 输出匹配：命令输出需要包含特定文本片段（可选）
        output_contains = verify.get("output_contains", [])
        if output_contains and command_event is not None:
            output = command_event.output or ""
            if not any(pat in output for pat in output_contains):
                return False

        # 3. 输出正则匹配：命令输出需要匹配特定正则（可选）
        output_patterns = verify.get("output_patterns", [])
        if output_patterns and command_event is not None:
            import re

            output = command_event.output or ""
            if not any(re.search(pat, output) for pat in output_patterns):
                return False

        # 4. 错误检查：如果命令执行报错了，不算完成
        if command_event and command_event.is_error:
            return False

        return True

    def _verify_with_keywords(self, keywords: list[str], terminal_logs: list[str]) -> bool:
        text = "\n".join(terminal_logs).lower()
        return bool(keywords) and any(str(kw).lower() in text for kw in keywords)
