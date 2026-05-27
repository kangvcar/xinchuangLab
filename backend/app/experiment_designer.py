from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import Settings
from .experiments import build_experiment_draft_from_text, normalize_steps_schema


SUPPORTED_IMPORT_EXTENSIONS = {".md", ".txt"}
DEFAULT_BASE_IMAGE = "openeuler/openeuler:22.03-lts-sp3"
DEFAULT_OPENEULER_MIRROR = "https://repo.huaweicloud.com/openeuler"
DEFAULT_PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple"
DEFAULT_NPM_REGISTRY = "https://registry.npmmirror.com"
MAX_STUDENT_FILE_BYTES = 64_000
SAFE_PACKAGE_RE = re.compile(r"^[A-Za-z0-9_.+:@/-]+$")
SAFE_EXPERIMENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")
DOCKER_IMAGE_RE = re.compile(
    r"^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?"
    r"(?:/[a-z0-9]+(?:[._-][a-z0-9]+)*)*"
    r":[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$"
)
RESERVED_IMAGE_NAMES = {"openeuler", "openeuler:latest", DEFAULT_BASE_IMAGE.lower()}


class ExperimentDesignError(RuntimeError):
    def __init__(self, message: str, *, raw_output: str = "") -> None:
        super().__init__(message)
        self.raw_output = raw_output


async def design_experiment_from_document(
    *,
    text: str,
    filename: str,
    settings: Settings,
) -> dict[str, Any]:
    if _can_use_deepseek(settings):
        try:
            draft, raw_output, warnings = await _design_with_deepseek(
                text=text,
                filename=filename,
                settings=settings,
            )
            return {"draft": draft, "source": "deepseek", "warnings": warnings, "raw_output": raw_output}
        except ExperimentDesignError as exc:
            fallback = ensure_experiment_draft_defaults(build_experiment_draft_from_text(text, filename=filename))
            return {
                "draft": fallback,
                "source": "rule_fallback",
                "warnings": [str(exc), "AI 结果不可用，已回退为本地规则草稿，请检查后保存。"],
                "raw_output": exc.raw_output,
            }

    return {
        "draft": ensure_experiment_draft_defaults(build_experiment_draft_from_text(text, filename=filename)),
        "source": "rule_fallback",
        "warnings": ["未配置 DeepSeek，已使用本地规则生成可编辑草稿。"],
        "raw_output": "",
    }


def parse_ai_json(raw_output: str) -> dict[str, Any]:
    """Parse a strict JSON object, allowing common fenced-code wrappers."""
    cleaned = raw_output.strip()
    if cleaned.startswith("```"):
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
        if match:
            cleaned = match.group(1).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ExperimentDesignError(f"AI 返回内容不是合法 JSON：{exc.msg}", raw_output=raw_output) from exc
    if not isinstance(data, dict):
        raise ExperimentDesignError("AI 返回 JSON 必须是对象。", raw_output=raw_output)
    return data


def normalize_experiment_draft(draft: dict[str, Any], *, filename: str = "") -> dict[str, Any]:
    return _normalize_experiment_draft(draft, filename=filename)


def normalize_experiment_draft_with_warnings(
    draft: dict[str, Any],
    *,
    filename: str = "",
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    return _normalize_experiment_draft(draft, filename=filename, warnings=warnings), warnings


def _normalize_experiment_draft(
    draft: dict[str, Any],
    *,
    filename: str = "",
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    steps = draft.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ExperimentDesignError("AI 草稿缺少 steps 数组。", raw_output=json.dumps(draft, ensure_ascii=False))

    normalized_steps: list[dict[str, Any]] = []
    for index, raw_step in enumerate(steps, start=1):
        if not isinstance(raw_step, dict):
            raise ExperimentDesignError(f"第 {index} 步不是对象。", raw_output=json.dumps(draft, ensure_ascii=False))
        verification = raw_step.get("verification")
        if not isinstance(verification, dict):
            verification = {"mode": "all", "checks": []}
        checks = verification.get("checks")
        if not isinstance(checks, list):
            checks = []
        normalized_steps.append(
            {
                "id": index,
                "title": str(raw_step.get("title") or f"步骤{index}"),
                "goal": str(raw_step.get("goal") or ""),
                "instructions": str(raw_step.get("instructions") or ""),
                "try_commands": _string_list(raw_step.get("try_commands")),
                "success_criteria": str(raw_step.get("success_criteria") or raw_step.get("success_hint") or ""),
                "coach_focus": str(raw_step.get("coach_focus") or ""),
                "verification": {
                    "mode": str(verification.get("mode") or "all"),
                    "checks": checks,
                },
            }
        )

    title = str(draft.get("name") or "").strip() or _name_from_filename(filename)
    experiment_id = str(draft.get("experiment_id") or "").strip() or _slugify(title)
    normalized = {
        "experiment_id": _slugify(experiment_id),
        "name": title,
        "system": str(draft.get("system") or "openEuler"),
        "image_name": str(draft.get("image_name") or ""),
        "objective": str(draft.get("objective") or ""),
        "status": str(draft.get("status") or "draft"),
        "schema_version": 2,
        "steps": normalized_steps,
    }
    normalized["container_spec"] = normalize_container_spec(draft.get("container_spec") or {}, warnings=warnings)
    return ensure_experiment_draft_defaults(normalized, warnings=warnings)


def ensure_experiment_draft_defaults(
    draft: dict[str, Any],
    *,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    normalized = dict(draft)
    experiment_id = _slugify(str(normalized.get("experiment_id") or normalized.get("name") or "imported-experiment"))
    normalized["experiment_id"] = experiment_id
    normalized.setdefault("name", experiment_id)
    raw_system = str(normalized.get("system") or "").strip()
    if raw_system and raw_system != "openEuler" and warnings is not None:
        warnings.append(f"AI 返回的 system={raw_system} 已自动修正为 openEuler。")
    normalized["system"] = "openEuler"
    normalized.setdefault("schema_version", 2)
    normalized.setdefault("status", "draft")
    normalized.setdefault("objective", "")
    if "sort_order" in draft:
        try:
            normalized["sort_order"] = int(draft["sort_order"])
        except (TypeError, ValueError):
            normalized.pop("sort_order", None)
    normalized["steps"] = normalize_steps_schema(normalized.get("steps"))
    normalized["image_name"] = normalize_experiment_image_name(
        normalized.get("image_name"),
        experiment_id=experiment_id,
        warnings=warnings,
    )
    normalized["container_spec"] = normalize_container_spec(normalized.get("container_spec") or {}, warnings=warnings)
    return normalized


def normalize_experiment_image_name(
    image_name: Any,
    *,
    experiment_id: str,
    warnings: list[str] | None = None,
) -> str:
    default_image = f"linux-ai-exp:{experiment_id}-v1"
    raw = str(image_name or "").strip()
    if is_valid_experiment_image_name(raw):
        return raw
    if warnings is not None:
        if raw:
            warnings.append(f"AI 返回的 image_name={raw} 不符合实验镜像 tag 规范，已自动修正为 {default_image}。")
        else:
            warnings.append(f"AI 未返回 image_name，已自动填充为 {default_image}。")
    return default_image


def is_valid_experiment_image_name(image_name: str) -> bool:
    raw = image_name.strip()
    if not raw:
        return False
    lowered = raw.lower()
    if lowered in RESERVED_IMAGE_NAMES or "openeuler/openeuler" in lowered:
        return False
    if ":" not in raw.rsplit("/", 1)[-1]:
        return False
    return bool(DOCKER_IMAGE_RE.match(raw))


def normalize_container_spec(
    spec: dict[str, Any],
    *,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(spec, dict):
        spec = {}
    base_image = str(spec.get("base_image") or DEFAULT_BASE_IMAGE).strip()
    if base_image != DEFAULT_BASE_IMAGE:
        if base_image and warnings is not None:
            warnings.append(
                f"AI 返回的 container_spec.base_image={base_image} 已自动修正为 {DEFAULT_BASE_IMAGE}。"
            )
        base_image = DEFAULT_BASE_IMAGE
    return {
        "base_image": base_image,
        "packages": _safe_package_list(spec.get("packages")),
        "pip_packages": _safe_package_list(spec.get("pip_packages")),
        "npm_packages": _safe_package_list(spec.get("npm_packages")),
        "student_dirs": _safe_path_list(spec.get("student_dirs")),
        "student_files": _safe_student_files(spec.get("student_files")),
        "sources": {
            "openeuler_mirror": DEFAULT_OPENEULER_MIRROR,
            "pip_index_url": DEFAULT_PIP_INDEX_URL,
            "npm_registry": DEFAULT_NPM_REGISTRY,
        },
    }


def validate_container_spec(spec: Any) -> list[str]:
    if spec in (None, ""):
        return []
    if not isinstance(spec, dict):
        return ["container_spec 必须是对象。"]
    errors: list[str] = []
    for field in ("packages", "pip_packages", "npm_packages"):
        value = spec.get(field, [])
        if not isinstance(value, list):
            errors.append(f"{field} 必须是数组。")
            continue
        for item in value:
            package = str(item).strip()
            if not package or not SAFE_PACKAGE_RE.match(package):
                errors.append(f"{field} 包名非法：{item}")
    for field in ("student_dirs",):
        value = spec.get(field, [])
        if not isinstance(value, list):
            errors.append(f"{field} 必须是数组。")
            continue
        for item in value:
            if not _clean_student_path(str(item)):
                errors.append(f"{field} 路径必须是学生目录相对路径：{item}")
    files = spec.get("student_files", [])
    if not isinstance(files, list):
        errors.append("student_files 必须是数组。")
    else:
        for item in files:
            if not isinstance(item, dict):
                errors.append("student_files 每一项必须是对象。")
                continue
            path = str(item.get("path") or "")
            content = str(item.get("content") or "")
            if not _clean_student_path(path):
                errors.append(f"student_files 路径必须是学生目录相对路径：{path}")
            if len(content.encode("utf-8")) > MAX_STUDENT_FILE_BYTES:
                errors.append(f"student_files 文件过大：{path}")
    return errors


def _can_use_deepseek(settings: Settings) -> bool:
    return bool(settings.deepseek_api_key) and settings.ai_mode in {"auto", "deepseek"}


async def _design_with_deepseek(*, text: str, filename: str, settings: Settings) -> tuple[dict[str, Any], str, list[str]]:
    prompt = _build_prompt(text=text, filename=filename)
    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {
                "role": "system",
                "content": "你是 Linux 实训课程设计助手。只返回严格 JSON，不要 Markdown，不要解释。",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 3500,
    }
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }
    url = f"{settings.deepseek_base_url}/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        message = str(exc) or type(exc).__name__
        raise ExperimentDesignError(f"AI 实验草稿生成失败：{message}") from exc
    raw_output = str(data["choices"][0]["message"]["content"]).strip()
    parsed = parse_ai_json(raw_output)
    try:
        draft, warnings = normalize_experiment_draft_with_warnings(parsed, filename=filename)
        return draft, raw_output, warnings
    except ExperimentDesignError as exc:
        if not exc.raw_output:
            exc.raw_output = raw_output
        raise
    except Exception as exc:
        message = str(exc).strip() or type(exc).__name__
        raise ExperimentDesignError(f"AI 草稿规范化失败：{message}", raw_output=raw_output) from exc


def _build_prompt(*, text: str, filename: str) -> str:
    return (
        "请把下面的 Markdown/纯文本实验文档转成实验配置 v2 JSON 草稿。\n"
        "必须严格返回一个 JSON 对象，字段如下：\n"
        "- experiment_id: 英文小写、数字、中划线或下划线组成。\n"
        "- name: 中文实验名称；objective: 面向学生的实验目标。\n"
        "- system: 固定填 \"openEuler\"。\n"
        "- image_name: 实验最终构建出来的 Docker 镜像 tag，必须类似 \"linux-ai-exp:file-basic-v1\"，不能填系统名。\n"
        "- schema_version: 2。\n"
        "- steps: 数组，根据实验内容复杂度设计，一般 6-10 步左右；不要固定 6 步，也不要为凑数量拆出空泛步骤。\n"
        "- steps 每步只包含 id, title, goal, instructions, try_commands, success_criteria, coach_focus, verification。\n"
        "- container_spec: 对象，包含 base_image, packages, pip_packages, npm_packages, student_dirs, student_files。\n"
        "- container_spec 只描述实验依赖，不要生成 Dockerfile；base_image 固定填 "
        f"\"{DEFAULT_BASE_IMAGE}\"。\n"
        "- student_files 每项包含 path 和 content，path 必须是 /home/student 下的相对路径。\n"
        "- verification 必须包含 mode: \"all\" 和 checks 数组。\n"
        "- checks 可使用：command_match, command_set, command_sequence, path_exists, path_absent, exec_exit_code。\n"
        "- command_match 的多个 commands 表示命中任一即可；需要学生全部执行时使用 command_set。\n"
        "- path_exists/path_absent 的 path 优先使用相对学生当前目录的路径。\n"
        "- 只设计可验证、可执行、适合 Linux 初学者的步骤，不要输出泛泛理论步骤。\n\n"
        "字段示例：\n"
        "{\n"
        "  \"experiment_id\": \"file-basic\",\n"
        "  \"name\": \"Linux 文件管理基础实验\",\n"
        "  \"system\": \"openEuler\",\n"
        "  \"image_name\": \"linux-ai-exp:file-basic-v1\",\n"
        "  \"objective\": \"掌握 pwd、ls、mkdir、touch 等基础文件管理命令。\",\n"
        "  \"schema_version\": 2,\n"
        "  \"container_spec\": {\n"
        f"    \"base_image\": \"{DEFAULT_BASE_IMAGE}\",\n"
        "    \"packages\": [\"tree\"],\n"
        "    \"pip_packages\": [],\n"
        "    \"npm_packages\": [],\n"
        "    \"student_dirs\": [\"linux_lab\"],\n"
        "    \"student_files\": [{\"path\": \"linux_lab/readme.txt\", \"content\": \"welcome\"}]\n"
        "  },\n"
        "  \"steps\": [\n"
        "    {\n"
        "      \"id\": 1,\n"
        "      \"title\": \"查看当前目录\",\n"
        "      \"goal\": \"确认当前所在路径。\",\n"
        "      \"instructions\": \"在终端执行 pwd。\",\n"
        "      \"try_commands\": [\"pwd\"],\n"
        "      \"success_criteria\": \"终端输出 /home/student。\",\n"
        "      \"coach_focus\": \"提醒学生理解当前工作目录。\",\n"
        "      \"verification\": {\"mode\": \"all\", \"checks\": [{\"type\": \"command_match\", \"commands\": [\"pwd\"]}]}\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "重要反例：image_name 不能是 \"openEuler\"、\"openeuler\"、"
        f"\"{DEFAULT_BASE_IMAGE}\" 或任何没有 tag 的名称；系统类型只能写在 system 字段，基础镜像只能写在 container_spec.base_image 字段。\n\n"
        f"文件名：{filename}\n\n"
        "文档内容：\n"
        f"{text[:12000]}"
    )


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _safe_package_list(value: Any) -> list[str]:
    packages = _string_list(value)
    result: list[str] = []
    for package in packages:
        cleaned = package.strip()
        if cleaned and SAFE_PACKAGE_RE.match(cleaned):
            result.append(cleaned)
    return list(dict.fromkeys(result))


def _safe_path_list(value: Any) -> list[str]:
    paths = _string_list(value)
    result: list[str] = []
    for path in paths:
        cleaned = _clean_student_path(path)
        if cleaned:
            result.append(cleaned)
    return list(dict.fromkeys(result))


def _safe_student_files(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    files: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        path = _clean_student_path(str(item.get("path") or ""))
        content = str(item.get("content") or "")
        if not path or len(content.encode("utf-8")) > MAX_STUDENT_FILE_BYTES:
            continue
        files.append({"path": path, "content": content})
    return files


def _clean_student_path(path: str) -> str:
    raw = path.strip().replace("\\", "/")
    if raw.startswith("/"):
        return ""
    cleaned = raw
    if cleaned.startswith("home/student/"):
        cleaned = cleaned.removeprefix("home/student/")
    if not cleaned or cleaned.startswith("/") or ".." in cleaned.split("/"):
        return ""
    if any(part in {"", ".", "~"} for part in cleaned.split("/")):
        return ""
    return cleaned


def _name_from_filename(filename: str) -> str:
    base = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return base.rsplit(".", 1)[0] or "导入实验草稿"


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", text.lower()).strip("-")
    if SAFE_EXPERIMENT_ID_RE.match(slug):
        return slug[:48]
    return slug[:48] or "imported-experiment"
