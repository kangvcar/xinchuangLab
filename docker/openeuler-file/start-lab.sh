#!/bin/bash
set -euo pipefail

mkdir -p /tmp/linux-ai-session
chown -R student:student /tmp/linux-ai-session

python3 /opt/linux-ai/ws_client.py &

exec ttyd \
  -p 7681 \
  -W \
  -t fontSize=15 \
  -t lineHeight=1.35 \
  -t 'fontFamily=Cascadia Mono, JetBrains Mono, Consolas, monospace' \
  -t cursorBlink=true \
  -t cursorStyle=bar \
  -t scrollback=10000 \
  -t disableLeaveAlert=true \
  -t 'theme={"background":"#1f2430","foreground":"#e5e7eb","cursor":"#f8fafc","selectionBackground":"#3b82f680","black":"#111827","red":"#ef4444","green":"#22c55e","yellow":"#facc15","blue":"#60a5fa","magenta":"#c084fc","cyan":"#2dd4bf","white":"#f8fafc","brightBlack":"#64748b","brightRed":"#f87171","brightGreen":"#4ade80","brightYellow":"#fde047","brightBlue":"#93c5fd","brightMagenta":"#d8b4fe","brightCyan":"#67e8f9","brightWhite":"#ffffff"}' \
  su - student -c "script -q -f /tmp/linux-ai-session/session.log /bin/bash"
