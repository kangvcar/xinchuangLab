from __future__ import annotations

import asyncio
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .config import PROJECT_ROOT, Settings
from .database import Database
from .experiment_designer import (
    DEFAULT_BASE_IMAGE,
    DEFAULT_NPM_REGISTRY,
    DEFAULT_OPENEULER_MIRROR,
    DEFAULT_PIP_INDEX_URL,
    ensure_experiment_draft_defaults,
    is_valid_experiment_image_name,
    validate_container_spec,
)


RUNTIME_DOCKER_DIR = PROJECT_ROOT / "docker" / "openeuler-file"
RUNTIME_FILES = [
    "start-lab.sh",
    "ws_client.py",
    "bash-instrumentation.sh",
    "record_command_event.py",
]
RUNTIME_PACKAGES = [
    "bash",
    "python3",
    "python3-pip",
    "shadow",
    "util-linux",
    "vim-minimal",
    "findutils",
    "tree",
    "curl",
    "wget",
    "iproute",
    "net-tools",
    "procps-ng",
    "sudo",
    "tmux",
]
WINDOWS_ACCESS_VIOLATION_EXIT_CODES = {3221225477, -1073741819}
WINDOWS_BUILD_CRASH_RETRY_DELAY_SECONDS = 1.0


class ExperimentBuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class BuildCommandResult:
    returncode: int
    error: str | None = None
    output_seen: bool = False
    saw_build_step: bool = False


class ExperimentBuildService:
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings
        self.settings.builds_dir.mkdir(parents=True, exist_ok=True)

    async def start_build(self, payload: dict[str, Any]) -> dict[str, Any]:
        draft = prepare_build_draft(payload)
        dockerfile = render_dockerfile(draft)
        build_id = uuid.uuid4().hex
        context_dir = self._create_build_context(build_id, draft, dockerfile)
        build = self.db.create_experiment_build(
            build_id=build_id,
            experiment_id=draft["experiment_id"],
            image_name=draft["image_name"],
            dockerfile=dockerfile,
            draft_config=draft,
        )
        asyncio.create_task(self._run_build(build_id, context_dir, draft))
        return build

    async def recover_interrupted_builds(self) -> None:
        for build in self.db.list_unfinished_experiment_builds():
            image_name = build["image_name"]
            if await asyncio.to_thread(_docker_image_exists, image_name):
                self.db.append_experiment_build_log(
                    build["id"],
                    "后端重启恢复：检测到目标镜像已存在，自动标记构建成功并发布实验。\n",
                )
                self._publish_successful_build(build["id"], build["draft_config"], image_name)
                continue
            message = "后端重启导致构建中断，镜像未确认存在。请重新点击构建。"
            self.db.append_experiment_build_log(build["id"], f"构建失败：{message}\n")
            self.db.set_experiment_build_status(build["id"], "failed", error=message, finished=True)

    async def _run_build(self, build_id: str, context_dir: Path, draft: dict[str, Any]) -> None:
        image_name = draft["image_name"]
        self.db.set_experiment_build_status(build_id, "running")
        command = [
            "docker",
            "build",
            "--progress=plain",
            "--build-arg",
            f"OPENEULER_MIRROR={DEFAULT_OPENEULER_MIRROR}",
            "--build-arg",
            f"PIP_INDEX_URL={DEFAULT_PIP_INDEX_URL}",
            "--build-arg",
            f"NPM_REGISTRY={DEFAULT_NPM_REGISTRY}",
            "-t",
            image_name,
            ".",
        ]
        self.db.append_experiment_build_log(build_id, _build_header(build_id, context_dir, command))
        self.db.append_experiment_build_log(build_id, _source_banner())
        self.db.append_experiment_build_log(build_id, f"开始构建镜像：{image_name}\n")

        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            self.db.append_experiment_build_log(build_id, f"执行 docker build（第 {attempt}/{max_attempts} 次）...\n")
            result = await asyncio.to_thread(
                _run_streaming_command,
                command,
                context_dir,
                lambda line: self.db.append_experiment_build_log(build_id, line),
            )
            if result.returncode == 0:
                self._publish_successful_build(build_id, draft, image_name)
                return

            message = _format_build_error(result)
            self.db.append_experiment_build_log(build_id, f"第 {attempt} 次构建失败：{message}\n")
            if _is_windows_access_violation(result.returncode) and attempt < max_attempts:
                self.db.append_experiment_build_log(
                    build_id,
                    f"检测到 Windows Docker 崩溃码，{WINDOWS_BUILD_CRASH_RETRY_DELAY_SECONDS:g} 秒后自动重试一次。\n",
                )
                await asyncio.sleep(WINDOWS_BUILD_CRASH_RETRY_DELAY_SECONDS)
                continue
            break

        self.db.append_experiment_build_log(build_id, f"镜像构建失败：{message}\n")
        self.db.set_experiment_build_status(build_id, "failed", error=message, finished=True)

    def _publish_successful_build(self, build_id: str, draft: dict[str, Any], image_name: str) -> None:
        self.db.append_experiment_build_log(build_id, f"镜像构建成功并自动发布：{image_name}\n")
        draft["status"] = "active"
        draft["image_name"] = image_name
        self.db.upsert_experiment(draft)
        self.db.set_experiment_build_status(build_id, "succeeded", finished=True)

    def _create_build_context(self, build_id: str, draft: dict[str, Any], dockerfile: str) -> Path:
        context_dir = self.settings.builds_dir / build_id
        context_dir.mkdir(parents=True, exist_ok=True)
        (context_dir / "Dockerfile").write_text(dockerfile, encoding="utf-8")
        for filename in RUNTIME_FILES:
            shutil.copyfile(RUNTIME_DOCKER_DIR / filename, context_dir / filename)
        (context_dir / "task.json").write_text("{}\n", encoding="utf-8")
        student_files = draft.get("container_spec", {}).get("student_files", [])
        for item in student_files:
            relative = Path("student_files") / item["path"]
            target = context_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(item["content"], encoding="utf-8")
        return context_dir


def prepare_build_draft(payload: dict[str, Any]) -> dict[str, Any]:
    spec_errors = validate_container_spec(payload.get("container_spec"))
    if spec_errors:
        raise ExperimentBuildError("；".join(spec_errors))
    raw_image_name = str(payload.get("image_name") or "").strip()
    if raw_image_name and not is_valid_experiment_image_name(raw_image_name):
        raise ExperimentBuildError("Docker 镜像名不合法，请使用 linux-ai-exp:demo-lab-v1 这类完整 tag。")
    draft = ensure_experiment_draft_defaults(dict(payload))
    if draft.get("system") != "openEuler":
        raise ExperimentBuildError("第一版仅支持 openEuler 实验镜像。")
    if not draft.get("steps"):
        raise ExperimentBuildError("实验步骤不能为空。")
    if not str(draft.get("image_name", "")).strip():
        raise ExperimentBuildError("Docker 镜像名不能为空。")
    return draft


def render_dockerfile(draft: dict[str, Any]) -> str:
    spec = draft.get("container_spec", {})
    packages = _unique([*RUNTIME_PACKAGES, *spec.get("packages", [])])
    if spec.get("npm_packages"):
        packages = _unique([*packages, "nodejs", "npm"])
    package_line = " ".join(_shell_quote(item) for item in packages)
    pip_packages = " ".join(_shell_quote(item) for item in spec.get("pip_packages", []))
    npm_packages = " ".join(_shell_quote(item) for item in spec.get("npm_packages", []))
    student_dirs = " ".join(_shell_quote(f"/home/student/{item}") for item in spec.get("student_dirs", []))
    maybe_pip_install = (
        f'    python3 -m pip install --no-cache-dir -i "$PIP_INDEX_URL" websockets {pip_packages}; \\'
        if pip_packages
        else '    python3 -m pip install --no-cache-dir -i "$PIP_INDEX_URL" websockets; \\'
    )
    maybe_npm_install = (
        f'    npm config set registry "$NPM_REGISTRY"; \\\n'
        f"    npm install -g --registry \"$NPM_REGISTRY\" {npm_packages}; \\"
        if npm_packages
        else '    if command -v npm >/dev/null 2>&1; then npm config set registry "$NPM_REGISTRY"; fi; \\'
    )
    mkdir_student_dirs = (
        f"RUN set -eux; mkdir -p {student_dirs}; chown -R student:student /home/student\n"
        if student_dirs
        else ""
    )
    copy_student_files = (
        "COPY --chown=student:student student_files/ /home/student/\n"
        if spec.get("student_files")
        else ""
    )
    return f"""ARG BASE_IMAGE={DEFAULT_BASE_IMAGE}
FROM ${{BASE_IMAGE}}

ARG OPENEULER_RELEASE=openEuler-22.03-LTS-SP3
ARG OPENEULER_MIRROR={DEFAULT_OPENEULER_MIRROR}
ARG PIP_INDEX_URL={DEFAULT_PIP_INDEX_URL}
ARG NPM_REGISTRY={DEFAULT_NPM_REGISTRY}
ARG TTYD_URL=https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64

ENV PIP_INDEX_URL=${{PIP_INDEX_URL}} \\
    npm_config_registry=${{NPM_REGISTRY}}

RUN set -eux; \\
    echo "OPENEULER_MIRROR=${{OPENEULER_MIRROR}}"; \\
    echo "PIP_INDEX_URL=${{PIP_INDEX_URL}}"; \\
    echo "NPM_REGISTRY=${{NPM_REGISTRY}}"; \\
    printf '%s\\n' \\
      '[OS]' \\
      'name=openEuler OS' \\
      "baseurl=${{OPENEULER_MIRROR}}/${{OPENEULER_RELEASE}}/OS/\\$basearch/" \\
      'enabled=1' \\
      'gpgcheck=0' \\
      '' \\
      '[everything]' \\
      'name=openEuler everything' \\
      "baseurl=${{OPENEULER_MIRROR}}/${{OPENEULER_RELEASE}}/everything/\\$basearch/" \\
      'enabled=1' \\
      'gpgcheck=0' \\
      '' \\
      '[update]' \\
      'name=openEuler update' \\
      "baseurl=${{OPENEULER_MIRROR}}/${{OPENEULER_RELEASE}}/update/\\$basearch/" \\
      'enabled=1' \\
      'gpgcheck=0' \\
      '' \\
      '[EPOL]' \\
      'name=openEuler EPOL' \\
      "baseurl=${{OPENEULER_MIRROR}}/${{OPENEULER_RELEASE}}/EPOL/main/\\$basearch/" \\
      'enabled=1' \\
      'gpgcheck=0' \\
      > /etc/yum.repos.d/openEuler.repo; \\
    dnf clean all; \\
    dnf makecache; \\
    dnf -y update; \\
    dnf -y install {package_line}; \\
{maybe_pip_install}
{maybe_npm_install}
    curl -fsSL --retry 3 --connect-timeout 20 "$TTYD_URL" -o /usr/local/bin/ttyd; \\
    chmod +x /usr/local/bin/ttyd; \\
    useradd -m -s /bin/bash student; \\
    echo 'student ALL=(ALL) NOPASSWD: /usr/bin/ls, /usr/bin/cat, /usr/bin/find, /usr/bin/touch, /usr/bin/mkdir, /usr/bin/cp, /usr/bin/mv, /usr/bin/rm' > /etc/sudoers.d/student-lab; \\
    chmod 440 /etc/sudoers.d/student-lab; \\
    mkdir -p /opt/linux-ai /tmp/linux-ai-session; \\
    chown -R student:student /tmp/linux-ai-session; \\
    dnf clean all

COPY start-lab.sh /opt/linux-ai/start-lab.sh
COPY ws_client.py /opt/linux-ai/ws_client.py
COPY bash-instrumentation.sh /opt/linux-ai/bash-instrumentation.sh
COPY record_command_event.py /opt/linux-ai/record_command_event.py
COPY task.json /opt/linux-ai/task.json
{copy_student_files}{mkdir_student_dirs}
RUN chmod +x /opt/linux-ai/start-lab.sh /opt/linux-ai/ws_client.py /opt/linux-ai/record_command_event.py

EXPOSE 7681

ENTRYPOINT ["/opt/linux-ai/start-lab.sh"]
"""


def _run_streaming_command(
    command: list[str],
    cwd: Path,
    on_line: Callable[[str], None],
) -> BuildCommandResult:
    try:
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
    except FileNotFoundError:
        return BuildCommandResult(127, "docker CLI not found on PATH")
    except Exception as exc:
        return BuildCommandResult(1, str(exc).strip() or type(exc).__name__)

    assert process.stdout is not None
    output_seen = False
    saw_build_step = False
    for line in process.stdout:
        output_seen = True
        if line.lstrip().startswith("#"):
            saw_build_step = True
        on_line(line)
    return BuildCommandResult(process.wait(), None, output_seen, saw_build_step)


def _format_build_error(result: BuildCommandResult) -> str:
    details: list[str] = []
    if _is_windows_access_violation(result.returncode):
        details.append(
            "Docker CLI/BuildKit 进程访问冲突崩溃 "
            f"(exit code {_format_exit_code(result.returncode)})。"
            "这通常不是 Dockerfile 语法错误；请检查 Docker Desktop 状态、后端 reload、杀毒软件或 OneDrive 同步干扰"
        )
    elif result.error:
        details.append(result.error)
    else:
        details.append(f"docker build failed with exit code {result.returncode}")
    if not result.saw_build_step:
        details.append("Docker 构建器未开始输出 build step，失败发生在构建器启动或 Docker Desktop 侧")
    if not result.output_seen:
        details.append("Docker 进程没有输出 stdout/stderr")
    return "；".join(details)


def _is_windows_access_violation(returncode: int) -> bool:
    return returncode in WINDOWS_ACCESS_VIOLATION_EXIT_CODES


def _format_exit_code(returncode: int) -> str:
    if _is_windows_access_violation(returncode):
        return f"{returncode} / 0x{returncode & 0xFFFFFFFF:08X}"
    return str(returncode)


def _docker_image_exists(image_name: str) -> bool:
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", image_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
        )
    except Exception:
        return False
    return result.returncode == 0


def _build_header(build_id: str, context_dir: Path, command: list[str]) -> str:
    return (
        "构建任务：\n"
        f"- build_id: {build_id}\n"
        f"- context: {context_dir}\n"
        f"- command: {subprocess.list2cmdline(command)}\n"
        f"{_docker_version_summary()}\n"
    )


def _docker_version_summary() -> str:
    version = _capture_command(["docker", "version", "--format", "Client={{.Client.Version}} Server={{.Server.Version}}"])
    context = _capture_command(["docker", "context", "show"])
    lines = ["Docker 环境："]
    lines.append(f"- version: {version}" if version else "- version: 无法读取 Docker 版本")
    lines.append(f"- context: {context}" if context else "- context: 无法读取 Docker context")
    return "\n".join(lines)


def _capture_command(command: list[str]) -> str:
    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=10,
        )
    except Exception as exc:
        return str(exc).strip() or type(exc).__name__
    return result.stdout.strip()


def _source_banner() -> str:
    return (
        "构建源配置：\n"
        f"- openEuler: {DEFAULT_OPENEULER_MIRROR}\n"
        f"- pip: {DEFAULT_PIP_INDEX_URL}\n"
        f"- npm: {DEFAULT_NPM_REGISTRY}\n"
    )


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in items if item))


def _shell_quote(value: str) -> str:
    if not value:
        return "''"
    if all(ch.isalnum() or ch in "._+-/:@" for ch in value):
        return value
    return "'" + value.replace("'", "'\"'\"'") + "'"
