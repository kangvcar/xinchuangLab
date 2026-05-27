# Linux 权限管理

- 实验 ID：`linux-permission-management`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-permission-management-v1`

## 实验目标

理解文件权限、chmod、umask 和私有目录的基础用法。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看权限位

**目标：** 观察文件权限字符串。

**操作说明：** 执行 ls -l perm，查看 run.sh 和 readme.txt 的权限。

参考命令：

```bash
ls -l perm
```

**完成标准：** 能看到 rwx 或 rw- 权限字段。

### 步骤 2：增加执行权限

**目标：** 让脚本可执行。

**操作说明：** 对 run.sh 增加执行权限。

参考命令：

```bash
chmod +x perm/run.sh
```

**完成标准：** perm/run.sh 拥有执行权限。

### 步骤 3：运行脚本

**目标：** 验证权限变更效果。

**操作说明：** 执行 ./perm/run.sh。

参考命令：

```bash
./perm/run.sh
```

**完成标准：** 终端输出 permission-ok。

### 步骤 4：创建私有目录

**目标：** 练习目录权限保护。

**操作说明：** 创建 private 目录并设置 700 权限。

参考命令：

```bash
mkdir -p perm/private && chmod 700 perm/private
```

**完成标准：** perm/private 目录存在且权限为 700。

### 步骤 5：查看默认权限

**目标：** 认识 umask 对新文件权限的影响。

**操作说明：** 执行 umask，记录当前默认权限掩码。

参考命令：

```bash
umask
```

**完成标准：** 命令成功输出掩码。

### 步骤 6：创建权限说明

**目标：** 用文本记录权限含义。

**操作说明：** 写入本次权限实验结论。

参考命令：

```bash
echo "700 owner only" > perm/permission-note.txt
```

**完成标准：** permission-note.txt 包含 owner only。

### 步骤 7：恢复脚本普通权限

**目标：** 练习去除执行权限。

**操作说明：** 移除 run.sh 的执行权限。

参考命令：

```bash
chmod -x perm/run.sh
```

**完成标准：** run.sh 不再可直接执行。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

