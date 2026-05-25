from __future__ import annotations

import shlex
from typing import Any

from .docker_manager import DockerManager
from .log_processor import CommandEvent
from .step_verifier import StepVerifier


class VerificationService:
    """Verifies experiment steps from structured events and container state."""

    def __init__(self, docker_manager: DockerManager):
        self.docker_manager = docker_manager
        self.legacy_verifier = StepVerifier()

    _DOCKER_CHECK_TYPES = frozenset(
        {"path_exists", "path_absent", "file_contains", "exec_exit_code", "exec_output_contains"}
    )

    async def verify_step(
        self,
        *,
        session: dict[str, Any],
        step: dict[str, Any],
        command_event: CommandEvent,
        terminal_logs: list[str],
        command_events: list[CommandEvent],
    ) -> dict[str, Any]:
        verification = step.get("verification")
        if verification:
            checks_config = verification.get("checks", [])
            if checks_config and self._needs_docker(checks_config) and not await self._docker_available():
                passed = self.legacy_verifier.verify(step, command_event, terminal_logs, command_events)
                return {
                    "passed": passed,
                    "mode": "legacy-fallback",
                    "checks": [
                        {
                            "type": "legacy-fallback",
                            "passed": passed,
                            "detail": "docker unavailable; fallback to legacy verify/keywords rule",
                        }
                    ],
                }
            checks = []
            for check in checks_config:
                checks.append(await self._run_check(session, check, command_event, command_events))
            mode = verification.get("mode", "all")
            passed = any(item["passed"] for item in checks) if mode == "any" else all(item["passed"] for item in checks)
            return {"passed": passed, "mode": mode, "checks": checks}

        passed = self.legacy_verifier.verify(step, command_event, terminal_logs, command_events)
        return {
            "passed": passed,
            "mode": "legacy",
            "checks": [
                {
                    "type": "legacy",
                    "passed": passed,
                    "detail": "legacy verify/keywords rule",
                }
            ],
        }

    @classmethod
    def _needs_docker(cls, checks: list[dict[str, Any]]) -> bool:
        return any(check.get("type", "") in cls._DOCKER_CHECK_TYPES for check in checks)

    async def _docker_available(self) -> bool:
        try:
            returncode, _, _ = await self.docker_manager._run_docker("version", "--format", "{{.Server.Version}}")
            return returncode == 0
        except Exception:
            return False

    async def _run_check(
        self,
        session: dict[str, Any],
        check: dict[str, Any],
        command_event: CommandEvent,
        command_events: list[CommandEvent],
    ) -> dict[str, Any]:
        check_type = check.get("type", "")
        if check_type == "command_match":
            commands = _as_list(check.get("commands") or check.get("command"))
            passed = bool(commands) and any(
                self.legacy_verifier._command_matches(command_event.command, expected) for expected in commands
            )
            if check.get("require_success", True) and command_event.exit_code not in (None, 0):
                passed = False
            return {
                "type": check_type,
                "passed": passed,
                "detail": f"command={command_event.command!r}, expected={commands}",
            }

        if check_type == "command_sequence":
            sequence = _as_list(check.get("sequence"))
            passed = self.legacy_verifier._verify_sequence(sequence, command_events)
            return {"type": check_type, "passed": passed, "detail": f"sequence={sequence}"}

        if check_type == "path_exists":
            path = str(check.get("path", "")).strip()
            path_type = check.get("path_type", "any")
            if not path:
                return {"type": check_type, "passed": False, "detail": "path is empty"}
            flag = {"file": "-f", "dir": "-d", "directory": "-d"}.get(path_type, "-e")
            passed, detail = await self._docker_test(session, command_event, f"test {flag} {shlex.quote(path)}")
            return {"type": check_type, "passed": passed, "detail": detail}

        if check_type == "path_absent":
            path = str(check.get("path", "")).strip()
            if not path:
                return {"type": check_type, "passed": False, "detail": "path is empty"}
            passed, detail = await self._docker_test(session, command_event, f"test ! -e {shlex.quote(path)}")
            return {"type": check_type, "passed": passed, "detail": detail}

        if check_type == "file_contains":
            path = str(check.get("path", "")).strip()
            text = str(check.get("text", ""))
            if not path:
                return {"type": check_type, "passed": False, "detail": "path is empty"}
            script = f"grep -F -- {shlex.quote(text)} {shlex.quote(path)} >/dev/null"
            passed, detail = await self._docker_test(session, command_event, script)
            return {"type": check_type, "passed": passed, "detail": detail}

        if check_type == "exec_exit_code":
            command = str(check.get("command", "")).strip()
            expected = int(check.get("exit_code", 0))
            if not command:
                return {"type": check_type, "passed": False, "detail": "command is empty"}
            returncode, stdout, stderr = await self._docker_exec(session, command_event, command)
            return {
                "type": check_type,
                "passed": returncode == expected,
                "detail": _exec_detail(command, returncode, stdout, stderr),
            }

        if check_type == "exec_output_contains":
            command = str(check.get("command", "")).strip()
            contains = _as_list(check.get("contains"))
            if not command:
                return {"type": check_type, "passed": False, "detail": "command is empty"}
            returncode, stdout, stderr = await self._docker_exec(session, command_event, command)
            output = f"{stdout}\n{stderr}"
            return {
                "type": check_type,
                "passed": returncode == 0 and any(item in output for item in contains),
                "detail": _exec_detail(command, returncode, stdout, stderr),
            }

        return {"type": check_type or "unknown", "passed": False, "detail": "unknown verification check"}

    async def _docker_test(
        self,
        session: dict[str, Any],
        command_event: CommandEvent,
        script: str,
    ) -> tuple[bool, str]:
        returncode, stdout, stderr = await self._docker_exec(session, command_event, script)
        return returncode == 0, _exec_detail(script, returncode, stdout, stderr)

    async def _docker_exec(
        self,
        session: dict[str, Any],
        command_event: CommandEvent,
        script: str,
    ) -> tuple[int, str, str]:
        container_ref = session.get("container_name") or session.get("container_id")
        if not container_ref:
            return 127, "", "session has no container reference"
        cwd = command_event.cwd or "/home/student"
        command = f"cd {shlex.quote(cwd)} && {script}"
        try:
            return await self.docker_manager._run_docker(
                "exec",
                "-u",
                "student",
                container_ref,
                "bash",
                "-lc",
                command,
            )
        except (RuntimeError, OSError) as exc:
            return 127, "", str(exc)


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _exec_detail(command: str, returncode: int, stdout: str, stderr: str) -> str:
    detail = (stderr or stdout).strip()
    if detail:
        detail = detail.replace("\n", " ")[:300]
    else:
        detail = "no output"
    return f"{command!r} exit={returncode}; {detail}"
