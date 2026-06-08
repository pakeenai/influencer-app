/**
 * อ่านค่าจาก .env แล้ว generate ไฟล์ config ฝั่ง browser:
 *   - apps/web/firebase-config.local.js   (window.IMS_FIREBASE_CONFIG)
 *   - apps/web/env-config.local.js        (window.IMS_ENV, window.IMS_BACKEND)
 *
 * ใช้: node scripts/gen-config-from-env.mjs   (หรือ npm run config:gen)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  console.error('[config] ไม่พบไฟล์ .env — คัดลอกจาก .env.example ก่อน แล้วใส่ค่าจริง');
  process.exit(1);
}

// ---- parse .env (รองรับ comment, ค่าในเครื่องหมายคำพูด) ----
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith('#')) continue;
  const idx = s.indexOf('=');
  if (idx < 0) continue;
  const key = s.slice(0, idx).trim();
  let val = s.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const web = path.join(root, 'apps', 'web');

// ---- firebase-config.local.js ----
const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || '',
  authDomain: env.FIREBASE_AUTH_DOMAIN || '',
  projectId: env.FIREBASE_PROJECT_ID || '',
  storageBucket: env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.FIREBASE_APP_ID || ''
};
fs.writeFileSync(
  path.join(web, 'firebase-config.local.js'),
  `/** สร้างอัตโนมัติจาก .env (scripts/gen-config-from-env.mjs) — อย่าแก้ไฟล์นี้โดยตรง */\n` +
    `window.IMS_FIREBASE_CONFIG = ${JSON.stringify(firebaseConfig, null, 2)};\n`
);

// ---- env-config.local.js ----
const appEnv = {
  IMS_BACKEND: env.IMS_BACKEND || 'sql',
  SQL_TABLE_PREFIX: env.SQL_TABLE_PREFIX || 'xstream2_',
  ADMIN_USERNAME: env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || 'admin',
  // TikTok Login Kit — ค่า public เท่านั้น (client_secret อยู่ฝั่ง server, ห้าม expose)
  TIKTOK_CLIENT_KEY: env.TIKTOK_CLIENT_KEY || '',
  TIKTOK_REDIRECT_URI: env.TIKTOK_REDIRECT_URI || '',
  TIKTOK_SCOPES: env.TIKTOK_SCOPES || 'user.info.basic,user.info.profile,user.info.stats,video.list'
};
fs.writeFileSync(
  path.join(web, 'env-config.local.js'),
  `/** สร้างอัตโนมัติจาก .env (scripts/gen-config-from-env.mjs) — อย่าแก้ไฟล์นี้โดยตรง */\n` +
    `window.IMS_ENV = ${JSON.stringify(appEnv, null, 2)};\n` +
    `window.IMS_BACKEND = window.IMS_ENV.IMS_BACKEND;\n`
);

console.log('[config] ✓ สร้าง apps/web/firebase-config.local.js + apps/web/env-config.local.js จาก .env แล้ว');
console.log('[config]   backend =', appEnv.IMS_BACKEND, '| prefix =', appEnv.SQL_TABLE_PREFIX, '| admin =', appEnv.ADMIN_USERNAME);
