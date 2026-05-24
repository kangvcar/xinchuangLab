from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .database import Database


def load_experiment_files(experiments_dir: Path) -> list[dict[str, Any]]:
    configs: list[dict[str, Any]] = []
    if not experiments_dir.exists():
        return configs
    for path in sorted(experiments_dir.glob("*.json")):
        config = json.loads(path.read_text(encoding="utf-8"))
        if "experiment_id" not in config:
            raise ValueError(f"{path} is missing experiment_id")
        configs.append(config)
    return configs


def sync_experiments(db: Database, experiments_dir: Path) -> None:
    for config in load_experiment_files(experiments_dir):
        db.upsert_experiment(config)

