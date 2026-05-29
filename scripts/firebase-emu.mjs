/**
 * Firestore emulator with open dev rules (firebase/firestore.rules.dev).
 * Production deploy ใช้ firestore.rules.secure ผ่าน firebase.json
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const rulesPath = path.join(root, 'firebase', 'firestore.rules');
const devRules = path.join(root, 'firebase', 'firestore.rules.dev');
const secureRules = path.join(root, 'firebase', 'firestore.rules.secure');
const backupPath = path.join(root, 'firebase', '.firestore.rules.emu-backup');

const javaBin = '/opt/homebrew/opt/openjdk@21/bin';
const env = {
  ...process.env,
  PATH: fs.existsSync(javaBin) ? `${javaBin}:${process.env.PATH || ''}` : process.env.PATH,
  JAVA_HOME: fs.existsSync('/opt/homebrew/opt/openjdk@21') ? '/opt/homebrew/opt/openjdk@21' : process.env.JAVA_HOME,
  FIREBASE_TOOLS_DISABLE_UPDATE_CHECK: '1',
  XDG_CONFIG_HOME: path.join(root, '.firebase-config')
};

function restoreRules() {
  try {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, rulesPath);
      fs.unlinkSync(backupPath);
    } else if (fs.existsSync(secureRules)) {
      fs.copyFileSync(secureRules, rulesPath);
    }
  } catch (e) {
    console.warn('[IMS] restore rules:', e.message);
  }
}

if (!fs.existsSync(devRules)) {
  console.error('Missing', devRules);
  process.exit(1);
}

if (fs.existsSync(rulesPath)) {
  fs.copyFileSync(rulesPath, backupPath);
}
fs.copyFileSync(devRules, rulesPath);

process.on('SIGINT', () => {
  restoreRules();
  process.exit(0);
});
process.on('SIGTERM', () => {
  restoreRules();
  process.exit(0);
});

const child = spawn(
  'npx',
  ['firebase-tools', 'emulators:start', '--only', 'firestore'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env }
);

child.on('exit', (code) => {
  restoreRules();
  process.exit(code ?? 0);
});
