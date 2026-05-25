from __future__ import annotations

import re
from dataclasses import dataclass


ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
OSC_RE = re.compile(r"\x1B\].*?(?:\x07|\x1B\\)")
SCREEN_TITLE_RE = re.compile(r"\x1Bk.*?\x1B\\")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
PROMPT_COMMAND_RE = re.compile(
    r"^(?:\[[^\]\n]+@[\w.-]+\s+[^\]\n]*\]|[\w.-]+@[\w.-]+(?::[^\n]*)?)\s*[$#]\s*(?P<cmd>.+)$"
)
PROMPT_ONLY_RE = re.compile(
    r"^(?:\[[^\]\n]+@[\w.-]+\s+[^\]\n]*\]|[\w.-]+@[\w.-]+(?::[^\n]*)?)\s*[$#]\s*$"
)
ERROR_RE = re.compile(
    r"(command not found|permission denied|no such file or directory|failed|error|cannot|denied)",
    re.IGNORECASE,
)
BANNER_PREFIXES = (
    "script started",
    "welcome ",
    "system information",
    "system load",
    "processes",
    "memory used",
    "swap used",
    "usage on",
    "ip address",
    "users online",
    "to run a command",
    "last login",
    "all rights reserved",
)


@dataclass(frozen=True)
class CommandEvent:
    command: str
    output: str
    is_error: bool
    raw_context: str
    trigger_reason: str
    cwd: str = ""
    exit_code: int | None = None
    started_at: str | None = None
    finished_at: str | None = None
    source: str = "terminal_stream"
    confidence: str = "low"


class LogProcessor:
    def clean(self, content: str) -> str:
        text = SCREEN_TITLE_RE.sub("", content)
        text = OSC_RE.sub("", text)
        text = ANSI_RE.sub("", text)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = self._apply_backspaces(text)
        text = CONTROL_RE.sub("", text)
        lines = [line.rstrip() for line in text.splitlines()]
        return "\n".join(line for line in lines if line.strip()).strip()

    def should_trigger(self, clean_content: str) -> bool:
        return self.parse_command_event(clean_content) is not None

    def parse_command_event(self, clean_content: str) -> CommandEvent | None:
        events = self.parse_command_events(clean_content)
        return events[-1] if events else None

    def parse_command_events(self, clean_content: str) -> list[CommandEvent]:
        if not clean_content:
            return []

        lines = [line.rstrip() for line in clean_content.splitlines() if line.strip()]
        if not lines:
            return []

        events: list[CommandEvent] = []
        index = 0
        while index < len(lines):
            line = lines[index]
            stripped = line.strip()
            match = PROMPT_COMMAND_RE.match(stripped)
            if match:
                candidate = match.group("cmd").strip()
                if self._is_plausible_command(candidate):
                    event, completion_index = self._build_event_from_lines(
                        lines=lines,
                        command_index=index,
                        command=candidate,
                        trigger_reason="prompt-command",
                    )
                    if event:
                        events.append(event)
                        if completion_index is not None:
                            index = completion_index
                            continue
                index += 1
                continue

            if self._is_plausible_bare_command(stripped):
                event, completion_index = self._build_event_from_lines(
                    lines=lines,
                    command_index=index,
                    command=stripped,
                    trigger_reason="bare-command",
                )
                if event:
                    events.append(event)
                    if completion_index is not None:
                        index = completion_index
                        continue
            index += 1

        return events

    def extract_latest_command(self, clean_content: str) -> str:
        for line in reversed(clean_content.splitlines()):
            stripped = line.strip()
            if stripped.startswith("命令："):
                return stripped.removeprefix("命令：").strip()
        for line in reversed(clean_content.splitlines()):
            match = PROMPT_COMMAND_RE.match(line.strip())
            if match:
                candidate = match.group("cmd").strip()
                if self._is_plausible_command(candidate):
                    return candidate
        event = self.parse_command_event(clean_content)
        if event:
            return event.command
        return ""

    def command_context(
        self,
        event: CommandEvent,
        *,
        current_step: dict | None = None,
        verification_result: dict | None = None,
    ) -> str:
        output = event.output or "命令没有产生明显输出。"
        error_label = "是" if event.is_error else "否"
        cwd = event.cwd or "未知"
        exit_code = "未知" if event.exit_code is None else str(event.exit_code)
        step_text = ""
        if current_step:
            step_text = f"当前步骤：{current_step.get('id')} - {current_step.get('title', '')}\n"
        verification_text = ""
        if verification_result:
            status = "通过" if verification_result.get("passed") else "未通过"
            check_lines = []
            for item in verification_result.get("checks", []):
                check_status = "通过" if item.get("passed") else "未通过"
                check_lines.append(f"- {item.get('type', 'check')}：{check_status}；{item.get('detail', '')}")
            verification_text = f"步骤验证：{status}\n" + "\n".join(check_lines) + "\n"
        return (
            f"命令：{event.command}\n"
            f"工作目录：{cwd}\n"
            f"退出码：{exit_code}\n"
            f"是否错误：{error_label}\n"
            f"触发原因：{event.trigger_reason}\n"
            f"事件来源：{event.source}（置信度：{event.confidence}）\n"
            f"{step_text}"
            f"{verification_text}"
            f"命令输出：\n{output}\n\n"
            f"原始终端片段：\n{event.raw_context}"
        )

    def event_fingerprint(self, event: CommandEvent) -> str:
        compact_output = re.sub(r"\s+", " ", event.output.strip())[-500:]
        compact_context = re.sub(r"\s+", " ", event.raw_context.strip())[-500:]
        return f"{event.command.strip()}::{event.exit_code}::{compact_output}::{compact_context}::{event.is_error}"

    def mock_command_output(self, command: str) -> str:
        normalized = command.strip()
        if not normalized:
            return ""
        if normalized == "pwd":
            return "/home/student"
        if normalized.startswith("mkdir "):
            return ""
        if normalized.startswith("touch "):
            return ""
        if normalized in {"ls", "ls -l", "ll"}:
            return "total 0\n-rw-r--r-- 1 student student 0 May 24 14:00 hello.txt\ndrwxr-xr-x 2 student student 6 May 24 14:00 linux_lab"
        if normalized.startswith("cd "):
            return ""
        if normalized.startswith("cat "):
            return "这是模拟终端输出。真实容器模式会显示文件内容。"
        if "rm -rf /" in normalized:
            return "rm: it is dangerous to operate recursively on '/'"
        if normalized.startswith("badcmd") or normalized.startswith("foo"):
            return f"{normalized.split()[0]}: command not found"
        return "命令已记录。真实容器模式会返回 openEuler 终端输出。"

    def _apply_backspaces(self, text: str) -> str:
        chars: list[str] = []
        for char in text:
            if char == "\b":
                if chars:
                    chars.pop()
            else:
                chars.append(char)
        return "".join(chars)

    def _build_event_from_lines(
        self,
        *,
        lines: list[str],
        command_index: int,
        command: str,
        trigger_reason: str,
    ) -> tuple[CommandEvent | None, int | None]:
        output_lines: list[str] = []
        completion_line = ""
        completion_index: int | None = None

        for index in range(command_index + 1, len(lines)):
            line = lines[index]
            stripped = line.strip()
            if PROMPT_ONLY_RE.match(stripped) or PROMPT_COMMAND_RE.match(stripped):
                completion_line = line
                completion_index = index
                break
            output_lines.append(line)

        output = "\n".join(output_lines).strip()
        is_error = bool(ERROR_RE.search(output))
        completed_by_prompt = completion_index is not None
        if not completed_by_prompt and not is_error:
            return None, None
        if command.startswith("/") and not output and completed_by_prompt:
            return None, completion_index

        context_lines = [lines[command_index], *output_lines]
        if completion_line:
            context_lines.append(completion_line)
        return (
            CommandEvent(
                command=command,
                output=output,
                is_error=is_error,
                raw_context="\n".join(context_lines).strip(),
                trigger_reason="error" if is_error else trigger_reason,
                source="terminal_stream",
                confidence="low",
            ),
            completion_index,
        )

    def _is_plausible_command(self, candidate: str) -> bool:
        if not candidate:
            return False
        lowered = candidate.strip().lower()
        if any(lowered.startswith(prefix) for prefix in BANNER_PREFIXES):
            return False
        if lowered.startswith(("total ", "drwx", "-rw", "uid=", "gid=")):
            return False
        first_token = candidate.split()[0]
        if ":" in first_token and not first_token.startswith(("./", "../", "/")):
            return False
        if len(first_token) > 48:
            return False
        return bool(re.match(r"^[A-Za-z0-9_./:-]+$", first_token))

    def _is_plausible_bare_command(self, candidate: str) -> bool:
        if not self._is_plausible_command(candidate):
            return False
        first_token = candidate.split()[0]
        return len(first_token) > 1 or first_token.startswith(("./", "../", "/"))
