# Linux 文本处理

- 实验 ID：`linux-text-processing`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-text-processing-v1`

## 实验目标

使用 cat、head、tail、grep、wc、sort、uniq、cut 等命令处理常见文本文件。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看文本文件

**目标：** 整体观察日志内容。

**操作说明：** 使用 cat 查看 access.log。

参考命令：

```bash
cat text/access.log
```

**完成标准：** 能看到多行日志。

### 步骤 2：查看首尾内容

**目标：** 掌握 head 和 tail 的用途。

**操作说明：** 分别查看日志前两行和后两行。

参考命令：

```bash
head -n 2 text/access.log
tail -n 2 text/access.log
```

**完成标准：** 命令成功输出指定行数。

### 步骤 3：筛选错误日志

**目标：** 用 grep 定位 ERROR 行。

**操作说明：** 筛选包含 ERROR 的日志。

参考命令：

```bash
grep ERROR text/access.log
```

**完成标准：** 输出只包含 ERROR 相关行。

### 步骤 4：统计日志行数

**目标：** 用 wc 统计文本行数。

**操作说明：** 统计 access.log 的行数。

参考命令：

```bash
wc -l text/access.log
```

**完成标准：** 输出行数统计结果。

### 步骤 5：提取用户列

**目标：** 从 CSV 中提取第一列。

**操作说明：** 使用逗号作为分隔符提取第一列。

参考命令：

```bash
cut -d, -f1 text/users.csv
```

**完成标准：** 输出 name、alice、bob 等内容。

### 步骤 6：去重排序用户

**目标：** 组合 sort 和 uniq 得到唯一用户名。

**操作说明：** 过滤表头后排序去重。

参考命令：

```bash
cut -d, -f1 text/users.csv | tail -n +2 | sort | uniq
```

**完成标准：** 输出不重复的用户名。

### 步骤 7：保存错误日志

**目标：** 把筛选结果保存为文件。

**操作说明：** 将 ERROR 行重定向到 text/output/errors.log。

参考命令：

```bash
grep ERROR text/access.log > text/output/errors.log
```

**完成标准：** errors.log 存在并包含 ERROR。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

