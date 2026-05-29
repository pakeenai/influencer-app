#!/usr/bin/env node
/** สร้าง bcrypt hash สำหรับ Firestore admins/{username}.password_hash */
import { createRequire } from 'module';
const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('ใช้: node scripts/hash-admin-password.mjs <รหัสผ่าน>');
  process.exit(1);
}
const hash = await bcrypt.hash(password, 10);
console.log(hash);
