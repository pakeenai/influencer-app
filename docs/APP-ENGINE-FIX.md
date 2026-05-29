# แก้ "Error while initializing App Engine"

ข้อความนี้ขึ้นตอนสร้าง App Engine ใน Google Cloud Console — จำเป็นสำหรับ **Cloud Functions** (ล็อกอิน Admin / PIN บน production)

## สาเหตุที่พบบ่อย

1. **ยังไม่ได้อัปเกรด Blaze** หรือยังไม่ผูกบัตร
2. **Console มีบั๊กชั่วคราว** — ลองใหม่หลัง 1–24 ชม. หรือใช้ CLI แทน
3. **Organization policy** บล็อกการสร้าง service account (`iam.disableServiceAccountCreation`)
4. **บัญชีไม่มีสิทธิ์ Owner/Editor** บนโปรเจกต์

## ขั้นที่ 1 — เช็ค Billing (บังคับ)

1. เปิด https://console.firebase.google.com/project/influencer-managements/usage/details  
2. กด **Upgrade to Blaze (pay as you go)**  
3. ผูกบัตรเครดิตให้เรียบร้อย  

Cloud Functions และ App Engine ใช้ไม่ได้บนแผน Spark ฟรี

## ขั้นที่ 2 — สร้าง App Engine ผ่าน CLI (แนะนำ)

Console พังบ่อย — ใช้ `gcloud` แทน:

```bash
# ติดตั้ง (ครั้งเดียว, macOS)
brew install --cask gcloud-cli

# login
gcloud auth login

# สร้าง App Engine (region ต้องสอดคล้อง functions)
cd /path/to/my-realtime-web-copy
chmod +x scripts/setup-app-engine.sh
./scripts/setup-app-engine.sh influencer-managements us-central
```

Region ที่เลือกได้ครั้งเดียว — แนะนำ **`us-central`** เพราะ Functions ใช้ `us-central1`

## ขั้นที่ 3 — Deploy Functions

```bash
cd firebase/functions && npm install
cd ../..
npm run firebase:deploy:functions
```

## ขั้นที่ 4 — ถ้ายังไม่ได้

### A) ลองเบราว์เซอร์ / บัญชีอื่น
- Incognito  
- Chrome แทน Safari  
- บัญชี Google ที่เป็น **Owner** ของโปรเจกต์  

### B) เปิด API ด้วยมือ
https://console.cloud.google.com/apis/library?project=influencer-managements  

เปิดให้ครบ:
- Cloud Functions API  
- Cloud Build API  
- Artifact Registry API  
- App Engine Admin API  

### C) Organization (บริษัท / Workspace)
ถ้าโปรเจกต์อยู่ใต้องค์กร ให้แอดมินองค์กร:
- ปิดชั่วคราว policy `iam.disableServiceAccountCreation`  
- หรือให้สิทธิ์สร้าง service account  

### D) สร้างโปรเจกต์ Firebase ใหม่
ถ้าโปรเจกต์เสีย สร้างโปรเจกต์ใหม่ → Blaze → App Engine (CLI) → ย้าย config ใน `firebase-config.local.js`

## ใช้งานระหว่างรอแก้

บนเครื่อง dev (ไม่ต้อง App Engine):

```bash
npm run dev
```

- Admin: `admin` / `admin123`  
- ไม่ต้อง Cloud Functions  

Production https://influencer-managements.web.app — หน้าเว็บ + Firestore ใช้ได้หลังตั้ง `firebase-config.local.js` แล้ว แต่ **ล็อกอินต้องรอ Functions**
