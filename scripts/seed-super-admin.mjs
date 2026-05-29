#!/usr/bin/env node
/**
 * สร้าง Super Admin ใน Firestore (หลัง deploy Functions แล้ว)
 * ต้อง login: gcloud auth application-default login
 *   หรือ export GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(new URL('../firebase/functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const projectId = process.env.FIREBASE_PROJECT || 'influencer-managements';
const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'admin123';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const hash = await bcrypt.hash(password, 10);
await admin.firestore().doc(`admins/${username}`).set({
  password_hash: hash,
  created_at: new Date().toISOString()
}, { merge: true });

console.log('OK: admins/' + username);
console.log('ล็อกอินที่เว็บด้วย username:', username, '| password:', password);
