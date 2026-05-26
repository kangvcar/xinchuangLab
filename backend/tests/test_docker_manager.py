import asyncio
import subprocess
from types import SimpleNamespace

import pytest

from app import docker_manager as docker_module
from app.docker_manager import DockerManager


def settings(
    runtime: str = "docker",
    *,
    backend_public_url: str = "http://localhost:8000",
    docker_ws_url: str = "",
) -> SimpleNamespace:
    return SimpleNamespace(
        lab_runtime=runtime,
        public_host="localhost",
        backend_public_url=backend_public_url,
        docker_ws_host="host.docker.internal",
        docker_ws_url=docker_ws_url,
        allow_mock_fallback=True,
    )


def test_mock_runtime_returns_mock_info() -> None:
    manager = DockerManager(settings("mock"))

    runtime = asyncio.run(
        manager.start(
            session_id="session-1",
            student_id="stu001",
            experiment={"id": "file-basic", "image_name": "linux-ai-exp:test"},
        )
    )

    assert runtime.mode == "mock"
    assert runtime.container_id is None
    assert runtime.container_name is None
    assert runtime.terminal_url is None


def test_docker_runtime_start_failure_is_not_mock_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    async def fail_start(**_kwargs):
        raise RuntimeError("docker daemon unavailable")

    monkeypatch.setattr(manager, "_start_docker", fail_start)

    with pytest.raises(RuntimeError, match="docker daemon unavailable"):
        asyncio.run(
            manager.start(
                session_id="session-1",
                student_id="stu001",
                experiment={"id": "file-basic", "image_name": "linux-ai-exp:test"},
            )
        )


def test_start_failure_uses_docker_stdout_when_stderr_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    async def run_docker(*_args: str):
        return 1, "daemon says no", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    with pytest.raises(RuntimeError, match="docker run failed with exit code 1: daemon says no"):
        asyncio.run(
            manager.start(
                session_id="session-1",
                student_id="stu001",
                experiment={"id": "file-basic", "image_name": "linux-ai-exp:test"},
            )
        )


def test_start_success_requires_container_id(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    async def run_docker(*_args: str):
        return 0, "  ", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    with pytest.raises(RuntimeError, match="did not return a container id"):
        asyncio.run(
            manager.start(
                session_id="session-1",
                student_id="stu001",
                experiment={"id": "file-basic", "image_name": "linux-ai-exp:test"},
            )
        )


def test_terminal_event_ws_url_uses_backend_public_url_port() -> None:
    manager = DockerManager(settings("docker", backend_public_url="http://localhost:8001"))

    assert manager.terminal_event_ws_url() == "ws://host.docker.internal:8001/ws/terminal-log"


def test_terminal_event_ws_url_prefers_explicit_override() -> None:
    manager = DockerManager(
        settings(
            "docker",
            backend_public_url="http://localhost:8001",
            docker_ws_url="ws://docker-host:19000/ws/terminal-log",
        )
    )

    assert manager.terminal_event_ws_url() == "ws://docker-host:19000/ws/terminal-log"


def test_start_passes_terminal_event_ws_url_from_backend_public_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = DockerManager(settings("docker", backend_public_url="http://localhost:8001"))
    calls: list[tuple[str, ...]] = []

    async def run_docker(*args: str):
        calls.append(args)
        return 0, "container-id\n", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    asyncio.run(
        manager.start(
            session_id="session-1",
            student_id="stu001",
            experiment={"id": "file-basic", "image_name": "linux-ai-exp:test"},
        )
    )

    run_args = calls[0]
    assert "WS_SERVER=ws://host.docker.internal:8001/ws/terminal-log" in run_args
    assert "WS_SERVER=ws://host.docker.internal:8000/ws/terminal-log" not in run_args


def test_run_docker_reports_empty_exception_type(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    def fail_run(*_args, **_kwargs):
        raise RuntimeError()

    monkeypatch.setattr(docker_module.subprocess, "run", fail_run)

    with pytest.raises(RuntimeError, match="RuntimeError"):
        asyncio.run(manager._run_docker("version"))


def test_run_docker_reports_missing_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    def fail_run(*_args, **_kwargs):
        raise FileNotFoundError()

    monkeypatch.setattr(docker_module.subprocess, "run", fail_run)

    with pytest.raises(RuntimeError, match="docker CLI not found on PATH"):
        asyncio.run(manager._run_docker("version"))


def test_run_docker_reports_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    def fail_run(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd=("docker", "version"), timeout=30, output="partial", stderr="too slow")

    monkeypatch.setattr(docker_module.subprocess, "run", fail_run)

    with pytest.raises(RuntimeError, match="docker version timed out after 30s: too slow"):
        asyncio.run(manager._run_docker("version"))


def test_stop_removes_container_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))
    calls = []

    async def run_docker(*args: str):
        calls.append(args)
        return 0, "", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    asyncio.run(
        manager.stop(
            {
                "runtime_mode": "docker",
                "container_name": "linux-ai-name",
                "container_id": "container-id",
            }
        )
    )

    assert calls == [("rm", "-f", "linux-ai-name")]


def test_stop_falls_back_to_container_id(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))
    calls = []

    async def run_docker(*args: str):
        calls.append(args)
        return 0, "", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    asyncio.run(
        manager.stop(
            {
                "runtime_mode": "docker",
                "container_name": None,
                "container_id": "container-id",
            }
        )
    )

    assert calls == [("rm", "-f", "container-id")]


def test_stop_uses_container_reference_even_when_runtime_mode_is_stale(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager = DockerManager(settings("docker"))
    calls = []

    async def run_docker(*args: str):
        calls.append(args)
        return 0, "", ""

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    asyncio.run(
        manager.stop(
            {
                "runtime_mode": "mock",
                "container_name": "linux-ai-stale",
                "container_id": "container-id",
            }
        )
    )

    assert calls == [("rm", "-f", "linux-ai-stale")]


def test_stop_ignores_missing_container(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    async def run_docker(*_args: str):
        return 1, "", "Error response from daemon: No such container: linux-ai-name"

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    asyncio.run(
        manager.stop(
            {
                "runtime_mode": "docker",
                "container_name": "linux-ai-name",
                "container_id": None,
            }
        )
    )


def test_stop_raises_other_docker_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))

    async def run_docker(*_args: str):
        return 1, "", "permission denied"

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    with pytest.raises(RuntimeError, match="permission denied"):
        asyncio.run(
            manager.stop(
                {
                    "runtime_mode": "docker",
                    "container_name": "linux-ai-name",
                    "container_id": None,
                }
            )
        )


def test_preflight_reports_missing_docker_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))
    monkeypatch.setattr(docker_module.shutil, "which", lambda _name: None)

    diagnostics = asyncio.run(manager.preflight([{"image_name": "linux-ai-exp:test"}]))

    assert diagnostics["terminal_event_ws_url"] == "ws://host.docker.internal:8000/ws/terminal-log"
    assert diagnostics["warnings"] == []
    assert diagnostics["cli_available"] is False
    assert diagnostics["server_available"] is False
    assert diagnostics["error"] == "docker CLI not found on PATH"


def test_preflight_reports_server_and_missing_image(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = DockerManager(settings("docker"))
    monkeypatch.setattr(docker_module.shutil, "which", lambda _name: "C:/Docker/docker.exe")

    async def run_docker(*args: str):
        if args == ("context", "show"):
            return 0, "desktop-linux\n", ""
        if args == ("version", "--format", "{{.Server.Version}}"):
            return 0, "29.4.3\n", ""
        if args == ("image", "inspect", "linux-ai-exp:test", "--format", "{{.Id}}"):
            return 1, "", "No such image: linux-ai-exp:test"
        raise AssertionError(args)

    monkeypatch.setattr(manager, "_run_docker", run_docker)

    diagnostics = asyncio.run(manager.preflight([{"image_name": "linux-ai-exp:test"}]))

    assert diagnostics["cli_available"] is True
    assert diagnostics["server_available"] is True
    assert diagnostics["context"] == "desktop-linux"
    assert diagnostics["server_version"] == "29.4.3"
    assert diagnostics["images"] == [
        {
            "name": "linux-ai-exp:test",
            "exists": False,
            "id": None,
            "error": "docker image inspect linux-ai-exp:test --format {{.Id}} failed with exit code 1: No such image: linux-ai-exp:test",
        }
    ]
