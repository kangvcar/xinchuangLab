from app.experiments import import_steps_from_text


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
    assert steps[1]["verification"]["checks"] == [
        {"type": "command_match", "commands": ["mkdir linux_lab"]}
    ]
