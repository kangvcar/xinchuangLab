# shell 编程初探

- 实验 ID：`shell-programming-intro`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:shell-programming-intro-v1`

## 实验目标

完成第一个 Shell 脚本，认识 shebang、变量、参数和脚本执行方式。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：创建脚本文件

**目标：** 创建 hello.sh 脚本。

**操作说明：** 复制模板为 hello.sh。

参考命令：

```bash
cp shell-intro/template.sh shell-intro/hello.sh
```

**完成标准：** hello.sh 文件存在。

### 步骤 2：写入输出语句

**目标：** 让脚本输出问候文本。

**操作说明：** 向脚本追加 echo 语句。

参考命令：

```bash
echo "echo hello shell" >> shell-intro/hello.sh
```

**完成标准：** hello.sh 包含 hello shell。

### 步骤 3：增加执行权限

**目标：** 使脚本可以直接执行。

**操作说明：** 为 hello.sh 增加执行权限。

参考命令：

```bash
chmod +x shell-intro/hello.sh
```

**完成标准：** hello.sh 可执行。

### 步骤 4：运行脚本

**目标：** 执行第一个 Shell 脚本。

**操作说明：** 运行 hello.sh，观察输出。

参考命令：

```bash
./shell-intro/hello.sh
```

**完成标准：** 终端输出 hello shell。

### 步骤 5：使用变量

**目标：** 在脚本中加入变量。

**操作说明：** 追加 name=student 变量定义。

参考命令：

```bash
echo "name=student" >> shell-intro/hello.sh
```

**完成标准：** 脚本包含 name=student。

### 步骤 6：保存脚本说明

**目标：** 记录脚本执行方法。

**操作说明：** 写入脚本运行说明。

参考命令：

```bash
echo "run with ./hello.sh" > shell-intro/script-note.txt
```

**完成标准：** script-note.txt 包含 ./hello.sh。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

