# 邮件服务器配置

- 实验 ID：`mail-server-configuration`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:mail-server-configuration-v1`

## 实验目标

认识邮件服务配置中的主机名、域名、投递目录、别名和基础日志检查。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看邮件主配置

**目标：** 认识 main.cf 基础配置项。

**操作说明：** 查看 myhostname、mydomain、home_mailbox。

参考命令：

```bash
cat mail/main.cf.sample
```

**完成标准：** 能看到邮件主机名和域名配置。

### 步骤 2：复制邮件配置

**目标：** 创建可编辑配置文件。

**操作说明：** 复制 main.cf.sample 为 main.cf。

参考命令：

```bash
cp mail/main.cf.sample mail/main.cf
```

**完成标准：** mail/main.cf 存在。

### 步骤 3：确认邮件域名

**目标：** 定位 mydomain 配置。

**操作说明：** 筛选 mydomain 行。

参考命令：

```bash
grep mydomain mail/main.cf
```

**完成标准：** 输出 lab.local。

### 步骤 4：查看别名配置

**目标：** 认识邮件别名转发。

**操作说明：** 查看 postmaster 和 admin 别名。

参考命令：

```bash
cat mail/aliases.sample
```

**完成标准：** 能看到 admin: student。

### 步骤 5：分析邮件日志

**目标：** 从日志样例中查找投递记录。

**操作说明：** 筛选 delivered 记录。

参考命令：

```bash
grep delivered mail/maillog.sample
```

**完成标准：** 输出 delivered to mailbox。

### 步骤 6：编写邮件配置摘要

**目标：** 总结邮件配置要点。

**操作说明：** 写入邮件配置摘要。

参考命令：

```bash
echo "mail domain lab.local mailbox Maildir" > mail/report/mail-summary.txt
```

**完成标准：** mail-summary.txt 包含 Maildir。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

