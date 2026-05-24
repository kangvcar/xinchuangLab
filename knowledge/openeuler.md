# openEuler 教学要点

openEuler 是面向服务器和云原生场景的开源操作系统，课堂中可突出国产 Linux 生态和企业级服务管理能力。

## 软件包管理

openEuler 使用 `dnf` 管理软件包。

## 服务管理

服务通常通过 `systemctl start/status/enable` 管理。容器环境中是否可完整使用 systemd 取决于镜像启动方式。

## 网络与端口

可使用 `ss -tunlp` 查看监听端口，使用 `curl localhost` 验证本机 HTTP 服务。

