# Linux 软件管理

- 实验 ID：`linux-package-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-package-management-v1`

## 实验目标

认识 dnf、rpm、软件仓库和已安装软件查询等基础软件管理操作。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看 dnf 版本

**目标：** 确认系统软件管理工具。

**操作说明：** 执行 dnf --version，观察版本信息。

参考命令：

```bash
dnf --version
```

**完成标准：** dnf 输出版本或插件信息。

### 步骤 2：查看软件仓库

**目标：** 认识软件源配置。

**操作说明：** 执行 dnf repolist，查看启用仓库。

参考命令：

```bash
dnf repolist
```

**完成标准：** 输出仓库列表。

### 步骤 3：查询已安装软件

**目标：** 用 rpm 查看安装包。

**操作说明：** 列出部分已安装 rpm 包。

参考命令：

```bash
rpm -qa | head
```

**完成标准：** 输出若干软件包名称。

### 步骤 4：定位命令路径

**目标：** 确认命令由哪个文件提供。

**操作说明：** 执行 which curl，查看 curl 路径。

参考命令：

```bash
which curl
```

**完成标准：** 输出 curl 的可执行文件路径。

### 步骤 5：查看软件清单

**目标：** 阅读实验给定的软件清单。

**操作说明：** 查看 package-list.txt。

参考命令：

```bash
cat packages/package-list.txt
```

**完成标准：** 能看到 bash、curl、tree 等软件名。

### 步骤 6：编写软件检查记录

**目标：** 记录仓库和已安装软件观察结论。

**操作说明：** 将检查结果写入 package-summary.txt。

参考命令：

```bash
echo "dnf rpm checked" > packages/report/package-summary.txt
```

**完成标准：** 文件存在并包含 rpm。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

