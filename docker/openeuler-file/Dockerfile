ARG BASE_IMAGE=openeuler/openeuler:22.03-lts-sp3
FROM ${BASE_IMAGE}

ARG OPENEULER_RELEASE=openEuler-22.03-LTS-SP3
ARG OPENEULER_MIRROR=https://repo.huaweicloud.com/openeuler
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG TTYD_URL=https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64

RUN set -eux; \
    printf '%s\n' \
      '[OS]' \
      'name=openEuler OS' \
      "baseurl=${OPENEULER_MIRROR}/${OPENEULER_RELEASE}/OS/\$basearch/" \
      'enabled=1' \
      'gpgcheck=0' \
      '' \
      '[everything]' \
      'name=openEuler everything' \
      "baseurl=${OPENEULER_MIRROR}/${OPENEULER_RELEASE}/everything/\$basearch/" \
      'enabled=1' \
      'gpgcheck=0' \
      '' \
      '[update]' \
      'name=openEuler update' \
      "baseurl=${OPENEULER_MIRROR}/${OPENEULER_RELEASE}/update/\$basearch/" \
      'enabled=1' \
      'gpgcheck=0' \
      '' \
      '[EPOL]' \
      'name=openEuler EPOL' \
      "baseurl=${OPENEULER_MIRROR}/${OPENEULER_RELEASE}/EPOL/main/\$basearch/" \
      'enabled=1' \
      'gpgcheck=0' \
      > /etc/yum.repos.d/openEuler.repo; \
    dnf clean all; \
    dnf makecache; \
    dnf -y update; \
    dnf -y install bash python3 python3-pip shadow util-linux vim-minimal findutils tree curl wget iproute net-tools procps-ng sudo; \
    python3 -m pip install --no-cache-dir -i "$PIP_INDEX_URL" websockets; \
    curl -fsSL --retry 3 --connect-timeout 20 "$TTYD_URL" -o /usr/local/bin/ttyd; \
    chmod +x /usr/local/bin/ttyd && \
    useradd -m -s /bin/bash student && \
    echo 'student ALL=(ALL) NOPASSWD: /usr/bin/ls, /usr/bin/cat, /usr/bin/find, /usr/bin/touch, /usr/bin/mkdir, /usr/bin/cp, /usr/bin/mv, /usr/bin/rm' > /etc/sudoers.d/student-lab && \
    chmod 440 /etc/sudoers.d/student-lab && \
    mkdir -p /opt/linux-ai /tmp/linux-ai-session && \
    chown -R student:student /tmp/linux-ai-session && \
    dnf clean all

COPY start-lab.sh /opt/linux-ai/start-lab.sh
COPY ws_client.py /opt/linux-ai/ws_client.py
COPY task.json /opt/linux-ai/task.json

RUN chmod +x /opt/linux-ai/start-lab.sh /opt/linux-ai/ws_client.py

EXPOSE 7681

ENTRYPOINT ["/opt/linux-ai/start-lab.sh"]
