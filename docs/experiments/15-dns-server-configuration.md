# DNS 服务器配置

- 实验 ID：`dns-server-configuration`
- 难度：简单-适中
- 适用场景：高校课程实训、课后上机实验、基础运维实操练习
- 镜像：`linux-ai-exp:dns-server-configuration-v1`

## 实验目标

认识 DNS 主配置、区域文件、A 记录和基础解析检查思路。

## 实验环境

- 系统：openEuler 容器环境
- 用户：student
- 工作目录：/home/student
- 所有操作均在实验容器内完成，避免修改宿主机环境。

## 实验步骤

### 步骤 1：查看 DNS 主配置

**目标：** 认识 named.conf 中的区域声明。

**操作说明：** 查看 named.conf.sample。

参考命令：

```bash
cat dns/named.conf.sample
```

**完成标准：** 能看到 zone "lab.local"。

### 步骤 2：复制区域文件

**目标：** 创建可编辑 zone 文件。

**操作说明：** 复制区域文件模板。

参考命令：

```bash
cp dns/zones/lab.local.zone.sample dns/zones/lab.local.zone
```

**完成标准：** lab.local.zone 存在。

### 步骤 3：查看 NS 记录

**目标：** 定位权威 DNS 服务器记录。

**操作说明：** 筛选 NS 记录。

参考命令：

```bash
grep "NS" dns/zones/lab.local.zone
```

**完成标准：** 输出 ns.lab.local。

### 步骤 4：查看 A 记录

**目标：** 定位域名到 IP 的映射。

**操作说明：** 筛选 A 记录。

参考命令：

```bash
grep " IN A " dns/zones/lab.local.zone
```

**完成标准：** 输出 ns 和 www 的地址。

### 步骤 5：新增主机记录

**目标：** 练习添加一条 A 记录。

**操作说明：** 向区域文件追加 app 记录。

参考命令：

```bash
echo "app IN A 10.10.10.30" >> dns/zones/lab.local.zone
```

**完成标准：** zone 文件包含 app IN A。

### 步骤 6：编写 DNS 配置摘要

**目标：** 总结 DNS 配置要点。

**操作说明：** 写入 DNS 配置摘要。

参考命令：

```bash
echo "dns zone lab.local has A records" > dns/report/dns-summary.txt
```

**完成标准：** dns-summary.txt 包含 lab.local。

## 学习记录建议

- 每完成一步，记录关键命令、观察到的输出和自己的判断。
- 遇到报错时先阅读错误信息，再检查路径、权限、命令拼写和文件是否存在。
- 实验结束后可重新查看生成的记录文件，复盘自己完成了哪些操作。

