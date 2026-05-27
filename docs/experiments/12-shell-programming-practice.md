# shell 编程应用

- 实验 ID：`shell-programming-practice`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:shell-programming-practice-v1`

## 实验目标

编写一个简单巡检脚本，练习变量、循环、条件判断和输出重定向。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：创建巡检脚本

**目标：** 创建 check.sh。

**操作说明：** 创建空脚本文件。

参考命令：

```bash
touch shell-app/check.sh
```

**完成标准：** check.sh 文件存在。

### 步骤 2：写入 shebang

**目标：** 声明脚本解释器。

**操作说明：** 把 shebang 写入脚本第一行。

参考命令：

```bash
echo "#!/bin/bash" > shell-app/check.sh
```

**完成标准：** check.sh 第一行包含 /bin/bash。

### 步骤 3：统计主机数量

**目标：** 在脚本中统计主机清单行数。

**操作说明：** 追加 wc -l 命令。

参考命令：

```bash
echo "wc -l shell-app/hosts.txt" >> shell-app/check.sh
```

**完成标准：** 脚本包含 hosts.txt。

### 步骤 4：筛选错误日志

**目标：** 在脚本中加入错误筛选。

**操作说明：** 追加 grep ERROR 命令。

参考命令：

```bash
echo "grep ERROR shell-app/logs/app.log" >> shell-app/check.sh
```

**完成标准：** 脚本包含 grep ERROR。

### 步骤 5：赋予执行权限

**目标：** 使巡检脚本可运行。

**操作说明：** 为 check.sh 增加执行权限。

参考命令：

```bash
chmod +x shell-app/check.sh
```

**完成标准：** check.sh 可执行。

### 步骤 6：运行并保存输出

**目标：** 把巡检结果保存到文件。

**操作说明：** 运行脚本并重定向输出。

参考命令：

```bash
./shell-app/check.sh > shell-app/output/check-result.txt
```

**完成标准：** check-result.txt 存在并包含 ERROR。

### 步骤 7：查看巡检结果

**目标：** 确认输出内容。

**操作说明：** 查看巡检结果文件。

参考命令：

```bash
cat shell-app/output/check-result.txt
```

**完成标准：** 能看到主机数量或 ERROR 行。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

