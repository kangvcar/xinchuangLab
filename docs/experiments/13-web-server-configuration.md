# Web 服务器配置

- 实验 ID：`web-server-configuration`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:web-server-configuration-v1`

## 实验目标

认识 Web 服务端口、站点目录、首页文件和基础配置项。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看 Web 配置样例

**目标：** 认识 Listen 和 DocumentRoot。

**操作说明：** 查看 httpd.conf.sample。

参考命令：

```bash
cat web/httpd.conf.sample
```

**完成标准：** 能看到 Listen 和 DocumentRoot。

### 步骤 2：复制配置文件

**目标：** 生成可编辑配置。

**操作说明：** 复制样例为 httpd.conf。

参考命令：

```bash
cp web/httpd.conf.sample web/httpd.conf
```

**完成标准：** web/httpd.conf 存在。

### 步骤 3：创建首页文件

**目标：** 准备 Web 首页内容。

**操作说明：** 复制首页模板为 index.html。

参考命令：

```bash
cp web/site/index.template.html web/site/index.html
```

**完成标准：** index.html 存在。

### 步骤 4：确认监听端口

**目标：** 从配置中定位端口。

**操作说明：** 筛选 Listen 行。

参考命令：

```bash
grep Listen web/httpd.conf
```

**完成标准：** 输出 Listen 8080。

### 步骤 5：确认站点目录

**目标：** 检查 DocumentRoot 路径。

**操作说明：** 筛选 DocumentRoot 行。

参考命令：

```bash
grep DocumentRoot web/httpd.conf
```

**完成标准：** 输出站点目录路径。

### 步骤 6：写入配置说明

**目标：** 记录 Web 配置要点。

**操作说明：** 创建 web-summary.txt。

参考命令：

```bash
echo "web listen 8080 documentroot site" > web/report/web-summary.txt
```

**完成标准：** 文件包含 documentroot。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

