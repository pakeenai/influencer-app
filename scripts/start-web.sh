#!/usr/bin/env bash
# สตาร์ทเว็บที่พอร์ต 8091 แล้วเปิดเบราว์เซอร์ (macOS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8091
URL="http://127.0.0.1:${PORT}/"
LOG="${TMPDIR:-/tmp}/ims-serve-${PORT}.log"

if lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[IMS] เซิร์ฟเวอร์รันอยู่แล้วที่ ${URL}"
else
  echo "[IMS] กำลังเริ่มเซิร์ฟเวอร์ที่พอร์ต ${PORT}…"
  nohup python3 "$ROOT/scripts/serve_apps_web.py" >>"$LOG" 2>&1 &
  disown 2>/dev/null || true
  sleep 1
  if ! curl -sS -o /dev/null --connect-timeout 3 "${URL}"; then
    echo "[IMS] เปิดไม่สำเร็จ — ดู log: ${LOG}" >&2
    exit 1
  fi
  echo "[IMS] เว็บพร้อม: ${URL} (log: ${LOG})"
fi

if command -v open >/dev/null 2>&1; then
  open "${URL}"
else
  echo "[IMS] เปิดเบราว์เซอร์ด้วยตนเอง: ${URL}"
fi
