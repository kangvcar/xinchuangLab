# 数据库服务器配置

- 实验 ID：`database-server-configuration`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:database-server-configuration-v1`

## 实验目标

认识数据库服务端口、配置文件、初始化 SQL 和基础备份思路。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看数据库配置样例

**目标：** 认识 my.cnf 基础字段。

**操作说明：** 查看端口、数据目录和字符集配置。

参考命令：

```bash
cat db/my.cnf.sample
```

**完成标准：** 能看到 port、datadir、character-set-server。

### 步骤 2：复制数据库配置

**目标：** 创建可编辑配置文件。

**操作说明：** 复制样例为 my.cnf。

参考命令：

```bash
cp db/my.cnf.sample db/my.cnf
```

**完成标准：** db/my.cnf 存在。

### 步骤 3：确认服务端口

**目标：** 定位数据库监听端口。

**操作说明：** 筛选 port 配置。

参考命令：

```bash
grep port db/my.cnf
```

**完成标准：** 输出 port=3306。

### 步骤 4：查看初始化 SQL

**目标：** 理解数据库初始化语句。

**操作说明：** 查看建库、建表和插入数据语句。

参考命令：

```bash
cat db/init.sql
```

**完成标准：** 能看到 CREATE DATABASE 和 CREATE TABLE。

### 步骤 5：保存 SQL 备份副本

**目标：** 练习备份重要脚本。

**操作说明：** 复制初始化脚本为备份。

参考命令：

```bash
cp db/init.sql db/init-backup.sql
```

**完成标准：** init-backup.sql 存在。

### 步骤 6：编写数据库配置记录

**目标：** 总结本次配置观察。

**操作说明：** 写入数据库配置摘要。

参考命令：

```bash
echo "database port 3306 utf8mb4" > db/report/db-summary.txt
```

**完成标准：** db-summary.txt 包含 3306。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

