# Linux 网络配置

- 实验 ID：`linux-network-configuration`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:linux-network-configuration-v1`

## 实验目标

认识 IP 地址、路由、DNS、端口监听和主机名等基础网络配置要素。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看 IP 地址

**目标：** 观察容器网卡地址。

**操作说明：** 执行 ip addr，找到网卡和 inet 地址。

参考命令：

```bash
ip addr
```

**完成标准：** 命令成功输出网卡信息。

### 步骤 2：查看路由

**目标：** 了解默认网关信息。

**操作说明：** 执行 ip route，观察 default 路由。

参考命令：

```bash
ip route
```

**完成标准：** 命令成功输出路由表。

### 步骤 3：查看 DNS 配置

**目标：** 认识 resolv.conf 中的 nameserver。

**操作说明：** 查看当前 DNS 解析配置。

参考命令：

```bash
cat /etc/resolv.conf
```

**完成标准：** 输出包含 nameserver 或搜索域配置。

### 步骤 4：解析本地主机名

**目标：** 用 getent 验证名称解析。

**操作说明：** 执行 getent hosts localhost。

参考命令：

```bash
getent hosts localhost
```

**完成标准：** 输出 localhost 的地址。

### 步骤 5：查看监听端口

**目标：** 认识端口监听状态。

**操作说明：** 执行 ss -tuln，观察 TCP/UDP 监听信息。

参考命令：

```bash
ss -tuln
```

**完成标准：** 命令成功输出套接字列表。

### 步骤 6：整理网络说明

**目标：** 记录 IP、DNS、路由的作用。

**操作说明：** 把网络观察结果写入总结文件。

参考命令：

```bash
echo "ip dns route checked" > network/report/network-summary.txt
```

**完成标准：** network-summary.txt 包含 dns。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

