from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCKER_DIR = PROJECT_ROOT / "docker" / "openeuler-file"


def test_ttyd_creates_tmux_session_with_real_pty_size() -> None:
    script = (DOCKER_DIR / "start-lab.sh").read_text(encoding="utf-8")

    assert "tmux new-session -d" not in script
    assert "tmux -f /opt/linux-ai/tmux.conf new-session -A -s linux-ai-lab" in script
    assert "pipe_watcher &" in script
    assert "tmux pipe-pane -o -t linux-ai-lab:0.0" in script


def test_bash_hook_filters_prompt_title_commands() -> None:
    script = (DOCKER_DIR / "bash-instrumentation.sh").read_text(encoding="utf-8")

    assert "printf\\ *\\\\033k*" in script
    assert "*\\\\033k%s@%s:%s\\\\033*" in script
