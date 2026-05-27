# Aliyun Ubuntu 24 Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable Ubuntu 24.04 deployment automation for the platform on Alibaba Cloud, including domestic package mirrors and all experiment Docker images.

**Architecture:** Keep FastAPI behind Nginx on localhost and serve the Vite build as static assets. Docker lab containers expose terminal ports from a configurable range so Alibaba Cloud security groups can be opened predictably. The deploy script provisions system dependencies, builds app assets, creates systemd/Nginx config, and builds every published experiment image.

**Tech Stack:** Bash, Ubuntu 24.04 apt, Docker CE, Nginx, systemd, Python 3.12 venv, Node.js 20, npm, FastAPI, React/Vite.

---

### Task 1: Predictable Docker Terminal URLs

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/docker_manager.py`
- Modify: `backend/tests/test_docker_manager.py`

- [ ] Add failing tests for public scheme and terminal port range.
- [ ] Implement `PUBLIC_SCHEME`, `TERMINAL_PORT_START`, and `TERMINAL_PORT_END`.
- [ ] Use configured range when publishing container ports.
- [ ] Run the focused DockerManager tests.

### Task 2: Alibaba Cloud Deployment Script

**Files:**
- Create: `scripts/deploy-aliyun-ubuntu24.sh`

- [ ] Configure Ubuntu, Docker CE, pip, npm, and Docker daemon mirrors for domestic networks.
- [ ] Install Python, Node.js, Docker, Nginx, and build prerequisites.
- [ ] Build frontend and backend environments.
- [ ] Generate `.env`, systemd service, and Nginx site config.
- [ ] Build all experiment images from `experiments/*.json`.
- [ ] Add verification commands and clear failure messages.

### Task 3: Documentation and Verification

**Files:**
- Modify: `README.md`

- [ ] Document one-command deployment and required Alibaba Cloud security-group ports.
- [ ] Run frontend build.
- [ ] Run backend tests where supported by the local Python version.
- [ ] Run shell syntax checks for the deploy script.
