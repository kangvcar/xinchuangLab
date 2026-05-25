from pathlib import Path

from app.database import Database


def test_list_experiments_can_filter_active(tmp_path: Path) -> None:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    db.upsert_experiment(
        {
            "experiment_id": "active-lab",
            "name": "Active",
            "system": "openEuler",
            "image_name": "linux-ai-exp:active",
            "status": "active",
            "steps": [{"id": 1, "title": "step"}],
        }
    )
    db.upsert_experiment(
        {
            "experiment_id": "draft-lab",
            "name": "Draft",
            "system": "openEuler",
            "image_name": "linux-ai-exp:draft",
            "status": "draft",
            "steps": [{"id": 1, "title": "step"}],
        }
    )

    assert [item["id"] for item in db.list_experiments(active_only=True)] == ["active-lab"]
    assert [item["id"] for item in db.list_experiments()] == ["active-lab", "draft-lab"]


def test_initialize_preserves_unfinished_builds_for_recovery(tmp_path: Path) -> None:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    db.create_experiment_build(
        build_id="build-1",
        experiment_id="demo-lab",
        image_name="linux-ai-exp:demo-lab-v1",
        dockerfile="FROM scratch\n",
        draft_config={
            "experiment_id": "demo-lab",
            "name": "Demo Lab",
            "system": "openEuler",
            "image_name": "linux-ai-exp:demo-lab-v1",
            "steps": [{"id": 1, "title": "step"}],
        },
    )
    db.set_experiment_build_status("build-1", "running")

    db.initialize()

    unfinished = db.list_unfinished_experiment_builds()
    assert [item["id"] for item in unfinished] == ["build-1"]
    assert unfinished[0]["status"] == "running"
