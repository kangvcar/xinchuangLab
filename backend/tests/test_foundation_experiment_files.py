import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENTS_DIR = PROJECT_ROOT / "experiments"
DOCS_DIR = PROJECT_ROOT / "docs" / "experiments"


EXPECTED_IDS = [
    "linux-system-awareness",
    "linux-file-management",
    "linux-text-processing",
    "linux-user-management",
    "linux-permission-management",
    "linux-network-configuration",
    "linux-package-management",
    "linux-disk-management",
    "linux-security-management",
    "regex-awareness",
    "shell-programming-intro",
    "shell-programming-practice",
    "web-server-configuration",
    "database-server-configuration",
    "dns-server-configuration",
    "mail-server-configuration",
    "docker-image-management",
    "docker-container-management",
]


def test_foundation_experiment_files_match_required_catalog() -> None:
    configs = sorted(
        (json.loads(path.read_text(encoding="utf-8")) for path in EXPERIMENTS_DIR.glob("*.json")),
        key=lambda item: item["sort_order"],
    )

    assert [item["experiment_id"] for item in configs] == EXPECTED_IDS
    assert [item["sort_order"] for item in configs] == list(range(1, 19))
    assert all(item["status"] == "published" for item in configs)


def test_foundation_experiment_steps_use_current_schema() -> None:
    allowed_step_fields = {
        "id",
        "title",
        "goal",
        "instructions",
        "try_commands",
        "success_criteria",
        "coach_focus",
        "verification",
    }

    for path in EXPERIMENTS_DIR.glob("*.json"):
        config = json.loads(path.read_text(encoding="utf-8"))
        assert 6 <= len(config["steps"]) <= 10
        for step in config["steps"]:
            assert set(step) == allowed_step_fields
            assert step["title"]
            assert step["try_commands"]
            assert step["success_criteria"]
            assert "checks" in step["verification"]


def test_foundation_experiment_markdown_docs_exist() -> None:
    docs = sorted(path.name for path in DOCS_DIR.glob("*.md"))

    assert len(docs) == 18
    assert docs[0] == "01-linux-system-awareness.md"
    assert docs[-1] == "18-docker-container-management.md"
