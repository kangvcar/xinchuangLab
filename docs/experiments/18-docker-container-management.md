# Docker 容器管理

- 实验 ID：`docker-container-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:docker-container-management-v1`

## 实验目标

认识容器、状态、端口映射、日志和停止/清理流程。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看容器列表样例

**目标：** 认识容器状态字段。

**操作说明：** 查看 containers.txt。

参考命令：

```bash
cat docker-container/containers.txt
```

**完成标准：** 能看到 Up 和 Exited 状态。

### 步骤 2：筛选运行中容器

**目标：** 查找 Up 状态容器。

**操作说明：** 筛选运行中的容器。

参考命令：

```bash
grep " Up " docker-container/containers.txt
```

**完成标准：** 输出 web-demo 和 cache-demo。

### 步骤 3：查看端口映射

**目标：** 定位 Web 容器端口映射。

**操作说明：** 查找 8080 到 80 的映射。

参考命令：

```bash
grep "8080->80" docker-container/containers.txt
```

**完成标准：** 输出 web-demo 行。

### 步骤 4：查看容器日志样例

**目标：** 认识服务日志内容。

**操作说明：** 查看 web-demo.log。

参考命令：

```bash
cat docker-container/web-demo.log
```

**完成标准：** 能看到 HTTP 访问记录。

### 步骤 5：记录停止流程

**目标：** 写出停止容器的命令思路。

**操作说明：** 把停止容器命令写入计划文件。

参考命令：

```bash
echo "docker stop web-demo" > docker-container/report/stop-plan.txt
```

**完成标准：** stop-plan.txt 包含 docker stop。

### 步骤 6：编写容器巡检摘要

**目标：** 总结容器状态和端口信息。

**操作说明：** 创建 container-summary.txt。

参考命令：

```bash
echo "containers status ports logs checked" > docker-container/report/container-summary.txt
```

**完成标准：** 文件包含 ports。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

