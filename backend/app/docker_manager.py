from __future__ import annotations

import asyncio
import socket
import uuid
from dataclasses import dataclass

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
        if self.settings.lab_runtime != "docker":
            return RuntimeInfo(mode="mock", container_id=None, container_name=None, terminal_url=None)
        try:
            return await self._start_docker(session_id=session_id, student_id=student_id, experiment=experiment)
        except Exception:
            if self.settings.allow_mock_fallback:
                return RuntimeInfo(mode="mock", container_id=None, container_name=None, terminal_url=None)
            raise

    async def stop(self, session: dict) -> None:
        if session.get("runtime_mode") != "docker" or not session.get("container_name"):
            return
        process = await asyncio.create_subprocess_exec(
            "docker",
            "rm",
            "-f",
            session["container_name"],
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="ignore").strip() or "docker rm failed"
            raise RuntimeError(error_msg)

    async def _start_docker(self, *, session_id: str, student_id: str, experiment: dict) -> RuntimeInfo:
        image_name = experiment["image_name"]
        if not image_name:
            raise RuntimeError("experiment image_name is empty")
        port = _find_free_port()
        safe_suffix = uuid.uuid4().hex[:8]
        container_name = f"linux-ai-{student_id}-{experiment['id']}-{safe_suffix}".replace("_", "-").lower()
        ws_url = f"ws://{self.settings.docker_ws_host}:8000/ws/terminal-log"
        process = await asyncio.create_subprocess_exec(
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            container_name,
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
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(stderr.decode("utf-8", errors="ignore") or "docker run failed")
        container_id = stdout.decode("utf-8", errors="ignore").strip()
        return RuntimeInfo(
            mode="docker",
            container_id=container_id,
            container_name=container_name,
            terminal_url=f"http://{self.settings.public_host}:{port}",
        )


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
