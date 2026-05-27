# Linux 用户管理

- 实验 ID：`linux-user-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-user-management-v1`

## 实验目标

认识用户、用户组、UID/GID 和账号文件结构，完成基础用户信息分析。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：确认当前用户

**目标：** 识别当前登录身份。

**操作说明：** 执行 whoami 和 id，观察当前用户与组。

参考命令：

```bash
whoami
id
```

**完成标准：** 输出包含 student 或 UID/GID 信息。

### 步骤 2：查看账号样例

**目标：** 认识 passwd 文件字段。

**操作说明：** 查看 passwd.sample，观察冒号分隔字段。

参考命令：

```bash
cat users/passwd.sample
```

**完成标准：** 能看到 root、student、ops 三行。

### 步骤 3：提取用户名

**目标：** 用 cut 提取账号名。

**操作说明：** 按冒号分隔，提取第一列用户名。

参考命令：

```bash
cut -d: -f1 users/passwd.sample
```

**完成标准：** 输出 root、student、ops。

### 步骤 4：查看用户组样例

**目标：** 认识 group 文件结构。

**操作说明：** 查看 group.sample。

参考命令：

```bash
cat users/group.sample
```

**完成标准：** 能看到组名和 GID。

### 步骤 5：查找普通用户

**目标：** 根据 UID 范围识别普通用户。

**操作说明：** 筛选 UID 1000 以上的样例用户。

参考命令：

```bash
grep ":100" users/passwd.sample
```

**完成标准：** 输出 student 和 ops。

### 步骤 6：编写用户分析记录

**目标：** 形成账号分析结果。

**操作说明：** 把分析结果写入 user-analysis.txt。

参考命令：

```bash
echo "student and ops are normal users" > users/report/user-analysis.txt
```

**完成标准：** 分析文件存在并包含 normal users。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

