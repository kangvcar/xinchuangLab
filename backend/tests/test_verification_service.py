import asyncio
from types import SimpleNamespace

from app.docker_manager import DockerManager
from app.log_processor import CommandEvent
from app.verification_service import VerificationService


def event(command: str, *, cwd: str = "/home/student", exit_code: int = 0) -> CommandEvent:
    return CommandEvent(
        command=command,
        output="",
        is_error=exit_code != 0,
        raw_context=command,
        trigger_reason="structured-command",
        cwd=cwd,
        exit_code=exit_code,
        source="bash-hook",
        confidence="high",
    )


def manager() -> DockerManager:
    return DockerManager(
        SimpleNamespace(
            lab_runtime="docker",
            public_host="localhost",
            docker_ws_host="host.docker.internal",
            allow_mock_fallback=False,
        )
    )


def test_command_match_preserves_spaces():
    service = VerificationService(manager())
    session = {"container_name": "linux-ai-test"}
    step = {
        "verification": {
            "checks": [{"type": "command_match", "commands": ["mkdir linux_lab"]}]
        }
    }

    result = asyncio.run(
        service.verify_step(
            session=session,
            step=step,
            command_event=event("mkdir linux_lab"),
            terminal_logs=[],
            command_events=[event("mkdir linux_lab")],
        )
    )

    assert result["passed"] is True


def test_path_exists_uses_docker_exec(monkeypatch):
    docker = manager()
    calls = []

    async def run_docker(*args: str):
        calls.append(args)
        return 0, "", ""

    monkeypatch.setattr(docker, "_run_docker", run_docker)
    service = VerificationService(docker)
    session = {"container_name": "linux-ai-test"}
    step = {
        "verification": {
            "checks": [{"type": "path_exists", "path": "linux_lab", "path_type": "dir"}]
        }
    }

    result = asyncio.run(
        service.verify_step(
            session=session,
            step=step,
            command_event=event("mkdir linux_lab"),
            terminal_logs=[],
            command_events=[event("mkdir linux_lab")],
        )
    )

    assert result["passed"] is True
    assert (
        "exec",
        "-u",
        "student",
        "linux-ai-test",
        "bash",
        "-lc",
        "cd /home/student && test -d linux_lab",
    ) in calls


def test_path_absent_failure_marks_step_unfinished(monkeypatch):
    docker = manager()

    async def run_docker(*_args: str):
        return 1, "", "still exists"

    monkeypatch.setattr(docker, "_run_docker", run_docker)
    service = VerificationService(docker)
    session = {"container_name": "linux-ai-test"}
    step = {
        "verification": {
            "checks": [{"type": "path_absent", "path": "renamed.txt"}]
        }
    }

    result = asyncio.run(
        service.verify_step(
            session=session,
            step=step,
            command_event=event("rm renamed.txt"),
            terminal_logs=[],
            command_events=[event("rm renamed.txt")],
        )
    )

    assert result["passed"] is False
