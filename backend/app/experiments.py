from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .database import Database


def load_experiment_files(experiments_dir: Path) -> list[dict[str, Any]]:
    configs: list[dict[str, Any]] = []
    if not experiments_dir.exists():
        return configs
    for path in sorted(experiments_dir.glob("*.json")):
        config = json.loads(path.read_text(encoding="utf-8"))
        if "experiment_id" not in config:
            raise ValueError(f"{path} is missing experiment_id")
        configs.append(config)
    return configs


def sync_experiments(db: Database, experiments_dir: Path) -> None:
    for config in load_experiment_files(experiments_dir):
        db.upsert_experiment(config)


def import_steps_from_text(text: str) -> list[dict[str, Any]]:
    """Create editable step drafts from Markdown or plain text."""
    lines = text.splitlines()
    steps: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    code_block: list[str] = []
    in_code = False

    def flush_code() -> None:
        nonlocal code_block, current
        if current is not None and code_block:
            current.setdefault("try_commands", [])
            for line in code_block:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    current["try_commands"].append(stripped)
        code_block = []

    def start_step(title: str) -> None:
        nonlocal current
        if current is not None:
            flush_code()
            steps.append(current)
        current = {
            "id": len(steps) + 1,
            "title": title.strip() or f"步骤{len(steps) + 1}",
            "goal": "",
            "instructions": "",
            "try_commands": [],
            "success_criteria": "",
            "success_hint": "",
            "coach_focus": "",
            "verification": {"mode": "all", "checks": []},
        }

    for raw_line in lines:
        line = raw_line.rstrip()
        if line.strip().startswith("```"):
            if in_code:
                flush_code()
            in_code = not in_code
            continue
        if in_code:
            code_block.append(line)
            continue

        heading = re.match(r"^\s*(?:#{1,4}\s*)?(?:步骤|Step)\s*(\d+)?[：:.\-\s]*(.+)$", line, re.IGNORECASE)
        numbered = re.match(r"^\s*(\d+)[.、)]\s+(.+)$", line)
        if heading:
            start_step(heading.group(2))
            continue
        if numbered and (current is None or len(line) < 80):
            start_step(numbered.group(2))
            continue
        if current is None:
            if line.strip():
                start_step(line.strip())
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if any(key in stripped for key in ("完成条件", "成功标准", "验收", "判断")):
            current["success_criteria"] = _after_colon(stripped)
            current["success_hint"] = current["success_criteria"]
        elif any(key in stripped for key in ("命令", "输入", "执行")) and "`" in stripped:
            current["try_commands"].extend(re.findall(r"`([^`]+)`", stripped))
            current["instructions"] = _append_text(current["instructions"], stripped)
        elif not current["goal"]:
            current["goal"] = stripped
            current["instructions"] = _append_text(current["instructions"], stripped)
        else:
            current["instructions"] = _append_text(current["instructions"], stripped)

    if current is not None:
        flush_code()
        steps.append(current)

    for step in steps:
        step["try_commands"] = list(dict.fromkeys(step.get("try_commands", [])))
        if not step["success_criteria"]:
            step["success_criteria"] = step.get("success_hint") or "教师需补充完成判断。"
            step["success_hint"] = step["success_criteria"]
        if step["try_commands"]:
            step["verification"]["checks"].append({"type": "command_match", "commands": step["try_commands"]})
    return steps


def build_experiment_draft_from_text(
    text: str,
    *,
    filename: str = "",
    experiment_id: str = "imported-experiment",
    name: str = "导入实验草稿",
    image_name: str = "",
) -> dict[str, Any]:
    """Build a complete v2 experiment draft with editable imported steps."""
    title = _first_title(text) or Path(filename).stem or name
    steps = import_steps_from_text(_step_source(text))
    objective = _first_paragraph_after_title(text) or "教师需根据导入文档补充实验目标。"
    return {
        "experiment_id": _slugify(experiment_id if experiment_id != "imported-experiment" else title),
        "name": title,
        "system": "openEuler",
        "image_name": image_name,
        "objective": objective,
        "status": "draft",
        "schema_version": 2,
        "steps": steps,
    }


def _after_colon(text: str) -> str:
    if "：" in text:
        return text.split("：", 1)[1].strip()
    if ":" in text:
        return text.split(":", 1)[1].strip()
    return text


def _append_text(existing: str, text: str) -> str:
    return f"{existing}\n{text}".strip() if existing else text


def _step_source(text: str) -> str:
    lines = text.splitlines()
    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if re.match(r"^\s*(?:#{1,4}\s*)?(?:步骤|Step)\s*(\d+)?[：:.\-\s]*(.+)$", line, re.IGNORECASE):
            return "\n".join(lines[index:])
        if re.match(r"^\s*\d+[.、)]\s+(.+)$", line):
            return "\n".join(lines[index:])
    return text


def _first_title(text: str) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        heading = re.match(r"^#{1,3}\s+(.+)$", line)
        if heading:
            return heading.group(1).strip()
        if len(line) <= 36 and not line.startswith(("```", "-", "*")):
            return re.sub(r"^(?:实验名称|标题)[：:]\s*", "", line).strip()
    return ""


def _first_paragraph_after_title(text: str) -> str:
    seen_title = False
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("```"):
            continue
        if not seen_title:
            seen_title = True
            continue
        if re.match(r"^#{1,4}\s*", line) or re.match(r"^\s*(?:步骤|Step)\s*\d*", line, re.IGNORECASE):
            continue
        return _after_colon(line) if any(key in line for key in ("目标", "目的")) else line
    return ""


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", text.lower()).strip("-")
    return slug[:48] or "imported-experiment"
