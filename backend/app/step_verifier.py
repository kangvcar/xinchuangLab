from __future__ import annotations

from typing import Any


class StepVerifier:
    """步骤验证引擎：根据实验配置验证学生是否完成某一步骤。"""

    def verify(
        self,
        step: dict[str, Any],
        command_event: Any | None,
        terminal_logs: list[str],
        command_events: list[Any] | None = None,
    ) -> bool:
        """
        验证步骤是否完成。

        优先级：
        1. step.verify 配置（精确验证）
        2. step.keywords 回退（兼容旧配置，在全部终端日志中子串匹配）
        """
        verify_config = step.get("verify")
        if verify_config:
            return self._verify_with_config(verify_config, command_event, command_events or [])
        return self._verify_with_keywords(step.get("keywords", []), terminal_logs)

    def _verify_with_config(
        self,
        verify: dict[str, Any],
        command_event: Any | None,
        command_events: list[Any],
    ) -> bool:
        sequence = verify.get("sequence", [])
        if sequence:
            return self._verify_sequence(sequence, command_events)

        if command_event and command_event.is_error:
            return False

        # 1. 命令匹配：最新执行的命令必须以预期命令列表中的某一项开头
        expected_commands = verify.get("commands", [])
        if expected_commands:
            if command_event is None:
                return False
            cmd = command_event.command.strip()
            if not any(self._command_matches(cmd, ec) for ec in expected_commands):
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

        return True

    def _verify_sequence(self, sequence: list[str], command_events: list[Any]) -> bool:
        if not sequence:
            return False

        sequence_index = 0
        for event in command_events:
            if event.is_error:
                continue
            cmd = event.command.strip()
            expected = sequence[sequence_index]
            if self._command_matches(cmd, expected):
                sequence_index += 1
                if sequence_index == len(sequence):
                    return True
        return False

    def _command_matches(self, command: str, expected: str) -> bool:
        normalized_command = command.strip()
        normalized_expected = str(expected).strip()
        if not normalized_command or not normalized_expected:
            return False
        return (
            normalized_command == normalized_expected
            or normalized_command.startswith(f"{normalized_expected} ")
        )

    def _verify_with_keywords(self, keywords: list[str], terminal_logs: list[str]) -> bool:
        text = "\n".join(terminal_logs).lower()
        return bool(keywords) and any(str(kw).lower() in text for kw in keywords)
