#!/usr/bin/env bash
# รันบนเครื่องคุณ หลัง Blaze + App Engine พร้อมแล้ว
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1) Deploy Cloud Functions ==="
cd firebase/functions && npm install && cd "$ROOT"
npm run firebase:deploy:functions

echo ""
echo "=== 2) ตรวจ Functions ==="
npx firebase-tools functions:list --project influencer-managements

echo ""
echo "=== 3) สร้าง Super Admin ใน Firestore ==="
echo "    (ต้องรัน gcloud auth application-default login ก่อน ครั้งแรก)"
node scripts/seed-super-admin.mjs admin 'รหัสที่คุณต้องการ'

echo ""
echo "=== 4) Deploy hosting (ข้อความ error ล่าสุด) ==="
npm run firebase:prepare:hosting
npx firebase-tools deploy --only hosting --project influencer-managements

echo ""
echo "เสร็จ — ทดสอบ: https://influencer-managements.web.app"
echo "Admin tab → username: admin"
