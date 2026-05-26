from __future__ import annotations

import html
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .database import Database


ERROR_PATTERNS = [
    ("命令不存在", re.compile(r"command not found", re.IGNORECASE), "检查命令拼写，确认命令是否已安装。"),
    ("路径或文件不存在", re.compile(r"no such file or directory", re.IGNORECASE), "先用 pwd 和 ls -l 确认当前路径与文件名。"),
    ("权限不足", re.compile(r"permission denied", re.IGNORECASE), "检查文件权限，必要时联系教师确认授权方式。"),
    ("执行失败", re.compile(r"(failed|error|cannot|denied)", re.IGNORECASE), "先阅读错误关键词，再定位命令参数、路径或环境问题。"),
]

STATUS_LABELS = {
    "confirmed": "已确认完成",
    "completed": "已检测完成",
    "pending": "进行中",
    "locked": "未开始",
}


class ReportService:
    def __init__(self, db: Database, reports_dir: Path):
        self.db = db
        self.reports_dir = reports_dir
        self.reports_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, session_id: str) -> dict:
        model = self.build_report_model(session_id)
        report_stem = f"{session_id}"
        markdown_path = self.reports_dir / f"{report_stem}.md"
        html_path = self.reports_dir / f"{report_stem}.html"
        markdown = self._render_markdown(model)
        markdown_path.write_text(markdown, encoding="utf-8")
        html_path.write_text(self._render_html(model), encoding="utf-8")
        return self.db.add_report(session_id, markdown_path, html_path)

    def build_report_model(self, session_id: str) -> dict[str, Any]:
        session = self.db.get_session(session_id)
        if not session:
            raise ValueError("session not found")

        logs = self.db.list_terminal_logs(session_id, limit=500)
        ai_records = self.db.list_ai_records(session_id, limit=500)
        progress = self.db.get_step_progress(session_id)
        steps_config = session.get("task_config", {}).get("steps", [])
        step_rows = self._build_steps(steps_config, progress)
        evidence_items = self._build_evidence_items(ai_records, logs, steps_config)
        ai_summaries = self._build_ai_summaries(ai_records, evidence_items)
        overview = self._build_overview(session, step_rows, evidence_items, ai_records)
        learning_analysis = self._build_learning_analysis(step_rows, evidence_items)
        teacher_evaluation = self._build_teacher_evaluation(overview)

        return {
            "meta": self._build_meta(session),
            "overview": overview,
            "steps": step_rows,
            "evidence_items": evidence_items,
            "ai_summaries": ai_summaries,
            "learning_analysis": learning_analysis,
            "teacher_evaluation": teacher_evaluation,
            "appendix": {
                "terminal_logs": logs,
                "ai_records": ai_records,
                "technical": {
                    "session_id": session["id"],
                    "experiment_id": session["experiment_id"],
                    "runtime_mode": session.get("runtime_mode") or "未记录",
                    "container_name": session.get("container_name") or "未记录",
                    "image_name": session.get("image_name") or "未记录",
                },
            },
        }

    def _build_meta(self, session: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": "Linux AI 陪练实训学习报告",
            "platform_name": "信创 Linux AI 实时陪练实训平台",
            "session_id": session["id"],
            "student_id": session["student_id"],
            "experiment_id": session["experiment_id"],
            "experiment_name": session["experiment_name"],
            "system_type": session["system_type"],
            "image_name": session.get("image_name") or "未记录",
            "runtime_mode": session.get("runtime_mode") or "未记录",
            "container_name": session.get("container_name") or "未记录",
            "start_time": session.get("start_time") or "未记录",
            "end_time": session.get("end_time") or "未结束",
            "status": session.get("status") or "未记录",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        }

    def _build_steps(self, steps_config: list[dict[str, Any]], progress: list[dict[str, Any]]) -> list[dict[str, Any]]:
        progress_map = {item["step_id"]: item for item in progress}
        rows: list[dict[str, Any]] = []
        for step in sorted(steps_config, key=lambda item: item.get("id", 0)):
            step_id = int(step.get("id", 0))
            item = progress_map.get(step_id, {})
            status = item.get("status") or "locked"
            rows.append(
                {
                    "id": step_id,
                    "title": step.get("title", f"步骤{step_id}"),
                    "goal": step.get("goal") or step.get("success_criteria") or step.get("hint") or "",
                    "status": status,
                    "status_label": STATUS_LABELS.get(status, status),
                    "completed_at": item.get("confirmed_at") or item.get("detected_at") or "",
                    "try_commands": step.get("try_commands", []),
                    "success_hint": step.get("success_hint", ""),
                    "keywords": step.get("keywords", []),
                }
            )
        return rows

    def _build_overview(
        self,
        session: dict[str, Any],
        steps: list[dict[str, Any]],
        evidence_items: list[dict[str, Any]],
        ai_records: list[dict[str, Any]],
    ) -> dict[str, Any]:
        total_steps = len(steps)
        completed_steps = sum(1 for item in steps if item["status"] in {"completed", "confirmed"})
        completion_rate = round(completed_steps / total_steps * 100) if total_steps else 0
        error_count = sum(1 for item in evidence_items if item["is_error"])
        return {
            "objective": session["task_config"].get("objective", ""),
            "completed_steps": completed_steps,
            "total_steps": total_steps,
            "completion_rate": completion_rate,
            "pending_steps": max(total_steps - completed_steps, 0),
            "command_count": len(evidence_items),
            "error_count": error_count,
            "ai_coach_count": len(ai_records),
            "duration_text": _duration_text(session.get("start_time"), session.get("end_time")),
            "conclusion": _overview_conclusion(completion_rate, total_steps),
        }

    def _build_evidence_items(
        self,
        ai_records: list[dict[str, Any]],
        logs: list[dict[str, Any]],
        steps_config: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        items = []
        for record in ai_records:
            parsed = _parse_command_context(record.get("command_context", ""))
            command = parsed.get("command", "")
            if not command:
                continue
            step_id = parsed.get("step_id") or _infer_step_id(command, steps_config)
            items.append(
                {
                    "time": record.get("created_at", ""),
                    "command": command,
                    "output_summary": _truncate(parsed.get("output", "") or "命令没有产生明显输出。", 180),
                    "is_error": parsed.get("is_error", False),
                    "step_id": step_id,
                    "step_title": _step_title(step_id, steps_config),
                    "teaching_value": _teaching_value(command, step_id, steps_config),
                    "error_type": _classify_error(parsed.get("output", ""))[0],
                }
            )
        if items:
            return items
        return self._fallback_evidence_from_logs(logs, steps_config)

    def _fallback_evidence_from_logs(
        self,
        logs: list[dict[str, Any]],
        steps_config: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        items = []
        for log in logs:
            command = _extract_command_from_log(log.get("clean_content", ""))
            if not command:
                continue
            content = log.get("clean_content", "")
            step_id = _infer_step_id(command, steps_config)
            error_type, _ = _classify_error(content)
            items.append(
                {
                    "time": log.get("timestamp", ""),
                    "command": command,
                    "output_summary": _truncate(content, 180),
                    "is_error": bool(error_type),
                    "step_id": step_id,
                    "step_title": _step_title(step_id, steps_config),
                    "teaching_value": _teaching_value(command, step_id, steps_config),
                    "error_type": error_type,
                }
            )
        return items

    def _build_ai_summaries(
        self,
        ai_records: list[dict[str, Any]],
        evidence_items: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        evidence_by_command = {item["command"]: item for item in evidence_items}
        summaries = []
        for record in ai_records:
            parsed = _parse_command_context(record.get("command_context", ""))
            command = parsed.get("command", "")
            evidence = evidence_by_command.get(command, {})
            response = record.get("ai_response", "")
            summaries.append(
                {
                    "time": record.get("created_at", ""),
                    "command": command or "未识别命令",
                    "feedback_type": _feedback_type(response, parsed, evidence),
                    "summary": _truncate(response, 180),
                }
            )
        return summaries

    def _build_learning_analysis(
        self,
        steps: list[dict[str, Any]],
        evidence_items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        completed = [item for item in steps if item["status"] in {"completed", "confirmed"}]
        unfinished = [item for item in steps if item["status"] not in {"completed", "confirmed"}]
        typical_errors = []
        seen_error_types = set()
        for item in evidence_items:
            if not item["is_error"]:
                continue
            error_type, suggestion = _classify_error(item["output_summary"])
            error_type = error_type or "一般执行错误"
            if error_type in seen_error_types:
                continue
            seen_error_types.add(error_type)
            typical_errors.append(
                {
                    "type": error_type,
                    "command": item["command"],
                    "suggestion": suggestion,
                }
            )

        strengths = [
            f"已完成“{item['title']}”，能够围绕 {', '.join(item['try_commands']) or item['title']} 完成对应操作。"
            for item in completed
        ] or ["本次报告暂未检测到已完成步骤，建议先完成当前进行中的实验任务。"]

        needs_practice = [
            f"“{item['title']}”仍需巩固：{item['goal'] or item['success_hint'] or '请按实验提示完成该步骤。'}"
            for item in unfinished
        ] or ["本次实验步骤完成情况较好，可继续练习更综合的 Linux 操作任务。"]

        return {
            "strengths": strengths,
            "needs_practice": needs_practice,
            "typical_errors": typical_errors,
            "recommendations": _recommendations(unfinished, typical_errors),
        }

    def _build_teacher_evaluation(self, overview: dict[str, Any]) -> dict[str, str]:
        rate = overview["completion_rate"]
        error_count = overview["error_count"]
        if rate >= 90:
            score_hint = "建议等级：优秀或良好。"
        elif rate >= 70:
            score_hint = "建议等级：良好或合格。"
        else:
            score_hint = "建议继续练习后再评价。"
        debugging = "错误命令较少，操作过程较稳定。"
        if error_count >= 3:
            debugging = "错误命令较多，建议教师重点查看学生是否能根据提示完成排错。"
        elif error_count > 0:
            debugging = "出现少量错误命令，可结合 AI 反馈观察学生排错过程。"
        return {
            "completion_suggestion": f"完成率 {rate}%，{overview['conclusion']}",
            "operation_suggestion": f"共识别 {overview['command_count']} 条关键命令，建议结合步骤证据判断操作规范性。",
            "debugging_suggestion": debugging,
            "score_hint": score_hint,
        }

    def _render_markdown(self, model: dict[str, Any]) -> str:
        meta = model["meta"]
        overview = model["overview"]
        lines = [
            f"# {meta['title']}",
            "",
            f"- 平台：{meta['platform_name']}",
            f"- 实验：{meta['experiment_name']}",
            f"- 学生：{meta['student_id']}",
            f"- 系统：{meta['system_type']}",
            f"- 实验时间：{meta['start_time']} 至 {meta['end_time']}",
            f"- 报告生成时间：{meta['generated_at']}",
            "",
            "## 学习概览",
            "",
            f"- 实验目标：{overview['objective'] or '未记录'}",
            f"- 步骤完成率：{overview['completed_steps']} / {overview['total_steps']}（{overview['completion_rate']}%）",
            f"- 执行命令数量：{overview['command_count']}",
            f"- 错误命令数量：{overview['error_count']}",
            f"- AI 陪练次数：{overview['ai_coach_count']}",
            f"- 实验用时：{overview['duration_text']}",
            f"- 整体结论：{overview['conclusion']}",
            "",
            "## 步骤完成记录",
            "",
            "| 步骤 | 标题 | 学习目标 | 状态 | 完成时间 | 推荐命令 |",
            "|---|---|---|---|---|---|",
        ]
        for step in model["steps"]:
            lines.append(
                f"| {step['id']} | {_md(step['title'])} | {_md(step['goal'])} | {step['status_label']} | "
                f"{step['completed_at'] or '未记录'} | {_md(', '.join(step['try_commands']) or '未记录')} |"
            )
        lines.extend(["", "## 关键操作证据", ""])
        if model["evidence_items"]:
            for item in model["evidence_items"]:
                error_label = "是" if item["is_error"] else "否"
                lines.extend(
                    [
                        f"### `{item['command']}`",
                        "",
                        f"- 时间：{item['time'] or '未记录'}",
                        f"- 关联步骤：{item['step_title']}",
                        f"- 是否错误：{error_label}",
                        f"- 输出摘要：{item['output_summary']}",
                        f"- 教学意义：{item['teaching_value']}",
                        "",
                    ]
                )
        else:
            lines.extend(["暂无关键操作证据。", ""])
        lines.extend(["## AI 陪练摘要", ""])
        if model["ai_summaries"]:
            for item in model["ai_summaries"]:
                lines.extend(
                    [
                        f"- {item['time'] or '未记录'} · {item['feedback_type']} · `{item['command']}`",
                        f"  {item['summary']}",
                    ]
                )
        else:
            lines.append("暂无 AI 陪练记录。")
        analysis = model["learning_analysis"]
        lines.extend(["", "## 学习表现分析", "", "### 掌握较好的内容", ""])
        lines.extend(f"- {item}" for item in analysis["strengths"])
        lines.extend(["", "### 需要巩固的内容", ""])
        lines.extend(f"- {item}" for item in analysis["needs_practice"])
        lines.extend(["", "### 典型错误", ""])
        if analysis["typical_errors"]:
            lines.extend(
                f"- {item['type']}：`{item['command']}`。建议：{item['suggestion']}"
                for item in analysis["typical_errors"]
            )
        else:
            lines.append("- 暂未识别典型错误。")
        lines.extend(["", "### 后续学习建议", ""])
        lines.extend(f"- {item}" for item in analysis["recommendations"])
        teacher = model["teacher_evaluation"]
        lines.extend(
            [
                "",
                "## 教师评价区",
                "",
                f"- 完成度建议：{teacher['completion_suggestion']}",
                f"- 操作规范性建议：{teacher['operation_suggestion']}",
                f"- 排错能力建议：{teacher['debugging_suggestion']}",
                f"- 评分参考：{teacher['score_hint']}",
                "",
                "教师评语：",
                "",
                "综合评分：",
                "",
                "等级：",
                "",
                "教师签名：",
                "",
                "日期：",
            ]
        )
        return "\n".join(lines).strip() + "\n"

    def _render_html(self, model: dict[str, Any]) -> str:
        meta = model["meta"]
        overview = model["overview"]
        step_rows = "".join(
            "<tr>"
            f"<td>{step['id']}</td>"
            f"<td>{_e(step['title'])}</td>"
            f"<td>{_e(step['goal'])}</td>"
            f"<td><span class='status status-{_e(step['status'])}'>{_e(step['status_label'])}</span></td>"
            f"<td>{_e(step['completed_at'] or '未记录')}</td>"
            f"<td><code>{_e(', '.join(step['try_commands']) or '未记录')}</code></td>"
            "</tr>"
            for step in model["steps"]
        )
        evidence_html = "".join(
            "<article class='evidence'>"
            f"<div class='evidence-head'><code>{_e(item['command'])}</code><span>{'错误' if item['is_error'] else '正常'}</span></div>"
            f"<dl><dt>时间</dt><dd>{_e(item['time'] or '未记录')}</dd>"
            f"<dt>关联步骤</dt><dd>{_e(item['step_title'])}</dd>"
            f"<dt>输出摘要</dt><dd>{_e(item['output_summary'])}</dd>"
            f"<dt>教学意义</dt><dd>{_e(item['teaching_value'])}</dd></dl>"
            "</article>"
            for item in model["evidence_items"]
        ) or "<p class='empty'>暂无关键操作证据。</p>"
        ai_html = "".join(
            "<article class='coach'>"
            f"<div><strong>{_e(item['feedback_type'])}</strong><time>{_e(item['time'] or '未记录')}</time></div>"
            f"<p><code>{_e(item['command'])}</code></p>"
            f"<p>{_e(item['summary'])}</p>"
            "</article>"
            for item in model["ai_summaries"]
        ) or "<p class='empty'>暂无 AI 陪练记录。</p>"
        analysis = model["learning_analysis"]
        typical_errors = "".join(
            f"<li><strong>{_e(item['type'])}</strong>：<code>{_e(item['command'])}</code>。{_e(item['suggestion'])}</li>"
            for item in analysis["typical_errors"]
        ) or "<li>暂未识别典型错误。</li>"
        teacher = model["teacher_evaluation"]
        return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>{_e(meta['title'])}</title>
  <style>{_report_css()}</style>
</head>
<body>
  <main class="report">
    <section class="cover">
      <p class="platform">{_e(meta['platform_name'])}</p>
      <h1>{_e(meta['title'])}</h1>
      <div class="cover-grid">
        <span>实验名称</span><strong>{_e(meta['experiment_name'])}</strong>
        <span>学生编号</span><strong>{_e(meta['student_id'])}</strong>
        <span>系统环境</span><strong>{_e(meta['system_type'])}</strong>
        <span>运行模式</span><strong>{_e(meta['runtime_mode'])}</strong>
        <span>实验时间</span><strong>{_e(meta['start_time'])} 至 {_e(meta['end_time'])}</strong>
        <span>报告生成</span><strong>{_e(meta['generated_at'])}</strong>
      </div>
    </section>

    <section class="section learning-overview">
      <h2>学习概览</h2>
      <p class="objective">{_e(overview['objective'] or '未记录实验目标。')}</p>
      <div class="metric-grid">
        <div><strong>{overview['completed_steps']} / {overview['total_steps']}</strong><span>步骤完成</span></div>
        <div><strong>{overview['completion_rate']}%</strong><span>完成率</span></div>
        <div><strong>{overview['command_count']}</strong><span>关键命令</span></div>
        <div><strong>{overview['error_count']}</strong><span>错误命令</span></div>
        <div><strong>{overview['ai_coach_count']}</strong><span>AI 陪练</span></div>
        <div><strong>{_e(overview['duration_text'])}</strong><span>实验用时</span></div>
      </div>
      <p class="conclusion">{_e(overview['conclusion'])}</p>
    </section>

    <section class="section">
      <h2>步骤完成记录</h2>
      <table><thead><tr><th>步骤</th><th>标题</th><th>学习目标</th><th>状态</th><th>完成时间</th><th>推荐命令</th></tr></thead><tbody>{step_rows}</tbody></table>
    </section>

    <section class="section">
      <h2>关键操作证据</h2>
      <div class="evidence-list">{evidence_html}</div>
    </section>

    <section class="section">
      <h2>AI 陪练摘要</h2>
      <div class="coach-list">{ai_html}</div>
    </section>

    <section class="section">
      <h2>学习表现分析</h2>
      <div class="analysis-grid">
        <div><h3>掌握较好的内容</h3>{_list_html(analysis['strengths'])}</div>
        <div><h3>需要巩固的内容</h3>{_list_html(analysis['needs_practice'])}</div>
        <div><h3>典型错误</h3><ul>{typical_errors}</ul></div>
        <div><h3>后续学习建议</h3>{_list_html(analysis['recommendations'])}</div>
      </div>
    </section>

    <section class="section teacher-signature">
      <h2>教师评价区</h2>
      <div class="teacher-grid">
        <p><strong>完成度建议：</strong>{_e(teacher['completion_suggestion'])}</p>
        <p><strong>操作规范性建议：</strong>{_e(teacher['operation_suggestion'])}</p>
        <p><strong>排错能力建议：</strong>{_e(teacher['debugging_suggestion'])}</p>
        <p><strong>评分参考：</strong>{_e(teacher['score_hint'])}</p>
      </div>
      <div class="sign-box">教师评语：</div>
      <div class="sign-row"><span>综合评分：</span><span>等级：</span><span>教师签名：</span><span>日期：</span></div>
    </section>
  </main>
</body>
</html>
"""


def _parse_command_context(context: str) -> dict[str, Any]:
    result: dict[str, Any] = {"command": "", "output": "", "is_error": False, "step_id": None}
    lines = context.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("命令："):
            result["command"] = stripped.removeprefix("命令：").strip()
        elif stripped.startswith("是否错误："):
            result["is_error"] = stripped.removeprefix("是否错误：").strip() == "是"
        elif stripped.startswith("当前步骤："):
            match = re.search(r"当前步骤：(\d+)", stripped)
            if match:
                result["step_id"] = int(match.group(1))
        elif stripped == "命令输出：":
            output_lines = []
            for output_line in lines[index + 1 :]:
                if output_line.strip() == "原始终端片段：":
                    break
                output_lines.append(output_line)
            result["output"] = "\n".join(output_lines).strip()
            break
    return result


def _extract_command_from_log(content: str) -> str:
    for line in content.splitlines():
        match = re.search(r"(?:\$|#)\s*(?P<cmd>.+)$", line.strip())
        if match:
            command = match.group("cmd").strip()
            if command:
                return command
    first_line = content.splitlines()[0].strip() if content.splitlines() else ""
    return first_line if " " in first_line and len(first_line) <= 120 else ""


def _infer_step_id(command: str, steps_config: list[dict[str, Any]]) -> int | None:
    normalized = command.strip()
    for step in steps_config:
        candidates = []
        candidates.extend(step.get("try_commands", []))
        candidates.extend(step.get("keywords", []))
        for check in step.get("verification", {}).get("checks", []):
            commands = check.get("commands")
            if isinstance(commands, list):
                candidates.extend(commands)
            if check.get("command"):
                candidates.append(check["command"])
        if any(str(candidate) and normalized.startswith(str(candidate)) for candidate in candidates):
            return int(step.get("id", 0))
    return None


def _step_title(step_id: int | None, steps_config: list[dict[str, Any]]) -> str:
    if step_id is None:
        return "未关联到具体步骤"
    for step in steps_config:
        if int(step.get("id", 0)) == step_id:
            return step.get("title", f"步骤{step_id}")
    return "未关联到具体步骤"


def _teaching_value(command: str, step_id: int | None, steps_config: list[dict[str, Any]]) -> str:
    title = _step_title(step_id, steps_config)
    if step_id is None:
        return "记录学生自主尝试的命令，可作为教师观察操作习惯的辅助证据。"
    return f"该命令用于支撑“{title}”的学习目标。"


def _classify_error(text: str) -> tuple[str, str]:
    for label, pattern, suggestion in ERROR_PATTERNS:
        if pattern.search(text):
            return label, suggestion
    return "", ""


def _feedback_type(response: str, parsed: dict[str, Any], evidence: dict[str, Any]) -> str:
    if parsed.get("is_error") or evidence.get("is_error") or _classify_error(response)[0]:
        return "错误纠正"
    if "下一步" in response or "接下来" in response:
        return "下一步建议"
    if "通过" in parsed.get("output", "") or evidence.get("step_id"):
        return "成功引导"
    return "知识解释"


def _recommendations(unfinished: list[dict[str, Any]], typical_errors: list[dict[str, str]]) -> list[str]:
    recommendations = []
    if unfinished:
        command_text = "、".join(
            command
            for item in unfinished[:2]
            for command in item.get("try_commands", [])[:1]
            if command
        )
        if command_text:
            recommendations.append(f"优先重新练习 {command_text}，完成未通过步骤后再生成报告复盘。")
    if typical_errors:
        recommendations.append("遇到报错时先读错误关键词，再检查命令拼写、当前路径和目标文件是否存在。")
    recommendations.append("每次文件或目录操作后，用 ls -l 或 pwd 验证当前状态，形成操作闭环。")
    return recommendations[:4]


def _duration_text(start_time: str | None, end_time: str | None) -> str:
    if not start_time:
        return "未记录"
    try:
        start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_time.replace("Z", "+00:00")) if end_time else datetime.now(timezone.utc)
    except ValueError:
        return "未记录"
    minutes = max(round((end - start).total_seconds() / 60), 0)
    if minutes < 60:
        return f"{minutes} 分钟"
    hours, rest = divmod(minutes, 60)
    return f"{hours} 小时 {rest} 分钟"


def _overview_conclusion(completion_rate: int, total_steps: int) -> str:
    if total_steps == 0:
        return "实验暂未配置步骤，建议教师先检查实验任务配置。"
    if completion_rate == 100:
        return "实验目标基本达成，学生完成了全部核心步骤。"
    if completion_rate >= 70:
        return "主要流程已完成，仍有个别步骤需要巩固。"
    return "建议重新完成未通过步骤，并复盘关键命令。"


def _truncate(text: str, limit: int) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _e(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _md(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def _list_html(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{_e(item)}</li>" for item in items) + "</ul>"


def _report_css() -> str:
    return """
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef1f4; color: #1f2933; font-family: Arial, "Microsoft YaHei", sans-serif; line-height: 1.65; }
    .report { max-width: 1120px; margin: 0 auto; background: #fff; min-height: 100vh; }
    .cover { min-height: 520px; padding: 72px 72px 48px; background: linear-gradient(135deg, #f8fafc, #eef4f1); border-bottom: 6px solid #2f6f5e; }
    .platform { color: #2f6f5e; font-weight: 700; letter-spacing: 0; margin: 0 0 56px; }
    h1 { font-size: 40px; margin: 0 0 48px; letter-spacing: 0; }
    h2 { font-size: 24px; margin: 0 0 18px; letter-spacing: 0; }
    h3 { font-size: 16px; margin: 0 0 10px; letter-spacing: 0; }
    .cover-grid { display: grid; grid-template-columns: 120px 1fr; gap: 14px 22px; max-width: 720px; }
    .cover-grid span { color: #64748b; }
    .cover-grid strong { color: #111827; }
    .section { padding: 34px 72px; border-bottom: 1px solid #e5e7eb; }
    .objective, .conclusion { background: #f8fafc; border-left: 4px solid #2f6f5e; padding: 12px 14px; margin: 14px 0; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .metric-grid div { border: 1px solid #d8dee6; padding: 14px; background: #fbfcfd; }
    .metric-grid strong { display: block; font-size: 24px; color: #1f4f46; }
    .metric-grid span { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #d8dee6; padding: 10px; vertical-align: top; text-align: left; }
    th { background: #f3f6f8; color: #334155; }
    code, pre { font-family: Consolas, "Courier New", monospace; overflow-wrap: anywhere; }
    pre { white-space: pre-wrap; background: #f8fafc; border: 1px solid #d8dee6; padding: 12px; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #eef2f7; color: #334155; }
    .status-confirmed, .status-completed { background: #e8f5ef; color: #1f6b54; }
    .status-pending { background: #fff7e6; color: #9a5b00; }
    .evidence-list, .coach-list, .analysis-grid { display: grid; gap: 12px; }
    .analysis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .evidence, .coach, .analysis-grid > div { border: 1px solid #d8dee6; padding: 14px; background: #fbfcfd; }
    .evidence-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 10px; }
    dl { display: grid; grid-template-columns: 90px 1fr; gap: 6px 12px; margin: 0; }
    dt { color: #64748b; }
    dd { margin: 0; }
    time { color: #64748b; font-size: 12px; margin-left: 8px; }
    .teacher-grid { display: grid; gap: 8px; margin-bottom: 16px; }
    .teacher-grid p { margin: 0; }
    .sign-box { min-height: 120px; border: 1px dashed #94a3b8; padding: 12px; margin: 16px 0; }
    .sign-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .empty { color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; padding: 12px; }
    @media print {
      body { background: #fff; }
      .report { max-width: none; }
      .cover { min-height: 420px; }
      .section { page-break-inside: avoid; }
    }
    @media (max-width: 760px) {
      .cover, .section { padding: 28px 22px; }
      h1 { font-size: 30px; }
      .metric-grid, .analysis-grid, .sign-row { grid-template-columns: 1fr; }
      .cover-grid { grid-template-columns: 1fr; }
    }
    """
