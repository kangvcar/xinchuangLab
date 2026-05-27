from app.experiments import import_steps_from_text, normalize_steps_schema


def test_import_steps_from_markdown_code_blocks():
    text = """
## 步骤1：查看当前目录
使用 pwd 查看路径。
```bash
pwd
```
完成条件：输出当前目录。

## 步骤2：创建目录
输入 `mkdir linux_lab` 创建目录。
完成条件：linux_lab 存在。
"""

    steps = import_steps_from_text(text)

    assert [step["title"] for step in steps] == ["查看当前目录", "创建目录"]
    assert steps[0]["try_commands"] == ["pwd"]
    assert steps[1]["try_commands"] == ["mkdir linux_lab"]
    assert "hint" not in steps[0]
    assert "success_hint" not in steps[0]
    assert steps[1]["verification"]["checks"] == [
        {"type": "command_match", "commands": ["mkdir linux_lab"]}
    ]


def test_normalize_steps_schema_migrates_and_strips_legacy_fields():
    steps = normalize_steps_schema(
        [
            {
                "id": 99,
                "title": "查看路径",
                "hint": "使用 pwd 查看路径。",
                "try_commands": ["pwd"],
                "success_hint": "输出当前目录。",
                "keywords": ["pwd"],
                "verify": {"commands": ["pwd"]},
                "unexpected": "remove me",
            }
        ]
    )

    assert steps == [
        {
            "id": 1,
            "title": "查看路径",
            "goal": "",
            "instructions": "使用 pwd 查看路径。",
            "try_commands": ["pwd"],
            "success_criteria": "输出当前目录。",
            "coach_focus": "",
            "verification": {"mode": "all", "checks": [{"type": "command_match", "commands": ["pwd"]}]},
        }
    ]
