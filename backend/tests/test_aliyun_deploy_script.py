from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_SCRIPT = PROJECT_ROOT / "scripts" / "deploy-aliyun-ubuntu24.sh"


def test_deploy_env_uses_public_backend_url_for_reports_and_container_callbacks() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert "BACKEND_PUBLIC_URL=${PUBLIC_SCHEME}://${PUBLIC_HOST}" in script
    assert "BACKEND_PUBLIC_URL=http://${BACKEND_BIND_HOST}:${BACKEND_PORT}" not in script
