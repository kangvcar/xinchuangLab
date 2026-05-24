from __future__ import annotations

import re
from dataclasses import dataclass


ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
OSC_RE = re.compile(r"\x1B\].*?(?:\x07|\x1B\\)")
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


class LogProcessor:
    def clean(self, content: str) -> str:
        text = OSC_RE.sub("", content)
        text = ANSI_RE.sub("", text)
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = self._apply_backspaces(text)
        text = CONTROL_RE.sub("", text)
        lines = [line.rstrip() for line in text.splitlines()]
        return "\n".join(line for line in lines if line.strip()).strip()

    def should_trigger(self, clean_content: str) -> bool:
        return self.parse_command_event(clean_content) is not None

    def parse_command_event(self, clean_content: str) -> CommandEvent | None:
        if not clean_content:
            return None

        lines = [line.rstrip() for line in clean_content.splitlines() if line.strip()]
        if not lines:
            return None

        prompt_match_index: int | None = None
        command = ""
        for index, line in enumerate(lines):
            match = PROMPT_COMMAND_RE.match(line.strip())
            if match:
                candidate = match.group("cmd").strip()
                if self._is_plausible_command(candidate):
                    prompt_match_index = index
                    command = candidate

        if prompt_match_index is not None:
            output_lines = []
            completed_by_prompt = False
            completion_line = ""
            for line in lines[prompt_match_index + 1 :]:
                stripped = line.strip()
                if PROMPT_ONLY_RE.match(stripped) or PROMPT_COMMAND_RE.match(stripped):
                    completed_by_prompt = True
                    completion_line = line
                    break
                output_lines.append(line)
            output = "\n".join(output_lines).strip()
            is_error = bool(ERROR_RE.search(output or clean_content))
            context_lines = [lines[prompt_match_index], *output_lines]
            if completion_line:
                context_lines.append(completion_line)
            return CommandEvent(
                command=command,
                output=output,
                is_error=is_error,
                raw_context="\n".join(context_lines).strip(),
                trigger_reason="error" if is_error else "prompt-command",
            )

        first_line = lines[0].strip()
        if not self._is_plausible_command(first_line):
            return None
        if len(lines) == 1 and not ERROR_RE.search(first_line):
            return None

        output_lines = []
        completed_by_prompt = False
        completion_line = ""
        for line in lines[1:]:
            stripped = line.strip()
            if PROMPT_ONLY_RE.match(stripped) or PROMPT_COMMAND_RE.match(stripped):
                completed_by_prompt = True
                completion_line = line
                break
            output_lines.append(line)
        output = "\n".join(output_lines).strip()
        is_error = bool(ERROR_RE.search(output or clean_content))
        if first_line.startswith("/") and not output and completed_by_prompt:
            return None
        context_lines = [first_line, *output_lines]
        if completion_line:
            context_lines.append(completion_line)
        return CommandEvent(
            command=first_line,
            output=output,
            is_error=is_error,
            raw_context="\n".join(context_lines).strip(),
            trigger_reason="error" if is_error else "bare-command",
        )

    def extract_latest_command(self, clean_content: str) -> str:
        event = self.parse_command_event(clean_content)
        if event:
            return event.command
        for line in reversed(clean_content.splitlines()):
            match = PROMPT_COMMAND_RE.match(line.strip())
            if match:
                candidate = match.group("cmd").strip()
                if self._is_plausible_command(candidate):
                    return candidate
        return ""

    def command_context(self, event: CommandEvent) -> str:
        output = event.output or "命令没有产生明显输出。"
        error_label = "是" if event.is_error else "否"
        return (
            f"命令：{event.command}\n"
            f"是否错误：{error_label}\n"
            f"触发原因：{event.trigger_reason}\n"
            f"命令输出：\n{output}\n\n"
            f"原始终端片段：\n{event.raw_context}"
        )

    def event_fingerprint(self, event: CommandEvent) -> str:
        compact_output = re.sub(r"\s+", " ", event.output.strip())[-500:]
        return f"{event.command.strip()}::{compact_output}::{event.is_error}"

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
