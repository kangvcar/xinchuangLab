# Docker 镜像管理

- 实验 ID：`docker-image-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:docker-image-management-v1`

## 实验目标

认识镜像、标签、Dockerfile、镜像列表和基础镜像清理思路。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看镜像列表样例

**目标：** 认识镜像仓库、标签和大小。

**操作说明：** 查看 images.txt。

参考命令：

```bash
cat docker-image/images.txt
```

**完成标准：** 能看到 REPOSITORY、TAG、SIZE。

### 步骤 2：筛选基础镜像

**目标：** 查找 openEuler 镜像记录。

**操作说明：** 筛选 openeuler 行。

参考命令：

```bash
grep openeuler docker-image/images.txt
```

**完成标准：** 输出 openeuler 22.03。

### 步骤 3：查看 Dockerfile

**目标：** 认识镜像构建描述文件。

**操作说明：** 查看 FROM、LABEL、RUN 指令。

参考命令：

```bash
cat docker-image/Dockerfile.sample
```

**完成标准：** 能看到 FROM 指令。

### 步骤 4：复制 Dockerfile

**目标：** 创建可编辑构建文件。

**操作说明：** 复制样例为 Dockerfile。

参考命令：

```bash
cp docker-image/Dockerfile.sample docker-image/Dockerfile
```

**完成标准：** Dockerfile 文件存在。

### 步骤 5：追加镜像标签说明

**目标：** 记录镜像命名规则。

**操作说明：** 写入镜像标签说明。

参考命令：

```bash
echo "tag format repository:tag" > docker-image/report/image-note.txt
```

**完成标准：** image-note.txt 包含 repository:tag。

### 步骤 6：统计镜像数量

**目标：** 用文本命令统计样例镜像。

**操作说明：** 去掉表头后统计镜像条数。

参考命令：

```bash
tail -n +2 docker-image/images.txt | wc -l
```

**完成标准：** 输出 3。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

