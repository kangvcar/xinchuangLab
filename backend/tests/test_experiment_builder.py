import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import experiment_builder as builder_module
from app.config import BACKEND_ROOT, settings as app_settings
from app.database import Database
from app.experiment_builder import (
    BuildCommandResult,
    ExperimentBuildError,
    ExperimentBuildService,
    _format_build_error,
    prepare_build_draft,
    render_dockerfile,
)


def draft() -> dict:
    return {
        "experiment_id": "demo-lab",
        "name": "Demo Lab",
        "system": "openEuler",
        "image_name": "linux-ai-exp:demo-lab-v1",
        "objective": "练习目录操作",
        "schema_version": 2,
        "steps": [{"id": 1, "title": "查看目录"}],
        "container_spec": {
            "packages": ["tree"],
            "pip_packages": ["requests"],
            "npm_packages": ["typescript"],
            "student_dirs": ["linux_lab"],
            "student_files": [{"path": "linux_lab/readme.txt", "content": "hello"}],
        },
    }


def service(tmp_path: Path) -> tuple[ExperimentBuildService, Database]:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    settings = SimpleNamespace(builds_dir=tmp_path / "builds")
    return ExperimentBuildService(db, settings), db


def test_render_dockerfile_uses_domestic_sources() -> None:
    dockerfile = render_dockerfile(prepare_build_draft(draft()))

    assert "https://repo.huaweicloud.com/openeuler" in dockerfile
    assert "https://pypi.tuna.tsinghua.edu.cn/simple" in dockerfile
    assert "https://registry.npmmirror.com" in dockerfile
    assert 'python3 -m pip install --no-cache-dir -i "$PIP_INDEX_URL" websockets requests' in dockerfile
    assert 'npm install -g --registry "$NPM_REGISTRY" typescript' in dockerfile
    assert "COPY --chown=student:student student_files/ /home/student/" in dockerfile


def test_default_build_context_dir_is_outside_backend_generated() -> None:
    generated_dir = BACKEND_ROOT / "generated"

    assert generated_dir not in app_settings.builds_dir.parents
    assert app_settings.builds_dir != generated_dir / "builds"


def test_prepare_build_rejects_empty_steps() -> None:
    payload = draft()
    payload["steps"] = []

    with pytest.raises(ExperimentBuildError, match="实验步骤不能为空"):
        prepare_build_draft(payload)


def test_prepare_build_rejects_unsafe_container_spec() -> None:
    payload = draft()
    payload["container_spec"]["student_files"] = [{"path": "/etc/passwd", "content": "bad"}]

    with pytest.raises(ExperimentBuildError, match="学生目录相对路径"):
        prepare_build_draft(payload)


def test_prepare_build_rejects_system_name_as_image_name() -> None:
    payload = draft()
    payload["image_name"] = "openEuler"

    with pytest.raises(ExperimentBuildError, match="Docker 镜像名不合法"):
        prepare_build_draft(payload)


def test_build_success_publishes_experiment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    build_service, db = service(tmp_path)
    payload = prepare_build_draft(draft())
    dockerfile = render_dockerfile(payload)
    context_dir = build_service._create_build_context("build-1", payload, dockerfile)
    db.create_experiment_build(
        build_id="build-1",
        experiment_id=payload["experiment_id"],
        image_name=payload["image_name"],
        dockerfile=dockerfile,
        draft_config=payload,
    )

    def fake_run(_command, _cwd, on_line):
        on_line("#1 DONE\n")
        return BuildCommandResult(0, output_seen=True, saw_build_step=True)

    monkeypatch.setattr(builder_module, "_run_streaming_command", fake_run)

    asyncio.run(build_service._run_build("build-1", context_dir, payload))

    build = db.get_experiment_build("build-1")
    experiment = db.get_experiment("demo-lab")
    assert build is not None
    assert build["status"] == "succeeded"
    assert "#1 DONE" in build["logs"]
    assert experiment is not None
    assert experiment["status"] == "published"
    assert experiment["image_name"] == "linux-ai-exp:demo-lab-v1"


def test_build_failure_does_not_publish_experiment(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    build_service, db = service(tmp_path)
    payload = prepare_build_draft(draft())
    dockerfile = render_dockerfile(payload)
    context_dir = build_service._create_build_context("build-2", payload, dockerfile)
    db.create_experiment_build(
        build_id="build-2",
        experiment_id=payload["experiment_id"],
        image_name=payload["image_name"],
        dockerfile=dockerfile,
        draft_config=payload,
    )

    def fake_run(_command, _cwd, on_line):
        on_line("network failed\n")
        return BuildCommandResult(1, "network failed", output_seen=True)

    monkeypatch.setattr(builder_module, "_run_streaming_command", fake_run)

    asyncio.run(build_service._run_build("build-2", context_dir, payload))

    build = db.get_experiment_build("build-2")
    assert build is not None
    assert build["status"] == "failed"
    assert "network failed" in build["logs"]
    assert db.get_experiment("demo-lab") is None


def test_windows_access_violation_error_is_diagnostic() -> None:
    message = _format_build_error(BuildCommandResult(3221225477))

    assert "0xC0000005" in message
    assert "Docker CLI/BuildKit" in message
    assert "Docker 构建器未开始输出 build step" in message


def test_build_retries_windows_access_violation_then_publishes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    build_service, db = service(tmp_path)
    payload = prepare_build_draft(draft())
    dockerfile = render_dockerfile(payload)
    context_dir = build_service._create_build_context("build-3", payload, dockerfile)
    db.create_experiment_build(
        build_id="build-3",
        experiment_id=payload["experiment_id"],
        image_name=payload["image_name"],
        dockerfile=dockerfile,
        draft_config=payload,
    )
    calls = 0

    def fake_run(_command, _cwd, on_line):
        nonlocal calls
        calls += 1
        if calls == 1:
            return BuildCommandResult(3221225477)
        on_line("#1 DONE\n")
        return BuildCommandResult(0, output_seen=True, saw_build_step=True)

    monkeypatch.setattr(builder_module, "_run_streaming_command", fake_run)
    monkeypatch.setattr(builder_module, "WINDOWS_BUILD_CRASH_RETRY_DELAY_SECONDS", 0)

    asyncio.run(build_service._run_build("build-3", context_dir, payload))

    build = db.get_experiment_build("build-3")
    assert calls == 2
    assert build is not None
    assert build["status"] == "succeeded"
    assert "0xC0000005" in build["logs"]
    assert db.get_experiment("demo-lab") is not None


def test_recover_interrupted_build_publishes_when_image_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    build_service, db = service(tmp_path)
    payload = prepare_build_draft(draft())
    dockerfile = render_dockerfile(payload)
    db.create_experiment_build(
        build_id="build-recover-ok",
        experiment_id=payload["experiment_id"],
        image_name=payload["image_name"],
        dockerfile=dockerfile,
        draft_config=payload,
    )
    db.set_experiment_build_status("build-recover-ok", "running")
    monkeypatch.setattr(builder_module, "_docker_image_exists", lambda _image_name: True)

    asyncio.run(build_service.recover_interrupted_builds())

    build = db.get_experiment_build("build-recover-ok")
    assert build is not None
    assert build["status"] == "succeeded"
    assert "后端重启恢复" in build["logs"]
    assert db.get_experiment("demo-lab") is not None
    assert db.get_experiment("demo-lab")["status"] == "published"


def test_recover_interrupted_build_fails_when_image_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    build_service, db = service(tmp_path)
    payload = prepare_build_draft(draft())
    dockerfile = render_dockerfile(payload)
    db.create_experiment_build(
        build_id="build-recover-failed",
        experiment_id=payload["experiment_id"],
        image_name=payload["image_name"],
        dockerfile=dockerfile,
        draft_config=payload,
    )
    db.set_experiment_build_status("build-recover-failed", "running")
    monkeypatch.setattr(builder_module, "_docker_image_exists", lambda _image_name: False)

    asyncio.run(build_service.recover_interrupted_builds())

    build = db.get_experiment_build("build-recover-failed")
    assert build is not None
    assert build["status"] == "failed"
    assert "镜像未确认存在" in build["error"]
    assert db.get_experiment("demo-lab") is None
