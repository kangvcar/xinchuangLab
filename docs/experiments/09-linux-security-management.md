# Linux 安全管理

- 实验 ID：`linux-security-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-security-management-v1`

## 实验目标

认识账号、权限、日志、安全基线检查和最小权限原则。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：确认当前身份

**目标：** 检查当前用户和权限范围。

**操作说明：** 执行 whoami 和 id。

参考命令：

```bash
whoami
id
```

**完成标准：** 输出当前用户与组信息。

### 步骤 2：查看敏感文件权限

**目标：** 观察系统账号文件的权限。

**操作说明：** 查看 passwd 和 shadow 权限。

参考命令：

```bash
ls -l /etc/passwd /etc/shadow
```

**完成标准：** 能看到两个文件的权限差异。

### 步骤 3：查看监听端口

**目标：** 识别可能暴露的服务端口。

**操作说明：** 查看监听端口。

参考命令：

```bash
ss -tuln
```

**完成标准：** 命令成功输出端口列表。

### 步骤 4：分析失败登录

**目标：** 从样例日志中筛选失败记录。

**操作说明：** 筛选 failed 记录。

参考命令：

```bash
grep failed security/auth.log.sample
```

**完成标准：** 输出 login failed 行。

### 步骤 5：查看安全基线

**目标：** 阅读基础安全检查清单。

**操作说明：** 查看 baseline.txt。

参考命令：

```bash
cat security/baseline.txt
```

**完成标准：** 能看到账号、端口、权限等检查项。

### 步骤 6：生成安全检查记录

**目标：** 写出本次安全检查结论。

**操作说明：** 创建 security-summary.txt。

参考命令：

```bash
echo "security baseline checked" > security/report/security-summary.txt
```

**完成标准：** 文件包含 baseline。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

