# Linux 文件管理

- 实验 ID：`linux-file-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-file-management-v1`

## 实验目标

掌握目录创建、文件复制、移动、查看、查找和清理等基础文件管理操作。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看实验素材

**目标：** 确认 files/source 下已有素材文件。

**操作说明：** 执行 ls -l files/source，观察 readme.txt 和 app.conf。

参考命令：

```bash
ls -l files/source
```

**完成标准：** 能看到两个素材文件。

### 步骤 2：创建工作目录

**目标：** 建立独立练习目录。

**操作说明：** 创建 files/work 目录用于后续操作。

参考命令：

```bash
mkdir -p files/work
```

**完成标准：** files/work 目录存在。

### 步骤 3：复制文件

**目标：** 把素材复制到工作目录。

**操作说明：** 复制 readme.txt，并保留原文件。

参考命令：

```bash
cp files/source/readme.txt files/work/readme-copy.txt
```

**完成标准：** files/work/readme-copy.txt 存在。

### 步骤 4：移动并重命名

**目标：** 练习 mv 的移动和改名作用。

**操作说明：** 把 readme-copy.txt 重命名为 notes.txt。

参考命令：

```bash
mv files/work/readme-copy.txt files/work/notes.txt
```

**完成标准：** notes.txt 存在且 readme-copy.txt 不再存在。

### 步骤 5：查看文件内容

**目标：** 确认文件内容复制正确。

**操作说明：** 使用 cat 查看 notes.txt 内容。

参考命令：

```bash
cat files/work/notes.txt
```

**完成标准：** 终端输出包含 file management practice。

### 步骤 6：查找文本文件

**目标：** 用 find 根据名称定位文件。

**操作说明：** 执行 find files -name "*.txt"，观察匹配结果。

参考命令：

```bash
find files -name "*.txt"
```

**完成标准：** 输出包含 notes.txt 或 readme.txt。

### 步骤 7：清理临时文件

**目标：** 删除练习中产生的临时文件。

**操作说明：** 删除 notes.txt，保留目录结构。

参考命令：

```bash
rm files/work/notes.txt
```

**完成标准：** files/work/notes.txt 不存在。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

