from __future__ import annotations

import html
from pathlib import Path

from .database import Database


class ReportService:
    def __init__(self, db: Database, reports_dir: Path):
        self.db = db
        self.reports_dir = reports_dir
        self.reports_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, session_id: str) -> dict:
        session = self.db.get_session(session_id)
        if not session:
            raise ValueError("session not found")
        logs = self.db.list_terminal_logs(session_id, limit=500)
        ai_records = self.db.list_ai_records(session_id, limit=500)
        report_stem = f"{session_id}"
        markdown_path = self.reports_dir / f"{report_stem}.md"
        html_path = self.reports_dir / f"{report_stem}.html"
        markdown = self._render_markdown(session, logs, ai_records)
        markdown_path.write_text(markdown, encoding="utf-8")
        html_path.write_text(self._render_html(session, markdown, logs, ai_records), encoding="utf-8")
        return self.db.add_report(session_id, markdown_path, html_path)

    def _render_markdown(self, session: dict, logs: list[dict], ai_records: list[dict]) -> str:
        command_lines = "\n".join(f"- `{item['clean_content'][:180]}`" for item in logs) or "- 暂无终端记录"
        ai_lines = "\n\n".join(f"### {item['created_at']}\n\n{item['ai_response']}" for item in ai_records) or "暂无 AI 讲解记录。"
        return (
            f"# {session['experiment_name']}实训报告\n\n"
            f"- 学生：{session['student_id']}\n"
            f"- 系统：{session['system_type']}\n"
            f"- 会话：{session['id']}\n"
            f"- 开始时间：{session['start_time']}\n"
            f"- 状态：{session['status']}\n\n"
            "## 实验目标\n\n"
            f"{session['task_config'].get('objective', '')}\n\n"
            "## 主要终端记录\n\n"
            f"{command_lines}\n\n"
            "## AI陪练记录\n\n"
            f"{ai_lines}\n\n"
            "## 教师评价\n\n"
            "评语：\n\n"
            "等级：\n"
        )

    def _render_html(self, session: dict, markdown: str, logs: list[dict], ai_records: list[dict]) -> str:
        log_items = "".join(
            f"<li><time>{html.escape(item['timestamp'])}</time><pre>{html.escape(item['clean_content'])}</pre></li>"
            for item in logs
        ) or "<li>暂无终端记录</li>"
        ai_items = "".join(
            f"<section class='coach'><time>{html.escape(item['created_at'])}</time><div>{_paragraphs(item['ai_response'])}</div></section>"
            for item in ai_records
        ) or "<p>暂无 AI 讲解记录。</p>"
        return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(session['experiment_name'])}实训报告</title>
  <style>
    body {{ font-family: Arial, "Microsoft YaHei", sans-serif; color: #17202a; margin: 40px; line-height: 1.65; }}
    h1 {{ font-size: 26px; margin-bottom: 4px; }}
    h2 {{ font-size: 18px; margin-top: 28px; border-bottom: 1px solid #d8dee9; padding-bottom: 6px; }}
    .meta {{ display: grid; grid-template-columns: 120px 1fr; gap: 6px 14px; background: #f7f9fb; padding: 16px; border: 1px solid #e4e8ef; }}
    pre {{ white-space: pre-wrap; background: #111827; color: #e5e7eb; padding: 12px; border-radius: 6px; overflow-wrap: anywhere; }}
    li {{ margin-bottom: 12px; }}
    time {{ color: #667085; font-size: 12px; }}
    .coach {{ border: 1px solid #d9e2ec; padding: 14px; border-radius: 6px; margin: 12px 0; }}
    .sign {{ height: 96px; border: 1px dashed #98a2b3; padding: 12px; }}
  </style>
</head>
<body>
  <h1>{html.escape(session['experiment_name'])}实训报告</h1>
  <div class="meta">
    <strong>学生</strong><span>{html.escape(session['student_id'])}</span>
    <strong>系统</strong><span>{html.escape(session['system_type'])}</span>
    <strong>会话</strong><span>{html.escape(session['id'])}</span>
    <strong>开始时间</strong><span>{html.escape(session['start_time'])}</span>
    <strong>状态</strong><span>{html.escape(session['status'])}</span>
  </div>
  <h2>实验目标</h2>
  <p>{html.escape(session['task_config'].get('objective', ''))}</p>
  <h2>主要终端记录</h2>
  <ol>{log_items}</ol>
  <h2>AI陪练记录</h2>
  {ai_items}
  <h2>教师评价</h2>
  <div class="sign">评语：<br><br>等级：</div>
</body>
</html>
"""


def _paragraphs(text: str) -> str:
    return "".join(f"<p>{html.escape(part)}</p>" for part in text.split("\n\n") if part.strip())

