# 信创Linux AI实时陪练实训平台

这是“信创Linux AI实时陪练实训平台”的第一阶段实现，目标是先打通文件管理实验的端到端 Demo 闭环：

学生选择实验 -> 创建实训会话 -> 打开 Web 终端或模拟终端 -> 上传终端日志 -> AI 生成三段式讲解 -> 教师查看记录 -> 生成 HTML 报告。

## 目录结构

```text
platform/
  backend/       FastAPI 后端
  frontend/      Vue3 前端
  docker/        openEuler 实验镜像文件
  experiments/   实验任务配置
  knowledge/     轻量知识库
```

## 本地启动

后端：

```bash
cd platform/backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

前端：

```bash
cd platform/frontend
npm install
npm run dev
```

默认使用 `LAB_RUNTIME=mock`，无需先构建 Docker 镜像即可体验完整的 AI 陪练和报告流程。要切换到真实容器模式，请复制 `.env.example` 为 `.env`，设置：

```text
LAB_RUNTIME=docker
```

并先构建实验镜像：

```bash
cd platform/docker/openeuler-file
docker build -t linux-ai-exp:openeuler-file-v1 .
```

## AI 配置

默认 `AI_MODE=auto`。如果未配置 `DEEPSEEK_API_KEY`，后端会使用本地模拟讲解器，便于离线演示。

配置 DeepSeek：

```text
AI_MODE=deepseek
DEEPSEEK_API_KEY=你的 API Key
```

