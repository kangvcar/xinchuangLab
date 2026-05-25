from __future__ import annotations

import asyncio
import shutil
import socket
import subprocess
import uuid
from dataclasses import dataclass
from typing import Any

from .config import Settings


@dataclass
class RuntimeInfo:
    mode: str
    container_id: str | None
    container_name: str | None
    terminal_url: str | None


class DockerManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def start(self, *, session_id: str, student_id: str, experiment: dict) -> RuntimeInfo:
        if self.settings.lab_runtime == "mock":
            return RuntimeInfo(mode="mock", container_id=None, container_name=None, terminal_url=None)
        if self.settings.lab_runtime != "docker":
            raise RuntimeError(f"unsupported LAB_RUNTIME: {self.settings.lab_runtime}")
        return await self._start_docker(session_id=session_id, student_id=student_id, experiment=experiment)

    async def stop(self, session: dict) -> None:
        container_ref = session.get("container_name") or session.get("container_id")
        if not container_ref:
            return
        returncode, stdout, stderr = await self._run_docker(
            "rm",
            "-f",
            container_ref,
        )
        if returncode != 0:
            error_msg = self._docker_error_message(("rm", "-f", container_ref), returncode, stdout=stdout, stderr=stderr)
            if "no such container" in error_msg.lower():
                return
            raise RuntimeError(error_msg)

    async def preflight(self, experiments: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Return Docker availability diagnostics for health checks."""
        result: dict[str, Any] = {
            "runtime": self.settings.lab_runtime,
            "cli_path": shutil.which("docker"),
            "cli_available": False,
            "server_available": False,
            "context": None,
            "server_version": None,
            "images": [],
            "error": None,
        }
        if self.settings.lab_runtime != "docker":
            return result

        if not result["cli_path"]:
            result["error"] = "docker CLI not found on PATH"
            return result
        result["cli_available"] = True

        context = await self._diagnose_command("context", "show")
        if context["ok"]:
            result["context"] = context["stdout"].strip()
        else:
            result["error"] = context["error"]
            return result

        version = await self._diagnose_command("version", "--format", "{{.Server.Version}}")
        if version["ok"]:
            result["server_available"] = True
            result["server_version"] = version["stdout"].strip()
        else:
            result["error"] = version["error"]

        image_names = sorted(
            {
                str(experiment.get("image_name", "")).strip()
                for experiment in (experiments or [])
                if str(experiment.get("image_name", "")).strip()
            }
        )
        for image_name in image_names:
            image_info: dict[str, Any] = {
                "name": image_name,
                "exists": False,
                "id": None,
                "error": None,
            }
            if not result["server_available"]:
                image_info["error"] = "docker server unavailable"
            else:
                inspected = await self._diagnose_command(
                    "image",
                    "inspect",
                    image_name,
                    "--format",
                    "{{.Id}}",
                )
                if inspected["ok"]:
                    image_info["exists"] = True
                    image_info["id"] = inspected["stdout"].strip()
                else:
                    image_info["error"] = inspected["error"]
            result["images"].append(image_info)

        return result

    async def _start_docker(self, *, session_id: str, student_id: str, experiment: dict) -> RuntimeInfo:
        image_name = experiment["image_name"]
        if not image_name:
            raise RuntimeError("experiment image_name is empty")
        port = _find_free_port()
        safe_suffix = uuid.uuid4().hex[:8]
        container_name = f"linux-ai-{student_id}-{experiment['id']}-{safe_suffix}".replace("_", "-").lower()
        ws_url = f"ws://{self.settings.docker_ws_host}:8000/ws/terminal-log"
        returncode, stdout, stderr = await self._run_docker(
            "run",
            "-d",
            "--rm",
            "--name",
            container_name,
            "--label",
            f"linux-ai.session_id={session_id}",
            "--label",
            f"linux-ai.student_id={student_id}",
            "--label",
            f"linux-ai.experiment_id={experiment['id']}",
            "--cpus=1",
            "--memory=1g",
            "--add-host=host.docker.internal:host-gateway",
            "-e",
            f"SESSION_ID={session_id}",
            "-e",
            f"STUDENT_ID={student_id}",
            "-e",
            f"EXPERIMENT_ID={experiment['id']}",
            "-e",
            f"WS_SERVER={ws_url}",
            "-p",
            f"{port}:7681",
            image_name,
        )
        if returncode != 0:
            raise RuntimeError(self._docker_error_message(("run",), returncode, stdout, stderr))
        container_id = stdout.strip()
        if not container_id:
            raise RuntimeError(
                "docker run succeeded but did not return a container id"
                f" (stdout={stdout.strip() or '<empty>'}, stderr={stderr.strip() or '<empty>'})"
            )
        return RuntimeInfo(
            mode="docker",
            container_id=container_id,
            container_name=container_name,
            terminal_url=f"http://{self.settings.public_host}:{port}",
        )

    async def _run_docker(self, *args: str) -> tuple[int, str, str]:
        command = ("docker", *args)
        try:
            completed = await asyncio.to_thread(
                subprocess.run,
                command,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore",
                timeout=30,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("docker CLI not found on PATH") from exc
        except subprocess.TimeoutExpired as exc:
            stdout = _as_text(exc.stdout)
            stderr = _as_text(exc.stderr)
            detail = stderr.strip() or stdout.strip() or "no output before timeout"
            raise RuntimeError(f"{self._docker_command_label(args)} timed out after 30s: {detail}") from exc
        except Exception as exc:
            detail = str(exc).strip() or type(exc).__name__
            raise RuntimeError(f"{self._docker_command_label(args)} failed before execution: {detail}") from exc
        return (
            completed.returncode,
            completed.stdout or "",
            completed.stderr or "",
        )

    async def _diagnose_command(self, *args: str) -> dict[str, Any]:
        try:
            returncode, stdout, stderr = await self._run_docker(*args)
        except Exception as exc:
            return {
                "ok": False,
                "returncode": None,
                "stdout": "",
                "stderr": "",
                "error": str(exc).strip() or type(exc).__name__,
            }
        if returncode == 0:
            return {
                "ok": True,
                "returncode": returncode,
                "stdout": stdout,
                "stderr": stderr,
                "error": None,
            }
        return {
            "ok": False,
            "returncode": returncode,
            "stdout": stdout,
            "stderr": stderr,
            "error": self._docker_error_message(args, returncode, stdout, stderr),
        }

    def _docker_error_message(self, args: tuple[str, ...], returncode: int, stdout: str, stderr: str) -> str:
        detail = stderr.strip() or stdout.strip() or "no output"
        return f"{self._docker_command_label(args)} failed with exit code {returncode}: {detail}"

    def _docker_command_label(self, args: tuple[str, ...]) -> str:
        return "docker " + " ".join(args)


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)
