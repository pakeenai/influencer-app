#!/usr/bin/env bash
# สร้าง App Engine ผ่าน gcloud (แก้ "Error while initializing App Engine" ใน Console)
# ใช้หลัง: อัปเกรด Blaze + ผูกบัตรแล้ว
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${1:-influencer-managements}"
REGION="${2:-us-central}"

if command -v gcloud >/dev/null 2>&1; then
  GCLOUD=gcloud
elif [[ -x /opt/homebrew/share/google-cloud-sdk/bin/gcloud ]]; then
  GCLOUD=/opt/homebrew/share/google-cloud-sdk/bin/gcloud
else
  echo "ไม่พบ gcloud — ติดตั้ง: brew install --cask gcloud-cli"
  echo "แล้วรัน: gcloud auth login"
  exit 1
fi

export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$ROOT/.gcloud-config}"
mkdir -p "$CLOUDSDK_CONFIG"

echo "Project: $PROJECT"
echo "Region:  $REGION (ต้องตรงกับ Cloud Functions: us-central1)"
echo ""

if ! "$GCLOUD" auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  echo "ยังไม่ได้ login — รัน:"
  echo "  $GCLOUD auth login"
  exit 1
fi

"$GCLOUD" config set project "$PROJECT"

if "$GCLOUD" app describe --project="$PROJECT" >/dev/null 2>&1; then
  echo "App Engine มีอยู่แล้ว:"
  "$GCLOUD" app describe --project="$PROJECT"
  exit 0
fi

echo "กำลังสร้าง App Engine..."
"$GCLOUD" app create --project="$PROJECT" --region="$REGION"

echo ""
echo "สำเร็จ — ลอง deploy functions:"
echo "  cd $ROOT && npm run firebase:deploy:functions"
