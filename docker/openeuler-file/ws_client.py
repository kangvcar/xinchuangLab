#!/usr/bin/env python3
import asyncio
import json
import os
import time
import urllib.parse
from pathlib import Path

try:
    import websockets
except ImportError:
    websockets = None


SESSION_ID = os.getenv("SESSION_ID", "")
STUDENT_ID = os.getenv("STUDENT_ID", "student")
EXPERIMENT_ID = os.getenv("EXPERIMENT_ID", "file-basic")
WS_SERVER = os.getenv("WS_SERVER", "ws://host.docker.internal:8000/ws/terminal-log")
LOG_PATH = Path("/tmp/linux-ai-session/session.log")


async def send_loop():
    if websockets is None:
        print("python websockets package is missing; terminal upload disabled", flush=True)
        return
    offset = 0
    while True:
        try:
            async with websockets.connect(WS_SERVER, ping_interval=20) as websocket:
                while True:
                    if LOG_PATH.exists():
                        data = LOG_PATH.read_bytes()
                        if len(data) > offset:
                            chunk = data[offset:].decode("utf-8", errors="ignore")
                            offset = len(data)
                            payload = {
                                "session_id": SESSION_ID,
                                "student_id": STUDENT_ID,
                                "experiment_id": EXPERIMENT_ID,
                                "system": "openEuler",
                                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                                "type": "terminal_stream",
                                "content": chunk,
                            }
                            await websocket.send(json.dumps(payload, ensure_ascii=False))
                    await asyncio.sleep(0.8)
        except Exception as exc:
            print(f"websocket upload reconnecting: {exc}", flush=True)
            await asyncio.sleep(2)


if __name__ == "__main__":
    if not SESSION_ID:
        print("SESSION_ID is empty; terminal upload disabled", flush=True)
    else:
        asyncio.run(send_loop())

