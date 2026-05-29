/**
 * คัดลอกไฟล์ที่ต้องเสิร์ฟไปยัง public/ ก่อน firebase deploy --only hosting
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const webRoot = path.join(root, 'apps', 'web');
const pub = path.join(root, 'public');

const webFiles = ['index.html', 'firebase-config.js'];

fs.mkdirSync(pub, { recursive: true });
for (const f of webFiles) {
  const from = path.join(webRoot, f);
  if (!fs.existsSync(from)) {
    console.error('Missing:', from);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(pub, f));
}

const localConfig = path.join(webRoot, 'firebase-config.local.js');
if (fs.existsSync(localConfig)) {
  fs.copyFileSync(localConfig, path.join(pub, 'firebase-config.local.js'));
  console.log('  ', 'firebase-config.local.js (production)', fs.statSync(localConfig).size, 'bytes');
}

const bundle = path.join(webRoot, 'vendor', 'firebase-compat.js');
if (!fs.existsSync(bundle)) {
  console.error('Missing apps/web/vendor/firebase-compat.js — run: npm install && npm run build:firebase');
  process.exit(1);
}
const pubVendor = path.join(pub, 'vendor');
fs.mkdirSync(pubVendor, { recursive: true });
fs.copyFileSync(bundle, path.join(pubVendor, 'firebase-compat.js'));

const assetsSrc = path.join(webRoot, 'assets');
if (fs.existsSync(assetsSrc)) {
  const assetsDst = path.join(pub, 'assets');
  fs.mkdirSync(assetsDst, { recursive: true });
  for (const e of fs.readdirSync(assetsSrc, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    fs.copyFileSync(path.join(assetsSrc, e.name), path.join(assetsDst, e.name));
  }
}

let bytes = 0;
function walk(d, prefix = '') {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const rel = path.join(prefix, e.name);
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full, rel);
    else {
      const s = fs.statSync(full).size;
      bytes += s;
      console.log('  ', rel, s, 'bytes');
    }
  }
}
console.log('Hosting bundle in public/:');
walk(pub);
const idx = path.join(pub, 'index.html');
console.log('OK:', bytes, 'bytes total — ready for firebase deploy --only hosting');
