from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
_SYSTEM_ENV_KEYS = set(os.environ)


def _load_env_file(path: Path, *, override: bool = False) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in _SYSTEM_ENV_KEYS:
            continue
        clean_value = value.strip().strip('"').strip("'")
        if override:
            os.environ[key] = clean_value
        else:
            os.environ.setdefault(key, clean_value)


_load_env_file(PROJECT_ROOT / ".env")
_load_env_file(PROJECT_ROOT / ".env.local", override=True)
_load_env_file(BACKEND_ROOT / ".env", override=True)
_load_env_file(BACKEND_ROOT / ".env.local", override=True)


def _as_bool(value: str, default: bool = False) -> bool:
    if value == "":
        return default
    return value.lower() in {"1", "true", "yes", "y", "on"}


def _default_builds_dir() -> Path:
    override = os.getenv("BUILD_CONTEXT_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        base = os.getenv("LOCALAPPDATA") or tempfile.gettempdir()
    else:
        base = os.getenv("XDG_CACHE_HOME") or tempfile.gettempdir()
    return Path(base) / "linux-ai-lab" / "builds"


@dataclass(frozen=True)
class Settings:
    app_name: str = "信创Linux AI实时陪练实训平台"
    app_env: str = os.getenv("APP_ENV", "development")
    lab_runtime: str = os.getenv("LAB_RUNTIME", "mock").lower()
    allow_mock_fallback: bool = _as_bool(os.getenv("ALLOW_MOCK_FALLBACK", "true"), True)
    public_host: str = os.getenv("PUBLIC_HOST", "localhost")
    backend_public_url: str = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")
    docker_ws_host: str = os.getenv("DOCKER_WS_HOST", "host.docker.internal")
    ai_mode: str = os.getenv("AI_MODE", "auto").lower()
    deepseek_api_key: str = os.getenv("DEEPSEEK_API_KEY", "")
    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "linuxai")
    database_path: Path = BACKEND_ROOT / "data" / "linux_ai_lab.db"
    reports_dir: Path = BACKEND_ROOT / "generated" / "reports"
    raw_logs_dir: Path = BACKEND_ROOT / "generated" / "raw_logs"
    builds_dir: Path = _default_builds_dir()
    experiments_dir: Path = PROJECT_ROOT / "experiments"
    knowledge_dir: Path = PROJECT_ROOT / "knowledge"


settings = Settings()
