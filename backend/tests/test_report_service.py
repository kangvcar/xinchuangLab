from pathlib import Path

import pytest

from app.database import Database
from app.report_service import ReportService


STEPS = [
    {
        "id": 1,
        "title": "查看当前目录",
        "goal": "确认当前工作目录。",
        "try_commands": ["pwd"],
        "success_hint": "输出 /home/student。",
        "keywords": ["pwd"],
    },
    {
        "id": 2,
        "title": "创建实验目录",
        "goal": "创建 linux_lab 目录。",
        "try_commands": ["mkdir linux_lab"],
        "success_hint": "ls 能看到 linux_lab。",
        "keywords": ["mkdir", "linux_lab"],
    },
    {
        "id": 3,
        "title": "创建实验文件",
        "goal": "创建 hello.txt 文件。",
        "try_commands": ["touch hello.txt"],
        "success_hint": "ls -l hello.txt 能看到文件。",
        "keywords": ["touch", "hello.txt"],
    },
]


def prepare_db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    db.upsert_experiment(
        {
            "experiment_id": "file-basic",
            "name": "Linux 文件管理基础实验",
            "system": "openEuler",
            "image_name": "linux-ai-exp:openeuler-file-v1",
            "status": "active",
            "objective": "掌握 Linux 常用文件与目录管理命令。",
            "steps": STEPS,
        }
    )
    session = db.create_session(
        session_id="stu001-file-basic-demo",
        student_id="stu001",
        experiment_id="file-basic",
        container_id="container-1",
        container_name="linux-ai-demo",
        terminal_url="http://localhost:22222",
        runtime_mode="docker",
    )
    db.init_step_progress(session["id"], STEPS)
    return db


def add_ai_record(db: Database, session_id: str, command: str, output: str, *, is_error: bool, step_id: int) -> None:
    db.add_ai_record(
        session_id,
        (
            f"命令：{command}\n"
            "工作目录：/home/student\n"
            "退出码：1\n"
            f"是否错误：{'是' if is_error else '否'}\n"
            "触发原因：structured-command\n"
            "事件来源：bash-hook（置信度：high）\n"
            f"当前步骤：{step_id} - {STEPS[step_id - 1]['title']}\n"
            "步骤验证：通过\n"
            f"命令输出：\n{output}\n\n"
            f"原始终端片段：\nstudent@lab:~$ {command}\n{output}"
        ),
        f"{command} 的 AI 讲解内容，帮助学生理解操作结果和下一步建议。",
    )


def test_report_model_summarizes_learning_progress(tmp_path: Path) -> None:
    db = prepare_db(tmp_path)
    session_id = "stu001-file-basic-demo"
    db.update_step_status(session_id, 1, "completed", "2026-05-26T01:02:00Z")
    db.confirm_step(session_id, 1, 2)
    db.update_step_status(session_id, 2, "completed", "2026-05-26T01:05:00Z")
    db.add_terminal_log(session_id, "student@lab:~$ pwd\n/home/student\nstudent@lab:~$")
    db.add_terminal_log(session_id, "student@lab:~$ yyy\nyyy: command not found\nstudent@lab:~$")
    add_ai_record(db, session_id, "pwd", "/home/student", is_error=False, step_id=1)
    add_ai_record(db, session_id, "yyy", "yyy: command not found", is_error=True, step_id=2)

    model = ReportService(db, tmp_path / "reports").build_report_model(session_id)

    assert model["overview"]["completed_steps"] == 2
    assert model["overview"]["total_steps"] == 3
    assert model["overview"]["completion_rate"] == 67
    assert model["overview"]["command_count"] == 2
    assert model["overview"]["error_count"] == 1
    assert model["overview"]["ai_coach_count"] == 2
    assert model["steps"][0]["status_label"] == "已确认完成"
    assert model["steps"][1]["status_label"] == "已检测完成"
    assert model["steps"][2]["status_label"] == "未开始"
    assert model["evidence_items"][0]["command"] == "pwd"
    assert model["evidence_items"][1]["is_error"] is True
    assert model["learning_analysis"]["typical_errors"][0]["type"] == "命令不存在"
    assert "pwd" in " ".join(model["learning_analysis"]["strengths"])


def test_generate_writes_rich_markdown_and_html(tmp_path: Path) -> None:
    db = prepare_db(tmp_path)
    session_id = "stu001-file-basic-demo"
    db.update_step_status(session_id, 1, "completed", "2026-05-26T01:02:00Z")
    db.confirm_step(session_id, 1, 2)
    db.add_terminal_log(session_id, "student@lab:~$ pwd\n/home/student\nstudent@lab:~$")
    add_ai_record(db, session_id, "pwd", "/home/student", is_error=False, step_id=1)

    report = ReportService(db, tmp_path / "reports").generate(session_id)
    markdown = Path(report["markdown_path"]).read_text(encoding="utf-8")
    html = Path(report["html_path"]).read_text(encoding="utf-8")

    assert "Linux AI 陪练实训学习报告" in markdown
    assert "## 学习概览" in markdown
    assert "## 步骤完成记录" in markdown
    assert "## 关键操作证据" in markdown
    assert "## 教师评价区" in markdown
    assert "## 附录" not in markdown
    assert "完整终端记录" not in markdown
    assert "完整 AI 陪练记录" not in markdown
    assert "learning-overview" in html
    assert "teacher-signature" in html
    assert "appendix" not in html
    assert "完整终端记录" not in html
    assert "完整 AI 陪练记录" not in html


def test_report_handles_missing_logs_and_ai_records(tmp_path: Path) -> None:
    db = prepare_db(tmp_path)

    report = ReportService(db, tmp_path / "reports").generate("stu001-file-basic-demo")
    markdown = Path(report["markdown_path"]).read_text(encoding="utf-8")
    html = Path(report["html_path"]).read_text(encoding="utf-8")

    assert "暂无关键操作证据" in markdown
    assert "暂无 AI 陪练记录" in markdown
    assert "暂无 AI 陪练记录" in html
    assert "暂无终端记录" not in html
    assert "附录" not in html


def test_report_html_escapes_user_content(tmp_path: Path) -> None:
    db = prepare_db(tmp_path)
    session_id = "stu001-file-basic-demo"
    db.add_terminal_log(session_id, "student@lab:~$ echo '<script>alert(1)</script>'\n<script>alert(1)</script>")
    db.add_ai_record(
        session_id,
        "命令：echo '<script>alert(1)</script>'\n是否错误：否\n命令输出：\n<script>alert(1)</script>",
        "AI 解释 <script>alert(1)</script>",
    )

    report = ReportService(db, tmp_path / "reports").generate(session_id)
    html = Path(report["html_path"]).read_text(encoding="utf-8")

    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_generate_unknown_session_raises_value_error(tmp_path: Path) -> None:
    db = prepare_db(tmp_path)

    with pytest.raises(ValueError, match="session not found"):
        ReportService(db, tmp_path / "reports").generate("missing-session")
