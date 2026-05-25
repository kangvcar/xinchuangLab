#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path


ANSI_RE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
OSC_RE = re.compile(r"\x1B\].*?(?:\x07|\x1B\\)")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_terminal(text: str) -> str:
    text = OSC_RE.sub("", text)
    text = ANSI_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = apply_backspaces(text)
    text = CONTROL_RE.sub("", text)
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line.strip()).strip()


def apply_backspaces(text: str) -> str:
    chars: list[str] = []
    for char in text:
        if char == "\b":
            if chars:
                chars.pop()
        else:
            chars.append(char)
    return "".join(chars)


def read_output(pane_log: Path, offset: int, command: str) -> str:
    if not pane_log.exists():
        return ""
    data = pane_log.read_bytes()
    if offset < 0 or offset > len(data):
        offset = 0
    output = clean_terminal(data[offset:].decode("utf-8", errors="ignore"))
    lines = output.splitlines()
    if lines and lines[0].strip() == command.strip():
        lines = lines[1:]
    return "\n".join(lines).strip()


def main() -> None:
    session_dir = Path(os.getenv("LINUX_AI_SESSION_DIR", "/tmp/linux-ai-session"))
    events_path = Path(os.getenv("LINUX_AI_EVENTS", str(session_dir / "command_events.jsonl")))
    pane_log = Path(os.getenv("LINUX_AI_PANE_LOG", str(session_dir / "pane.log")))
    command = os.getenv("LINUX_AI_COMMAND", "").strip()
    if not command:
        return
    exit_code = int(os.getenv("LINUX_AI_EXIT_CODE", "0") or "0")
    output_offset = int(os.getenv("LINUX_AI_OUTPUT_OFFSET", "0") or "0")
    event = {
        "type": "command_event",
        "event_id": uuid.uuid4().hex,
        "command": command,
        "cwd": os.getenv("LINUX_AI_CWD", ""),
        "exit_code": exit_code,
        "is_error": exit_code != 0,
        "output": read_output(pane_log, output_offset, command),
        "started_at": os.getenv("LINUX_AI_STARTED_AT", ""),
        "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "bash-hook",
        "confidence": "high",
    }
    events_path.parent.mkdir(parents=True, exist_ok=True)
    with events_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
