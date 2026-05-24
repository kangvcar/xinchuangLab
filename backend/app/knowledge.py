from __future__ import annotations

from pathlib import Path


class KnowledgeBase:
    def __init__(self, root: Path):
        self.root = root

    def load_context(self, experiment_id: str, limit: int = 5000) -> str:
        chunks: list[str] = []
        for filename in ("commands.md", "errors.md", "openeuler.md"):
            path = self.root / filename
            if path.exists():
                chunks.append(f"# {filename}\n{path.read_text(encoding='utf-8')}")
        text = "\n\n".join(chunks)
        return text[:limit]

