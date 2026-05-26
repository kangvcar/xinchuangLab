from pathlib import Path

from app.database import Database


def test_list_experiments_filters_student_visible_statuses(tmp_path: Path) -> None:
    db = Database(tmp_path / "lab.db")
    db.initialize()
    for experiment_id, status in [
        ("active-lab", "active"),
        ("published-lab", "published"),
        ("draft-lab", "draft"),
        ("inactive-lab", "inactive"),
    ]:
        db.upsert_experiment(
            {
                "experiment_id": experiment_id,
                "name": experiment_id,
                "system": "openEuler",
                "image_name": f"linux-ai-exp:{experiment_id}",
                "status": status,
                "steps": [{"id": 1, "title": "step"}],
            }
        )

    assert [item["id"] for item in db.list_experiments(active_only=True)] == [
        "active-lab",
        "published-lab",
    ]
    assert [item["id"] for item in db.list_experiments()] == [
        "active-lab",
        "draft-lab",
        "inactive-lab",
        "published-lab",
    ]


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
