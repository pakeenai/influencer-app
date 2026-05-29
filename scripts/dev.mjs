/**
 * Local dev: optional Firestore emulator (needs Java) + static server for apps/web.
 */
import { spawn, spawnSync } from 'child_process';
import { createConnection } from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BREW_JAVA_BIN = '/opt/homebrew/opt/openjdk@21/bin/java';

function javaEnv_() {
  if (fs.existsSync(BREW_JAVA_BIN)) {
    return {
      ...process.env,
      PATH: `/opt/homebrew/opt/openjdk@21/bin:${process.env.PATH || ''}`,
      JAVA_HOME: '/opt/homebrew/opt/openjdk@21'
    };
  }
  return process.env;
}

function hasJava() {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8', env: javaEnv_() });
  return r.status === 0;
}

function waitForPort(port, timeoutMs = 120000) {
  const host = '127.0.0.1';
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    function tryConn() {
      const c = createConnection({ port, host }, () => {
        c.destroy();
        resolve();
      });
      c.on('error', () => {
        c.destroy();
        if (Date.now() - t0 > timeoutMs) {
          reject(new Error(`รอ ${host}:${port} ไม่สำเร็จภายใน ${timeoutMs / 1000} วินาที`));
        } else {
          setTimeout(tryConn, 400);
        }
      });
    }
    tryConn();
  });
}

const children = [];
function killAll() {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGINT', () => {
  killAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  killAll();
  process.exit(0);
});

async function main() {
  const java = hasJava();
  if (!java) {
    console.warn(
      '\n[IMS] ไม่พบ Java — ข้าม Firestore emulator\n' +
        '    ติดตั้ง JDK แล้วรัน `npm run dev` อีกครั้งถ้าต้องการ emulator\n' +
        '    (เว็บยังรันได้; ตั้ง firebase-config.local.js แล้วเปิด ?prod=1)\n'
    );
  } else {
    console.log('[IMS] เริ่ม Firestore emulator (ต้องใช้ Java)…');
    const emu = spawn('node', [path.join(__dirname, 'firebase-emu.mjs')], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: javaEnv_()
    });
    children.push(emu);
    emu.on('exit', (code, sig) => {
      if (code && code !== 0 && sig !== 'SIGTERM') {
        console.error('[IMS] emulator จบด้วย code', code);
      }
    });
    await waitForPort(8080);
    console.log('[IMS] Firestore emulator พร้อมที่ 127.0.0.1:8080');
  }

  console.log('[IMS] เริ่มเว็บเซิร์ฟ…');
  const web = spawn('python3', [path.join(root, 'scripts', 'serve_apps_web.py')], {
    cwd: root,
    stdio: 'inherit'
  });
  children.push(web);
  web.on('exit', (code) => {
    killAll();
    process.exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error('[IMS]', e.message || e);
  killAll();
  process.exit(1);
});
