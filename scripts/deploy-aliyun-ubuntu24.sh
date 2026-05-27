#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-xinchuang-lab}"
SERVICE_NAME="${SERVICE_NAME:-xinchuang-lab}"
SERVICE_USER="${SERVICE_USER:-xinchuang}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/xinchuang-lab}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

PUBLIC_SCHEME="${PUBLIC_SCHEME:-http}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
BACKEND_BIND_HOST="${BACKEND_BIND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
TERMINAL_PORT_START="${TERMINAL_PORT_START:-20000}"
TERMINAL_PORT_END="${TERMINAL_PORT_END:-20999}"

ALIYUN_MIRROR_BASE="${ALIYUN_MIRROR_BASE:-http://mirrors.cloud.aliyuncs.com}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
OPENEULER_MIRROR="${OPENEULER_MIRROR:-https://repo.huaweicloud.com/openeuler}"
NODE_VERSION="${NODE_VERSION:-20.19.5}"
NODE_MIRROR="${NODE_MIRROR:-https://npmmirror.com/mirrors/node}"
BASE_IMAGE="${BASE_IMAGE:-openeuler/openeuler:22.03-lts-sp3}"
BASE_IMAGE_MIRROR="${BASE_IMAGE_MIRROR:-hub.oepkgs.net/openeuler/openeuler:22.03-lts-sp3}"
TTYD_URL="${TTYD_URL:-https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64}"
TTYD_CACHE_FILE="${TTYD_CACHE_FILE:-/var/cache/${APP_NAME}/ttyd.x86_64}"
TTYD_LOCAL_FILE="${TTYD_LOCAL_FILE:-}"

APP_ENV="${APP_ENV:-production}"
LAB_RUNTIME="${LAB_RUNTIME:-docker}"
AI_MODE="${AI_MODE:-auto}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
DEEPSEEK_BASE_URL="${DEEPSEEK_BASE_URL:-https://api.deepseek.com}"
DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-chat}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
BUILD_CONTEXT_DIR="${BUILD_CONTEXT_DIR:-/var/cache/${APP_NAME}/builds}"
IMAGE_CONTEXT_DIR="${IMAGE_CONTEXT_DIR:-/var/cache/${APP_NAME}/experiment-image-contexts}"
DOCKER_REGISTRY_MIRRORS="${DOCKER_REGISTRY_MIRRORS:-}"

FORCE_REBUILD_IMAGES="${FORCE_REBUILD_IMAGES:-0}"
SKIP_SYSTEM="${SKIP_SYSTEM:-0}"
SKIP_IMAGE_BUILD="${SKIP_IMAGE_BUILD:-0}"
SKIP_APP_BUILD="${SKIP_APP_BUILD:-0}"
ORIGINAL_ARGS=("$@")

usage() {
  cat <<EOF
Usage: sudo -E bash scripts/deploy-aliyun-ubuntu24.sh [options]

Options:
  --skip-system        Skip apt/Docker/Nginx/Node installation.
  --skip-app-build     Skip frontend/backend dependency installation and frontend build.
  --skip-image-build   Skip experiment Docker image builds.
  --force-images       Rebuild experiment images even if tags already exist.
  -h, --help           Show this help.

Common environment variables:
  PUBLIC_HOST=1.2.3.4
  ADMIN_PASSWORD='change-me'
  TERMINAL_PORT_START=20000 TERMINAL_PORT_END=20999
  DOCKER_REGISTRY_MIRRORS='["https://your-id.mirror.aliyuncs.com"]'
  FORCE_REBUILD_IMAGES=1
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system) SKIP_SYSTEM=1 ;;
    --skip-app-build) SKIP_APP_BUILD=1 ;;
    --skip-image-build) SKIP_IMAGE_BUILD=1 ;;
    --force-images) FORCE_REBUILD_IMAGES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
  shift
done

log() {
  printf '\n[%s] %s\n' "$(date '+%F %T')" "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    exec sudo -E bash "$0" "$@"
  fi
}

detect_public_host() {
  if [[ -n "${PUBLIC_HOST}" ]]; then
    return
  fi
  PUBLIC_HOST="$(curl -fsS --max-time 2 http://100.100.100.200/latest/meta-data/eipv4 2>/dev/null || true)"
  if [[ -z "${PUBLIC_HOST}" ]]; then
    PUBLIC_HOST="$(curl -fsS --max-time 2 http://100.100.100.200/latest/meta-data/public-ipv4 2>/dev/null || true)"
  fi
  if [[ -z "${PUBLIC_HOST}" ]]; then
    PUBLIC_HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  [[ -n "${PUBLIC_HOST}" ]] || die "PUBLIC_HOST is required when no public IP can be auto-detected."
}

validate_host_and_ports() {
  [[ "${PUBLIC_SCHEME}" == "http" || "${PUBLIC_SCHEME}" == "https" ]] || die "PUBLIC_SCHEME must be http or https."
  [[ "${TERMINAL_PORT_START}" =~ ^[0-9]+$ ]] || die "TERMINAL_PORT_START must be a number."
  [[ "${TERMINAL_PORT_END}" =~ ^[0-9]+$ ]] || die "TERMINAL_PORT_END must be a number."
  (( TERMINAL_PORT_START > 0 && TERMINAL_PORT_END >= TERMINAL_PORT_START )) || die "Invalid terminal port range."
}

check_ubuntu() {
  . /etc/os-release
  [[ "${ID}" == "ubuntu" && "${VERSION_ID}" == "24.04" ]] || die "This script supports Ubuntu 24.04 only. Current: ${PRETTY_NAME:-unknown}"
}

configure_ubuntu_sources() {
  log "Configuring Ubuntu 24.04 apt sources: ${ALIYUN_MIRROR_BASE}/ubuntu"
  install -d -m 0755 /etc/apt/sources.list.d
  if [[ -f /etc/apt/sources.list.d/ubuntu.sources && ! -f /etc/apt/sources.list.d/ubuntu.sources.bak ]]; then
    cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak
  fi
  cat >/etc/apt/sources.list.d/ubuntu.sources <<EOF
Types: deb
URIs: ${ALIYUN_MIRROR_BASE}/ubuntu
Suites: noble noble-updates noble-backports
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: ${ALIYUN_MIRROR_BASE}/ubuntu
Suites: noble-security
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
EOF
}

configure_docker_apt_source() {
  log "Configuring Docker CE apt source: ${ALIYUN_MIRROR_BASE}/docker-ce/linux/ubuntu"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "${ALIYUN_MIRROR_BASE}/docker-ce/linux/ubuntu/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: ${ALIYUN_MIRROR_BASE}/docker-ce/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
}

install_node_from_npmmirror() {
  local arch node_arch url tmp_dir
  arch="$(dpkg --print-architecture)"
  case "${arch}" in
    amd64) node_arch="x64" ;;
    arm64) node_arch="arm64" ;;
    *) die "Unsupported Node.js architecture: ${arch}" ;;
  esac
  url="${NODE_MIRROR}/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz"
  tmp_dir="$(mktemp -d)"
  log "Installing Node.js v${NODE_VERSION} from ${NODE_MIRROR}"
  curl -fL --retry 3 --connect-timeout 20 "${url}" -o "${tmp_dir}/node.tar.xz"
  rm -rf "/usr/local/node-v${NODE_VERSION}-linux-${node_arch}"
  tar -xJf "${tmp_dir}/node.tar.xz" -C /usr/local
  ln -sfn "/usr/local/node-v${NODE_VERSION}-linux-${node_arch}/bin/node" /usr/local/bin/node
  ln -sfn "/usr/local/node-v${NODE_VERSION}-linux-${node_arch}/bin/npm" /usr/local/bin/npm
  ln -sfn "/usr/local/node-v${NODE_VERSION}-linux-${node_arch}/bin/npx" /usr/local/bin/npx
  rm -rf "${tmp_dir}"
  npm config set registry "${NPM_REGISTRY}" >/dev/null
}

configure_docker_daemon() {
  install -d -m 0755 /etc/docker
  if [[ -z "${DOCKER_REGISTRY_MIRRORS}" ]]; then
    log "No DOCKER_REGISTRY_MIRRORS set; leaving Docker Hub mirrors unchanged."
    return
  fi
  log "Configuring Docker registry mirrors."
  python3 - <<'PY'
import json
import os
from pathlib import Path

path = Path("/etc/docker/daemon.json")
data = {}
if path.exists():
    data = json.loads(path.read_text(encoding="utf-8") or "{}")
mirrors = json.loads(os.environ["DOCKER_REGISTRY_MIRRORS"])
if not isinstance(mirrors, list) or not all(isinstance(item, str) for item in mirrors):
    raise SystemExit("DOCKER_REGISTRY_MIRRORS must be a JSON string list")
data["registry-mirrors"] = mirrors
data.setdefault("log-driver", "json-file")
data.setdefault("log-opts", {"max-size": "100m", "max-file": "3"})
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
}

install_system_packages() {
  check_ubuntu
  configure_ubuntu_sources
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg lsb-release rsync nginx python3 python3-venv python3-pip jq openssl xz-utils
  configure_docker_apt_source
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get remove -y docker.io docker-doc docker-compose podman-docker containerd runc >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  install_node_from_npmmirror
  configure_docker_daemon
  systemctl enable --now docker
  systemctl restart docker
  systemctl enable --now nginx
}

sync_project() {
  log "Syncing project to ${DEPLOY_DIR}"
  install -d -m 0755 "${DEPLOY_DIR}"
  if [[ "$(cd "${PROJECT_DIR}" && pwd -P)" != "$(cd "${DEPLOY_DIR}" && pwd -P 2>/dev/null || echo "${DEPLOY_DIR}")" ]]; then
    rsync -a --delete \
      --exclude '.git/' \
      --exclude '.worktrees/' \
      --exclude 'frontend/node_modules/' \
      --exclude 'frontend/dist/' \
      --exclude 'backend/venv/' \
      --exclude 'backend/.pytest_cache/' \
      --exclude 'backend/**/__pycache__/' \
      "${PROJECT_DIR}/" "${DEPLOY_DIR}/"
  fi
}

ensure_service_user() {
  if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  fi
  usermod -aG docker "${SERVICE_USER}"
  install -d -m 0755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${BUILD_CONTEXT_DIR}" "${IMAGE_CONTEXT_DIR}"
  install -d -m 0755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "$(dirname "${TTYD_CACHE_FILE}")"
  install -d -m 0755 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${DEPLOY_DIR}/backend/data" "${DEPLOY_DIR}/backend/generated"
  chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DEPLOY_DIR}/backend/data" "${DEPLOY_DIR}/backend/generated" "${BUILD_CONTEXT_DIR}" "${IMAGE_CONTEXT_DIR}" "$(dirname "${TTYD_CACHE_FILE}")"
}

create_env_file() {
  if [[ -z "${ADMIN_PASSWORD}" ]]; then
    if [[ -f "${DEPLOY_DIR}/.env" ]]; then
      ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' "${DEPLOY_DIR}/.env" | tail -n 1 | cut -d= -f2- || true)"
    fi
    if [[ -z "${ADMIN_PASSWORD}" ]]; then
      ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '\n')"
    fi
  fi
  log "Writing ${DEPLOY_DIR}/.env"
  cat >"${DEPLOY_DIR}/.env" <<EOF
APP_ENV=${APP_ENV}
LAB_RUNTIME=${LAB_RUNTIME}
ALLOW_MOCK_FALLBACK=false
PUBLIC_SCHEME=${PUBLIC_SCHEME}
PUBLIC_HOST=${PUBLIC_HOST}
BACKEND_PUBLIC_URL=${PUBLIC_SCHEME}://${PUBLIC_HOST}
DOCKER_WS_HOST=host.docker.internal
TERMINAL_PORT_START=${TERMINAL_PORT_START}
TERMINAL_PORT_END=${TERMINAL_PORT_END}
BUILD_CONTEXT_DIR=${BUILD_CONTEXT_DIR}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
AI_MODE=${AI_MODE}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL}
EOF
  chmod 600 "${DEPLOY_DIR}/.env"
  chown "${SERVICE_USER}:${SERVICE_USER}" "${DEPLOY_DIR}/.env"
}

build_application() {
  log "Installing backend dependencies from ${PIP_INDEX_URL}"
  python3 -m venv "${DEPLOY_DIR}/backend/venv"
  "${DEPLOY_DIR}/backend/venv/bin/python" -m pip install --upgrade pip -i "${PIP_INDEX_URL}" --trusted-host "$(echo "${PIP_INDEX_URL}" | awk -F/ '{print $3}')"
  "${DEPLOY_DIR}/backend/venv/bin/python" -m pip install -r "${DEPLOY_DIR}/backend/requirements.txt" -i "${PIP_INDEX_URL}" --trusted-host "$(echo "${PIP_INDEX_URL}" | awk -F/ '{print $3}')"

  log "Building frontend with npm registry ${NPM_REGISTRY}"
  cd "${DEPLOY_DIR}/frontend"
  npm config set registry "${NPM_REGISTRY}" >/dev/null
  npm ci --registry="${NPM_REGISTRY}"
  npm run build
  cd - >/dev/null
}

write_systemd_service() {
  log "Writing systemd service ${SERVICE_NAME}.service"
  cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Xinchuang Linux AI Lab FastAPI backend
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
SupplementaryGroups=docker
WorkingDirectory=${DEPLOY_DIR}/backend
EnvironmentFile=${DEPLOY_DIR}/.env
ExecStart=${DEPLOY_DIR}/backend/venv/bin/python -m uvicorn app.main:app --host ${BACKEND_BIND_HOST} --port ${BACKEND_PORT} --proxy-headers
Restart=always
RestartSec=3
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service"
}

write_nginx_site() {
  log "Writing Nginx site"
  cat >"/etc/nginx/sites-available/${APP_NAME}.conf" <<EOF
server {
    listen 80;
    server_name _;

    root ${DEPLOY_DIR}/frontend/dist;
    index index.html;
    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://${BACKEND_BIND_HOST}:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://${BACKEND_BIND_HOST}:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /reports-static/ {
        proxy_pass http://${BACKEND_BIND_HOST}:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  ln -sfn "/etc/nginx/sites-available/${APP_NAME}.conf" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
}

prepare_experiment_image_contexts() {
  log "Preparing experiment image contexts"
  ensure_ttyd_binary
  DEPLOY_DIR="${DEPLOY_DIR}" IMAGE_CONTEXT_DIR="${IMAGE_CONTEXT_DIR}" TTYD_CACHE_FILE="${TTYD_CACHE_FILE}" PYTHONPATH="${DEPLOY_DIR}/backend" "${DEPLOY_DIR}/backend/venv/bin/python" - <<'PY'
import json
import os
import shutil
from pathlib import Path

from app.experiment_builder import RUNTIME_DOCKER_DIR, RUNTIME_FILES, prepare_build_draft, render_dockerfile

root = Path(os.environ["DEPLOY_DIR"])
contexts_root = Path(os.environ["IMAGE_CONTEXT_DIR"])
ttyd_cache_file = Path(os.environ["TTYD_CACHE_FILE"])
contexts_root.mkdir(parents=True, exist_ok=True)
manifest = contexts_root / "manifest.tsv"
rows = []

for path in sorted((root / "experiments").glob("*.json")):
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("status") == "inactive":
        continue
    draft = prepare_build_draft(data)
    context_dir = contexts_root / draft["experiment_id"]
    if context_dir.exists():
        shutil.rmtree(context_dir)
    context_dir.mkdir(parents=True)
    (context_dir / "Dockerfile").write_text(render_dockerfile(draft, ttyd_source="local"), encoding="utf-8")
    shutil.copyfile(ttyd_cache_file, context_dir / "ttyd")
    for filename in RUNTIME_FILES:
        shutil.copyfile(RUNTIME_DOCKER_DIR / filename, context_dir / filename)
    (context_dir / "task.json").write_text("{}\n", encoding="utf-8")
    for item in draft.get("container_spec", {}).get("student_files", []):
        target = context_dir / "student_files" / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(item["content"], encoding="utf-8")
    rows.append((draft["image_name"], str(context_dir), draft["experiment_id"], draft["name"]))

manifest.write_text(
    "".join("\t".join(row) + "\n" for row in rows),
    encoding="utf-8",
)
print(f"Prepared {len(rows)} image contexts at {contexts_root}")
PY
}

ensure_ttyd_binary() {
  if [[ -n "${TTYD_LOCAL_FILE}" ]]; then
    [[ -f "${TTYD_LOCAL_FILE}" ]] || die "TTYD_LOCAL_FILE does not exist: ${TTYD_LOCAL_FILE}"
    log "Using local ttyd binary: ${TTYD_LOCAL_FILE}"
    install -m 0755 "${TTYD_LOCAL_FILE}" "${TTYD_CACHE_FILE}"
    return
  fi

  if [[ -x "${TTYD_CACHE_FILE}" ]]; then
    log "Using cached ttyd binary: ${TTYD_CACHE_FILE}"
    return
  fi

  log "Downloading ttyd binary to ${TTYD_CACHE_FILE}"
  local tmp_file
  tmp_file="$(mktemp)"
  if ! curl -fL --retry 3 --connect-timeout 20 "${TTYD_URL}" -o "${tmp_file}"; then
    rm -f "${tmp_file}"
    die "Failed to download ttyd from ${TTYD_URL}. Set TTYD_URL to a reachable mirror or set TTYD_LOCAL_FILE=/path/to/ttyd.x86_64."
  fi
  install -m 0755 "${tmp_file}" "${TTYD_CACHE_FILE}"
  rm -f "${tmp_file}"
}

pull_base_image() {
  log "Preparing base image ${BASE_IMAGE}"
  if docker image inspect "${BASE_IMAGE}" >/dev/null 2>&1; then
    return
  fi
  if [[ -n "${BASE_IMAGE_MIRROR}" ]] && docker pull "${BASE_IMAGE_MIRROR}"; then
    docker tag "${BASE_IMAGE_MIRROR}" "${BASE_IMAGE}"
    return
  fi
  docker pull "${BASE_IMAGE}"
}

build_experiment_images() {
  prepare_experiment_image_contexts
  pull_base_image
  local manifest image context experiment_id experiment_name total built skipped
  manifest="${IMAGE_CONTEXT_DIR}/manifest.tsv"
  total=0
  built=0
  skipped=0
  while IFS=$'\t' read -r image context experiment_id experiment_name; do
    [[ -n "${image}" ]] || continue
    total=$((total + 1))
    if [[ "${FORCE_REBUILD_IMAGES}" != "1" ]] && docker image inspect "${image}" >/dev/null 2>&1; then
      log "Skipping existing image ${image} (${experiment_name})"
      skipped=$((skipped + 1))
      continue
    fi
    log "Building image ${image} (${experiment_name})"
    docker build \
      --progress=plain \
      --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
      --build-arg "OPENEULER_MIRROR=${OPENEULER_MIRROR}" \
      --build-arg "PIP_INDEX_URL=${PIP_INDEX_URL}" \
      --build-arg "NPM_REGISTRY=${NPM_REGISTRY}" \
      --build-arg "TTYD_URL=${TTYD_URL}" \
      -t "${image}" \
      "${context}"
    built=$((built + 1))
  done <"${manifest}"
  log "Experiment image build summary: total=${total}, built=${built}, skipped=${skipped}"
}

restart_services() {
  log "Restarting services"
  systemctl restart "${SERVICE_NAME}.service"
  systemctl restart nginx
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-1}"
  local attempt
  for attempt in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  return 1
}

verify_deployment() {
  log "Verifying deployment"
  systemctl --no-pager --full status "${SERVICE_NAME}.service" >/dev/null
  systemctl --no-pager --full status nginx >/dev/null
  wait_for_http "http://${BACKEND_BIND_HOST}:${BACKEND_PORT}/api/health" 30 1 || die "Backend health check did not become ready: http://${BACKEND_BIND_HOST}:${BACKEND_PORT}/api/health"
  if ! wait_for_http "http://${PUBLIC_HOST}/api/health" 5 1; then
    log "Public health check failed; verify Alibaba Cloud security group allows 80/tcp."
  fi
  docker version >/dev/null
}

main() {
  require_root "${ORIGINAL_ARGS[@]}"
  detect_public_host
  validate_host_and_ports

  log "Deploying ${APP_NAME} for http://${PUBLIC_HOST}"
  if [[ "${SKIP_SYSTEM}" != "1" ]]; then
    install_system_packages
  fi
  sync_project
  ensure_service_user
  create_env_file
  if [[ "${SKIP_APP_BUILD}" != "1" ]]; then
    build_application
  fi
  write_systemd_service
  write_nginx_site
  if [[ "${SKIP_IMAGE_BUILD}" != "1" ]]; then
    build_experiment_images
  fi
  restart_services
  verify_deployment

  log "Deployment finished."
  cat <<EOF

Visit: http://${PUBLIC_HOST}
Teacher password: ${ADMIN_PASSWORD}

Alibaba Cloud security group must allow:
  - 80/tcp
  - ${TERMINAL_PORT_START}-${TERMINAL_PORT_END}/tcp

Useful commands:
  systemctl status ${SERVICE_NAME}
  journalctl -u ${SERVICE_NAME} -f
  docker images 'linux-ai-exp:*'
EOF
}

main "$@"
