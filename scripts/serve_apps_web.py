#!/usr/bin/env python3
"""Serve apps/web for local dev; pick a free port if the default is busy."""
from __future__ import annotations

import http.server
import os
import socketserver
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
WEB = os.path.join(ROOT, "apps", "web")
if not os.path.isdir(WEB):
    print(f"[IMS] ไม่พบโฟลเดอร์ {WEB}", file=sys.stderr)
    sys.exit(1)

os.chdir(WEB)

Handler = http.server.SimpleHTTPRequestHandler
# โปรเจกต์นี้ใช้พอร์ต 8091 เป็นค่าเริ่มต้น (เปิด http://127.0.0.1:8091/)
DEFAULT_PORT = 8091
start = int(os.environ.get("PORT") or os.environ.get("IMS_DEV_PORT") or str(DEFAULT_PORT))
# ไม่เลื่อนพอร์ตอัตโนมัติ — ถ้า 8091 ถูกยึด ให้ปิดโปรเซสเก่าแล้วรันใหม่
ALLOW_PORT_FALLBACK = os.environ.get("IMS_DEV_PORT_FALLBACK") == "1"
# macOS: binding "" can end up IPv6-only in some setups; curl http://127.0.0.1:PORT then gets "Empty reply".
# Use 0.0.0.0 by default (override with IMS_DEV_BIND e.g. "" for all families).
BIND_HOST = os.environ.get("IMS_DEV_BIND")
if BIND_HOST is None:
    BIND_HOST = "0.0.0.0"


def main() -> None:
    socketserver.TCPServer.allow_reuse_address = True
    ports = range(start, start + 30) if ALLOW_PORT_FALLBACK else [start]
    for port in ports:
        try:
            with socketserver.TCPServer((BIND_HOST, port), Handler) as httpd:
                print(
                    f"\n[IMS] เว็บพร้อม: http://127.0.0.1:{port}/\n"
                    f"     (listen {BIND_HOST}:{port})\n",
                    flush=True,
                )
                httpd.serve_forever()
        except OSError as e:
            errno = getattr(e, "errno", None)
            if errno == 48 or (hasattr(e, "winerror") and e.winerror == 10048):
                if ALLOW_PORT_FALLBACK:
                    print(f"[IMS] พอร์ต {port} ถูกใช้แล้ว — ลอง {port + 1} …", flush=True)
                    continue
                print(
                    f"[IMS] พอร์ต {port} ถูกใช้แล้ว\n"
                    f"     ปิดโปรเซสเก่า: lsof -iTCP:{port} -sTCP:LISTEN แล้ว kill <PID>\n"
                    f"     จากนั้นรัน: npm run serve\n",
                    file=sys.stderr,
                    flush=True,
                )
                sys.exit(1)
            raise
    print("[IMS] ไม่มีพอร์ตว่างในช่วงที่ลองได้", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
