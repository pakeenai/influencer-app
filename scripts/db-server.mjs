/**
 * Xstream Solution — backend server (Node + mysql2)
 * เสิร์ฟไฟล์ static (apps/web) + เป็นตัวกลางต่อ MySQL (DigitalOcean)
 * อ่านค่าทั้งหมดจาก .env  —  รัน: npm run db:server
 *
 * Endpoints:
 *   GET  /api/health
 *   POST /api/login      { kind:'super'|'dept'|'pin', username, password, pin }
 *   GET  /api/snapshot   (header x-ims-token) -> ข้อมูลตามสิทธิ์
 *   POST /api/action     (header x-ims-token) { action, data }
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'apps', 'web');

// ---------- .env ----------
function loadEnv() {
  const env = {};
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const i = s.indexOf('=');
      if (i < 0) continue;
      let v = s.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[s.slice(0, i).trim()] = v;
    }
  }
  return { ...env, ...process.env };
}
const ENV = loadEnv();
const PREFIX = ENV.SQL_TABLE_PREFIX || 'xstream2_';
const PORT = parseInt(ENV.PORT || '8091', 10);

// ---------- TikTok Login Kit (OAuth 2.0) ----------
const TIKTOK = {
  clientKey: ENV.TIKTOK_CLIENT_KEY || '',
  clientSecret: ENV.TIKTOK_CLIENT_SECRET || '',
  redirectUri: ENV.TIKTOK_REDIRECT_URI || '',
  scopes: ENV.TIKTOK_SCOPES || 'user.info.basic,user.info.profile,user.info.stats,video.list',
};
const tiktokConfigured = () => !!(TIKTOK.clientKey && TIKTOK.clientSecret && TIKTOK.redirectUri);

// ---------- schema ----------
const TABLES = ['admins', 'influencers', 'influencer_pins', 'departments', 'department_credentials', 'projects', 'posts', 'registration_campaigns', 'registration_submissions'];
const PK = {
  admins: 'username', influencers: 'id', influencer_pins: 'influencer_id', departments: 'id',
  department_credentials: 'department_id', projects: 'id', posts: 'id',
  registration_campaigns: 'id', registration_submissions: 'id'
};
const COLS = {
  admins: ['username', 'password', 'role', 'created_at'],
  influencers: ['id', 'name', 'phone', 'line', 'email', 'national_id', 'rating', 'avatar_url', 'url_tiktok', 'url_shopee', 'url_facebook', 'url_instagram', 'url_lemon9', 'department_id', 'platforms', 'notes', 'created_at', 'updated_at'],
  influencer_pins: ['influencer_id', 'pin', 'created_at', 'updated_at'],
  departments: ['id', 'name', 'head', 'description', 'member_ids', 'created_at', 'updated_at'],
  department_credentials: ['department_id', 'username', 'password', 'created_at', 'updated_at'],
  projects: ['id', 'name', 'brand', 'budget', 'start_date', 'end_date', 'department_id', 'clip_count', 'deadline', 'quality', 'assigned_influencers', 'assigned_influencer_ids', 'created_at', 'updated_at'],
  posts: ['id', 'influencer_id', 'project_id', 'platform', 'link', 'work_name', 'category', 'sold_date', 'sold_amount', 'commission_amount', 'status', 'rejection_reason', 'created_at', 'updated_at', 'department_id'],
  registration_campaigns: ['id', 'title', 'description', 'image_url', 'linked_project_ids', 'active', 'created_at', 'updated_at'],
  registration_submissions: ['id', 'campaign_id', 'influencer_id', 'name', 'phone', 'line', 'status', 'created_at', 'reviewed_at', 'review_note']
};
const JSON_COLS = {
  influencers: ['platforms'], departments: ['member_ids'],
  projects: ['assigned_influencers', 'assigned_influencer_ids'], registration_campaigns: ['linked_project_ids']
};
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ${PREFIX}admins (username VARCHAR(64) PRIMARY KEY, password VARCHAR(255), role VARCHAR(32), created_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}influencers (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), phone VARCHAR(64), line VARCHAR(128), email VARCHAR(255), national_id VARCHAR(32), rating INT DEFAULT 0, avatar_url LONGTEXT, url_tiktok VARCHAR(512), url_shopee VARCHAR(512), url_facebook VARCHAR(512), url_instagram VARCHAR(512), url_lemon9 VARCHAR(512), department_id VARCHAR(64), platforms JSON, notes TEXT, created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}influencer_pins (influencer_id VARCHAR(64) PRIMARY KEY, pin VARCHAR(16), created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}departments (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), head VARCHAR(255), description TEXT, member_ids JSON, created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}department_credentials (department_id VARCHAR(64) PRIMARY KEY, username VARCHAR(64), password VARCHAR(255), created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}projects (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), brand VARCHAR(255), budget VARCHAR(64), start_date VARCHAR(40), end_date VARCHAR(40), department_id VARCHAR(64), clip_count VARCHAR(32), deadline VARCHAR(64), quality VARCHAR(64), assigned_influencers JSON, assigned_influencer_ids JSON, created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}posts (id VARCHAR(64) PRIMARY KEY, influencer_id VARCHAR(64), project_id VARCHAR(64), platform VARCHAR(32), link TEXT, work_name VARCHAR(255), category VARCHAR(128), sold_date VARCHAR(40), sold_amount VARCHAR(64), commission_amount VARCHAR(64), status VARCHAR(32), rejection_reason TEXT, created_at VARCHAR(40), updated_at VARCHAR(40), department_id VARCHAR(64)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}registration_campaigns (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255), description TEXT, image_url TEXT, linked_project_ids JSON, active TINYINT(1), created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ${PREFIX}registration_submissions (id VARCHAR(64) PRIMARY KEY, campaign_id VARCHAR(64), influencer_id VARCHAR(64), name VARCHAR(255), phone VARCHAR(64), line VARCHAR(128), status VARCHAR(32), created_at VARCHAR(40), reviewed_at VARCHAR(40), review_note TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// ---------- pool ----------
const pool = mysql.createPool({
  host: ENV.DB_HOST, port: parseInt(ENV.DB_PORT || '3306', 10),
  user: ENV.DB_USER, password: ENV.DB_PASSWORD, database: ENV.DB_NAME,
  ssl: String(ENV.DB_SSL) === 'true' ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4_general_ci'
});

const tbl = (t) => `${PREFIX}${t}`;
const nowIso = () => new Date().toISOString();

function rowFromDb(table, r) {
  if (!r) return null;
  const o = { ...r };
  (JSON_COLS[table] || []).forEach((c) => {
    if (typeof o[c] === 'string') { try { o[c] = JSON.parse(o[c]); } catch { o[c] = []; } }
    else if (o[c] == null) o[c] = [];
  });
  if (table === 'registration_campaigns') o.active = !!Number(o.active);
  return o;
}
function valForDb(table, col, val) {
  if ((JSON_COLS[table] || []).includes(col)) return JSON.stringify(Array.isArray(val) ? val : (val || []));
  if (table === 'registration_campaigns' && col === 'active') return (val === false || val === 0 || val === '0') ? 0 : 1;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

async function getAll(table) {
  const [rows] = await pool.query(`SELECT * FROM \`${tbl(table)}\``);
  return rows.map((r) => rowFromDb(table, r));
}
async function getAllWhere(table, col, val) {
  const [rows] = await pool.query(`SELECT * FROM \`${tbl(table)}\` WHERE \`${col}\` = ?`, [val]);
  return rows.map((r) => rowFromDb(table, r));
}
async function getById(table, id) {
  const [rows] = await pool.query(`SELECT * FROM \`${tbl(table)}\` WHERE \`${PK[table]}\` = ? LIMIT 1`, [id]);
  return rows.length ? rowFromDb(table, rows[0]) : null;
}
async function upsert(table, row) {
  const cols = COLS[table];
  const vals = cols.map((c) => valForDb(table, c, row[c]));
  const ph = cols.map(() => '?').join(', ');
  const upd = cols.filter((c) => c !== PK[table]).map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(', ');
  await pool.query(`INSERT INTO \`${tbl(table)}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${ph}) ON DUPLICATE KEY UPDATE ${upd}`, vals);
  return row;
}
async function delById(table, id) {
  await pool.query(`DELETE FROM \`${tbl(table)}\` WHERE \`${PK[table]}\` = ?`, [id]);
}

async function ensureColumn(table, col, definition) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tbl(table), col]
  );
  if (!rows[0] || !Number(rows[0].c)) {
    await pool.query(`ALTER TABLE \`${tbl(table)}\` ADD COLUMN \`${col}\` ${definition}`);
    console.log(`[db] migrate: added ${tbl(table)}.${col}`);
  }
}
async function ensureSchema() {
  for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  // TikTok Login Kit: แมป open_id ของ TikTok -> influencer + เก็บ token (auth ภายใน, ไม่อยู่ใน snapshot)
  await pool.query(`CREATE TABLE IF NOT EXISTS \`${tbl('influencer_tiktok')}\` (open_id VARCHAR(128) PRIMARY KEY, influencer_id VARCHAR(64), union_id VARCHAR(128), scope VARCHAR(255), access_token TEXT, refresh_token TEXT, expires_at VARCHAR(40), created_at VARCHAR(40), updated_at VARCHAR(40)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // migrations: เพิ่มคอลัมน์ที่อาจยังไม่มีใน DB เดิม
  await ensureColumn('influencers', 'rating', "INT DEFAULT 0 AFTER `national_id`");
  await ensureColumn('influencers', 'avatar_url', "LONGTEXT AFTER `rating`");
  // seed admin จาก .env (ไม่เขียนทับถ้ามีอยู่แล้ว)
  const u = ENV.ADMIN_USERNAME || 'admin';
  const existing = await getById('admins', u);
  if (!existing) {
    await upsert('admins', { username: u, password: ENV.ADMIN_PASSWORD || 'admin', role: 'super_admin', created_at: nowIso() });
    console.log('[db] seed admin:', u);
  }
}

// ---------- auth tokens (in-memory) ----------
const SESSIONS = new Map(); // token -> ctx
const newToken = () => crypto.randomUUID().replace(/-/g, '');

async function handleLogin(body) {
  const kind = String(body.kind || '');
  if (kind === 'super') {
    const a = await getById('admins', String(body.username || ''));
    if (!a || a.password !== String(body.password || '')) return { status: 401, json: { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } };
    const token = newToken();
    const ctx = { role: 'admin', adminRole: a.role || 'super_admin', username: a.username };
    SESSIONS.set(token, ctx);
    return { status: 200, json: { success: true, token, role: 'admin', adminRole: ctx.adminRole, username: a.username } };
  }
  if (kind === 'dept') {
    const all = await getAll('department_credentials');
    const c = all.find((x) => x.username === String(body.username || '') && x.password === String(body.password || ''));
    if (!c) return { status: 401, json: { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } };
    const dept = await getById('departments', c.department_id);
    const token = newToken();
    const ctx = { role: 'admin', adminRole: 'department_admin', deptId: c.department_id, deptName: (dept && dept.name) || '', username: c.username };
    SESSIONS.set(token, ctx);
    return { status: 200, json: { success: true, token, role: 'admin', adminRole: 'department_admin', deptId: c.department_id, deptName: ctx.deptName, username: c.username } };
  }
  if (kind === 'pin') {
    const all = await getAll('influencer_pins');
    const rec = all.find((x) => String(x.pin) === String(body.pin || ''));
    const inf = rec ? await getById('influencers', rec.influencer_id) : null;
    if (!rec || !inf) return { status: 401, json: { success: false, error: 'PIN ไม่ถูกต้อง' } };
    const token = newToken();
    const ctx = { role: 'creator', influencerId: inf.id, deptId: inf.department_id || null };
    SESSIONS.set(token, ctx);
    return { status: 200, json: { success: true, token, role: 'creator', influencer: inf } };
  }
  return { status: 400, json: { success: false, error: 'Unknown login kind' } };
}

// ---------- TikTok Login Kit: แลก code -> token -> user info -> login creator ----------
async function tiktokGetMapping(openId) {
  const [rows] = await pool.query(`SELECT * FROM \`${tbl('influencer_tiktok')}\` WHERE open_id = ? LIMIT 1`, [openId]);
  return rows.length ? rows[0] : null;
}
async function tiktokUpsertMapping(row) {
  await pool.query(
    `INSERT INTO \`${tbl('influencer_tiktok')}\` (open_id, influencer_id, union_id, scope, access_token, refresh_token, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE influencer_id=VALUES(influencer_id), union_id=VALUES(union_id), scope=VALUES(scope), access_token=VALUES(access_token), refresh_token=VALUES(refresh_token), expires_at=VALUES(expires_at), updated_at=VALUES(updated_at)`,
    [row.open_id, row.influencer_id, row.union_id || '', row.scope || '', row.access_token || '', row.refresh_token || '', row.expires_at || '', row.created_at, row.updated_at]
  );
}

async function handleTikTokExchange(body) {
  if (!tiktokConfigured()) {
    return { status: 500, json: { success: false, error: 'TikTok Login ยังไม่ได้ตั้งค่า — กำหนด TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REDIRECT_URI ใน .env' } };
  }
  const code = String(body.code || '');
  if (!code) return { status: 400, json: { success: false, error: 'Missing code' } };
  const redirectUri = String(body.redirect_uri || TIKTOK.redirectUri);
  const codeVerifier = String(body.code_verifier || '');

  // 3.2 — แลก code เป็น access_token (client_secret อยู่ฝั่ง server เท่านั้น)
  let token;
  try {
    const form = {
      client_key: TIKTOK.clientKey,
      client_secret: TIKTOK.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    if (codeVerifier) form.code_verifier = codeVerifier; // PKCE (TikTok บังคับสำหรับ web app)
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    token = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !token || !token.access_token) {
      return { status: 401, json: { success: false, error: token.error_description || token.error || 'แลก token จาก TikTok ไม่สำเร็จ' } };
    }
  } catch (e) {
    return { status: 502, json: { success: false, error: 'ติดต่อ TikTok ไม่สำเร็จ: ' + (e.message || String(e)) } };
  }

  const accessToken = token.access_token;
  let openId = token.open_id || '';

  // 4.1 — ดึงโปรไฟล์ผู้ใช้ที่เพิ่งล็อกอิน
  const fields = 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count';
  let user = {};
  try {
    const infoRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=' + encodeURIComponent(fields), {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const info = await infoRes.json().catch(() => ({}));
    user = (info && info.data && info.data.user) || {};
  } catch { /* ดึงโปรไฟล์ไม่ได้ก็ยังล็อกอินได้ด้วย open_id */ }
  openId = user.open_id || openId;
  if (!openId) return { status: 502, json: { success: false, error: 'TikTok ไม่ส่ง open_id กลับมา' } };

  const now = nowIso();
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : '';

  // หา influencer ที่ผูกกับ open_id นี้ — ถ้าไม่มี ให้สร้างใหม่ (สมัครครั้งแรกผ่าน TikTok)
  const mapping = await tiktokGetMapping(openId);
  let influencer = mapping && mapping.influencer_id ? await getById('influencers', mapping.influencer_id) : null;
  if (!influencer) {
    const id = 'inf_tt_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    influencer = {
      id, name: user.display_name || 'TikTok Creator', phone: '', line: '', email: '', national_id: '',
      rating: 0, avatar_url: user.avatar_url || '', url_tiktok: user.profile_deep_link || '',
      url_shopee: '', url_facebook: '', url_instagram: '', url_lemon9: '',
      department_id: '', platforms: ['tiktok'], notes: 'สมัครผ่าน TikTok Login', created_at: now, updated_at: now,
    };
    await upsert('influencers', influencer);
  }

  await tiktokUpsertMapping({
    open_id: openId, influencer_id: influencer.id, union_id: user.union_id || '',
    scope: token.scope || '', access_token: accessToken, refresh_token: token.refresh_token || '',
    expires_at: expiresAt, created_at: (mapping && mapping.created_at) || now, updated_at: now,
  });

  const tkn = newToken();
  SESSIONS.set(tkn, { role: 'creator', influencerId: influencer.id, deptId: influencer.department_id || null });
  return { status: 200, json: { success: true, token: tkn, role: 'creator', influencer } };
}

// 3.3 — refresh access token เมื่อหมดอายุ
async function tiktokRefreshToken(mapping) {
  if (!mapping || !mapping.refresh_token) return null;
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK.clientKey, client_secret: TIKTOK.clientSecret,
        grant_type: 'refresh_token', refresh_token: mapping.refresh_token,
      }).toString(),
    });
    const t = await res.json().catch(() => ({}));
    if (!res.ok || !t.access_token) return null;
    const now = nowIso();
    const expiresAt = t.expires_in ? new Date(Date.now() + Number(t.expires_in) * 1000).toISOString() : '';
    const updated = {
      open_id: mapping.open_id, influencer_id: mapping.influencer_id, union_id: mapping.union_id || '',
      scope: t.scope || mapping.scope || '', access_token: t.access_token,
      refresh_token: t.refresh_token || mapping.refresh_token, expires_at: expiresAt,
      created_at: mapping.created_at || now, updated_at: now,
    };
    await tiktokUpsertMapping(updated);
    return updated;
  } catch { return null; }
}

// ดึง mapping + access token ที่ใช้ได้ (refresh ให้อัตโนมัติถ้าใกล้หมดอายุ)
async function tiktokTokenForInfluencer(influencerId) {
  const [rows] = await pool.query(`SELECT * FROM \`${tbl('influencer_tiktok')}\` WHERE influencer_id = ? LIMIT 1`, [influencerId]);
  let m = rows.length ? rows[0] : null;
  if (!m) return null;
  if (m.expires_at) {
    const exp = Date.parse(m.expires_at);
    if (!isNaN(exp) && exp - Date.now() < 60000) {
      const refreshed = await tiktokRefreshToken(m);
      if (refreshed) m = refreshed;
    }
  }
  return m;
}

// TikTok API ตอบ { data: {...}, error: { code:'ok', message:'' } } — code != 'ok' = error
function tiktokApiError_(j) {
  if (j && j.error && j.error.code && j.error.code !== 'ok') return j.error.message || j.error.code;
  return null;
}

// หา influencer เป้าหมาย: creator = ตัวเอง / admin = influencer_id ที่ส่งมา (ตามสิทธิ์)
async function resolveTikTokTarget_(ctx, influencerIdParam) {
  if (!ctx) return { error: 'unauthorized', status: 401 };
  if (ctx.role === 'creator' && ctx.influencerId) return { influencerId: ctx.influencerId };
  if (ctx.role === 'admin') {
    const id = String(influencerIdParam || '');
    if (!id) return { error: 'missing influencer_id', status: 400 };
    if (ctx.adminRole === 'super_admin') return { influencerId: id };
    if (ctx.adminRole === 'department_admin' && ctx.deptId) {
      const inf = await getById('influencers', id);
      if (inf && String(inf.department_id) === String(ctx.deptId)) return { influencerId: id };
      return { error: 'forbidden', status: 403 };
    }
  }
  return { error: 'unauthorized', status: 401 };
}

// 4.1 — Get User Info (โปรไฟล์ + สถิติ ของผู้ใช้ที่ล็อกอิน หรือ influencer ที่ admin เลือก)
async function handleTikTokMe(ctx, influencerIdParam) {
  const t = await resolveTikTokTarget_(ctx, influencerIdParam);
  if (t.error) return { status: t.status, json: { success: false, error: t.error } };
  const m = await tiktokTokenForInfluencer(t.influencerId);
  if (!m || !m.access_token) return { status: 200, json: { success: true, linked: false } };
  try {
    const fields = 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count';
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=' + encodeURIComponent(fields), { headers: { Authorization: 'Bearer ' + m.access_token } });
    const j = await res.json().catch(() => ({}));
    const err = tiktokApiError_(j);
    if (!res.ok || err) return { status: 200, json: { success: false, linked: true, error: err || 'ดึงข้อมูลโปรไฟล์ไม่สำเร็จ' } };
    return { status: 200, json: { success: true, linked: true, user: (j.data && j.data.user) || {} } };
  } catch (e) {
    return { status: 200, json: { success: false, linked: true, error: e.message || String(e) } };
  }
}

// 4.2 — List User's Videos (วิดีโอ + engagement)
async function handleTikTokVideos(ctx, influencerIdParam) {
  const t = await resolveTikTokTarget_(ctx, influencerIdParam);
  if (t.error) return { status: t.status, json: { success: false, error: t.error, videos: [] } };
  const m = await tiktokTokenForInfluencer(t.influencerId);
  if (!m || !m.access_token) return { status: 200, json: { success: true, linked: false, videos: [] } };
  try {
    const fields = 'id,title,video_description,duration,cover_image_url,share_url,embed_link,create_time,view_count,like_count,comment_count,share_count';
    const res = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=' + encodeURIComponent(fields), {
      method: 'POST', headers: { Authorization: 'Bearer ' + m.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 20 }),
    });
    const j = await res.json().catch(() => ({}));
    const err = tiktokApiError_(j);
    if (!res.ok || err) return { status: 200, json: { success: false, linked: true, error: err || 'ดึงวิดีโอไม่สำเร็จ', videos: [] } };
    return { status: 200, json: { success: true, linked: true, videos: (j.data && j.data.videos) || [], cursor: j.data && j.data.cursor, has_more: !!(j.data && j.data.has_more) } };
  } catch (e) {
    return { status: 200, json: { success: false, linked: true, error: e.message || String(e), videos: [] } };
  }
}

// 3.4 — Revoke Access (ตัดการเชื่อมต่อ TikTok / logout)
async function handleTikTokRevoke(ctx) {
  if (!ctx || ctx.role !== 'creator' || !ctx.influencerId) return { status: 401, json: { success: false, error: 'unauthorized' } };
  const [rows] = await pool.query(`SELECT * FROM \`${tbl('influencer_tiktok')}\` WHERE influencer_id = ? LIMIT 1`, [ctx.influencerId]);
  const m = rows.length ? rows[0] : null;
  if (m && m.access_token) {
    try {
      await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: TIKTOK.clientKey, client_secret: TIKTOK.clientSecret, token: m.access_token }).toString(),
      });
    } catch { /* ถึงยิง revoke ไม่ผ่านก็ล้าง token ฝั่งเราต่อ */ }
    // ล้าง token ฝั่งเรา แต่คง open_id->influencer_id ไว้ (ล็อกอินใหม่จะผูกกับ creator เดิม)
    await pool.query(`UPDATE \`${tbl('influencer_tiktok')}\` SET access_token='', refresh_token='', expires_at='', updated_at=? WHERE open_id=?`, [nowIso(), m.open_id]);
  }
  return { status: 200, json: { success: true } };
}

// ---------- snapshot (filtered) ----------
// influencer ที่ผูก TikTok (มี token) -> ใช้โชว์ปุ่ม dashboard ฝั่ง admin
async function tiktokLinkedSet_() {
  try {
    const [rows] = await pool.query(`SELECT influencer_id FROM \`${tbl('influencer_tiktok')}\` WHERE access_token <> ''`);
    return new Set(rows.map((r) => String(r.influencer_id)));
  } catch { return new Set(); }
}
async function buildSnapshot(ctx) {
  const pinsMap = (rows) => { const o = {}; rows.forEach((r) => { o[r.influencer_id] = { pin: String(r.pin || ''), created_at: r.created_at || '', updated_at: r.updated_at || '' }; }); return o; };
  const credMap = (rows) => { const o = {}; rows.forEach((r) => { o[r.department_id] = { username: String(r.username || ''), password: String(r.password || ''), created_at: r.created_at || '', updated_at: r.updated_at || '' }; }); return o; };
  const empty = { influencers: [], projects: [], posts: [], departments: [], influencerPINs: {}, departmentCredentials: {}, registrationCampaigns: [], registrationSubmissions: [] };

  if (!ctx) {
    const camps = await getAll('registration_campaigns');
    return { ...empty, registrationCampaigns: camps.filter((c) => c.active !== false) };
  }
  if (ctx.role === 'admin' && ctx.adminRole === 'super_admin') {
    const [influencers, projects, posts, departments, pins, creds, camps, subs, ttSet] = await Promise.all([
      getAll('influencers'), getAll('projects'), getAll('posts'), getAll('departments'),
      getAll('influencer_pins'), getAll('department_credentials'), getAll('registration_campaigns'), getAll('registration_submissions'), tiktokLinkedSet_()
    ]);
    influencers.forEach((i) => { i.tiktok_linked = ttSet.has(String(i.id)); });
    return { influencers, projects, posts, departments, influencerPINs: pinsMap(pins), departmentCredentials: credMap(creds), registrationCampaigns: camps, registrationSubmissions: subs };
  }
  if (ctx.role === 'admin' && ctx.adminRole === 'department_admin' && ctx.deptId) {
    const [infs, projects, posts, dept] = await Promise.all([
      getAllWhere('influencers', 'department_id', ctx.deptId),
      getAllWhere('projects', 'department_id', ctx.deptId),
      getAllWhere('posts', 'department_id', ctx.deptId),
      getById('departments', ctx.deptId)
    ]);
    const infIds = new Set(infs.map((i) => String(i.id)));
    const allPins = await getAll('influencer_pins');
    const cred = await getById('department_credentials', ctx.deptId);
    const ttSet = await tiktokLinkedSet_();
    infs.forEach((i) => { i.tiktok_linked = ttSet.has(String(i.id)); });
    return {
      influencers: infs, projects, posts, departments: dept ? [dept] : [],
      influencerPINs: pinsMap(allPins.filter((r) => infIds.has(String(r.influencer_id)))),
      departmentCredentials: cred ? credMap([{ ...cred, department_id: ctx.deptId }]) : {},
      registrationCampaigns: [], registrationSubmissions: []
    };
  }
  if (ctx.role === 'creator' && ctx.influencerId) {
    const [inf, posts, camps, subs, allProjects] = await Promise.all([
      getById('influencers', ctx.influencerId),
      getAllWhere('posts', 'influencer_id', ctx.influencerId),
      getAll('registration_campaigns'),
      getAllWhere('registration_submissions', 'influencer_id', ctx.influencerId),
      getAll('projects')
    ]);
    const projects = allProjects.filter((p) => (p.assigned_influencer_ids || []).map(String).includes(String(ctx.influencerId)));
    return { ...empty, influencers: inf ? [inf] : [], projects, posts, registrationCampaigns: camps.filter((c) => c.active !== false), registrationSubmissions: subs };
  }
  return empty;
}

// ---------- actions (port ของ firestoreGasAction_) ----------
async function dbAction(ctx, action, data = {}) {
  const d = { ...(data || {}) };
  delete d.action; delete d.callback;
  const now = nowIso();
  const isSuper = ctx && ctx.role === 'admin' && ctx.adminRole === 'super_admin';
  const isDept = ctx && ctx.role === 'admin' && ctx.adminRole === 'department_admin' && !!ctx.deptId;
  const dept = isDept ? String(ctx.deptId) : '';
  const projDeptId = async (pid) => { const p = await getById('projects', pid); return p && p.department_id ? p.department_id : ''; };
  const inferDept = async (assigned) => {
    const ids = (Array.isArray(assigned) ? assigned : []).map((a) => String(a && a.id || '')).filter(Boolean);
    const deps = [];
    for (const id of ids) { const inf = await getById('influencers', id); if (inf && inf.department_id) deps.push(String(inf.department_id)); }
    if (!deps.length) return '';
    return deps.every((x) => x === deps[0]) ? deps[0] : '';
  };

  switch (action) {
    case 'createInfluencer': {
      const id = d.id || ('inf_' + Date.now());
      const row = { id, name: d.name || '', phone: d.phone || '', line: d.line || '', email: d.email || '', national_id: d.national_id || '', rating: Math.max(0, Math.min(5, parseInt(d.rating, 10) || 0)), avatar_url: d.avatar_url || '', url_tiktok: d.url_tiktok || '', url_shopee: d.url_shopee || '', url_facebook: d.url_facebook || '', url_instagram: d.url_instagram || '', url_lemon9: d.url_lemon9 || '', department_id: isDept ? dept : (d.department_id || ''), platforms: Array.isArray(d.platforms) ? d.platforms : [], notes: d.notes || '', created_at: d.created_at || now, updated_at: d.updated_at || '' };
      await upsert('influencers', row); return { success: true, data: row };
    }
    case 'updateInfluencer': {
      if (!d.id) return { success: false, error: 'Missing id' };
      const prev = await getById('influencers', d.id);
      if (!prev) return { success: false, error: 'Not found' };
      const merged = { ...prev, ...d, department_id: isDept ? dept : (d.department_id ?? prev.department_id ?? ''), updated_at: now };
      if (d.rating !== undefined) merged.rating = Math.max(0, Math.min(5, parseInt(d.rating, 10) || 0));
      await upsert('influencers', merged); return { success: true, data: merged };
    }
    case 'deleteInfluencer': {
      if (!d.id) return { success: false, error: 'Missing id' };
      await delById('influencers', d.id); return { success: true };
    }
    case 'createProject': {
      const id = d.id || ('proj_' + Date.now());
      const assigned = Array.isArray(d.assigned_influencers) ? d.assigned_influencers : [];
      const inferred = (isSuper && !d.department_id) ? await inferDept(assigned) : '';
      const row = { id, name: d.name || '', brand: d.brand || '', budget: d.budget !== undefined && d.budget !== '' ? Number(d.budget) : '', start_date: d.start_date || '', end_date: d.end_date || '', department_id: isDept ? dept : (d.department_id || inferred || ''), clip_count: d.clip_count !== undefined ? d.clip_count : 0, deadline: d.deadline || '', quality: d.quality || '', assigned_influencers: assigned, assigned_influencer_ids: assigned.map((a) => a.id).filter(Boolean), created_at: d.created_at || now, updated_at: d.updated_at || '' };
      await upsert('projects', row); return { success: true, data: row };
    }
    case 'updateProject': {
      if (!d.id) return { success: false, error: 'Missing id' };
      const cur = await getById('projects', d.id);
      if (!cur) return { success: false, error: 'Not found' };
      const assigned = Array.isArray(d.assigned_influencers) ? d.assigned_influencers : (cur.assigned_influencers || []);
      const inferred = (isSuper && (d.department_id === undefined || d.department_id === null || d.department_id === '')) ? await inferDept(assigned) : '';
      const nextDept = isDept ? dept : (d.department_id ?? cur.department_id ?? inferred ?? '');
      const merged = { ...cur, ...d, department_id: nextDept, assigned_influencers: assigned, assigned_influencer_ids: assigned.map((a) => a.id).filter(Boolean), updated_at: now };
      await upsert('projects', merged); return { success: true, data: merged };
    }
    case 'deleteProject': {
      if (!d.id) return { success: false, error: 'Missing id' };
      await delById('projects', d.id); return { success: true };
    }
    case 'createPost': {
      const id = d.id || ('post_' + Date.now());
      const department_id = isDept ? dept : (d.department_id || await projDeptId(d.project_id) || '');
      const row = { id, influencer_id: d.influencer_id, project_id: d.project_id || '', platform: d.platform, link: d.link, work_name: d.work_name || '', category: d.category || '', sold_date: d.sold_date || '', sold_amount: d.sold_amount !== undefined && d.sold_amount !== '' ? Number(d.sold_amount) : '', commission_amount: d.commission_amount !== undefined && d.commission_amount !== '' ? Number(d.commission_amount) : '', status: d.status || 'pending', rejection_reason: d.rejection_reason || '', created_at: d.created_at || now, updated_at: d.updated_at || '', department_id };
      await upsert('posts', row); return { success: true, data: row };
    }
    case 'updatePost': {
      if (!d.id) return { success: false, error: 'Missing id' };
      const cur = await getById('posts', d.id);
      if (!cur) return { success: false, error: 'Not found' };
      const department_id = isDept ? dept : (d.department_id || cur.department_id || await projDeptId(d.project_id || cur.project_id) || '');
      const merged = { ...cur, ...d, department_id, updated_at: now };
      await upsert('posts', merged); return { success: true, data: merged };
    }
    case 'deletePost': {
      if (!d.id) return { success: false, error: 'Missing id' };
      await delById('posts', d.id); return { success: true };
    }
    case 'createDepartment': {
      const id = d.id || ('dept_' + Date.now());
      const row = { id, name: d.name || '', head: d.head || '', description: d.description || '', member_ids: Array.isArray(d.member_ids) ? d.member_ids : [], created_at: d.created_at || now, updated_at: d.updated_at || '' };
      await upsert('departments', row);
      if (isSuper) for (const infId of (row.member_ids || []).filter(Boolean).map(String)) { const inf = await getById('influencers', infId); if (inf) await upsert('influencers', { ...inf, department_id: id, updated_at: now }); }
      return { success: true, data: row };
    }
    case 'updateDepartment': {
      if (!d.id) return { success: false, error: 'Missing id' };
      const prev = await getById('departments', d.id);
      if (!prev) return { success: false, error: 'Not found' };
      const merged = { ...prev, ...d, updated_at: now };
      await upsert('departments', merged);
      if (isSuper) {
        const before = (Array.isArray(prev.member_ids) ? prev.member_ids : []).filter(Boolean).map(String);
        const after = (Array.isArray(merged.member_ids) ? merged.member_ids : []).filter(Boolean).map(String);
        const bs = new Set(before), as = new Set(after);
        for (const infId of after.filter((x) => !bs.has(x))) { const inf = await getById('influencers', infId); if (inf) await upsert('influencers', { ...inf, department_id: merged.id, updated_at: now }); }
        for (const infId of before.filter((x) => !as.has(x))) { const inf = await getById('influencers', infId); if (inf) await upsert('influencers', { ...inf, department_id: '', updated_at: now }); }
      }
      return { success: true, data: merged };
    }
    case 'deleteDepartment': {
      if (!d.id) return { success: false, error: 'Missing id' };
      await delById('departments', d.id); return { success: true };
    }
    case 'setInfluencerPIN': {
      if (!d.influencer_id || d.pin === undefined || d.pin === null) return { success: false, error: 'Missing pin' };
      const prev = await getById('influencer_pins', d.influencer_id);
      const row = { influencer_id: String(d.influencer_id), pin: String(d.pin), created_at: d.created_at || (prev ? prev.created_at : now), updated_at: d.updated_at || now };
      await upsert('influencer_pins', row); return { success: true, data: row };
    }
    case 'setDepartmentCredentials': {
      if (!d.department_id || !d.username || !d.password) return { success: false, error: 'Missing fields' };
      const prev = await getById('department_credentials', d.department_id);
      const row = { department_id: String(d.department_id), username: String(d.username), password: String(d.password), created_at: d.created_at || (prev ? prev.created_at : now), updated_at: d.updated_at || now };
      await upsert('department_credentials', row); return { success: true, data: row };
    }
    case 'createRegistrationCampaign': {
      if (!isSuper) return { success: false, error: 'Super admin only' };
      const id = d.id || ('regcamp_' + Date.now());
      const row = { id, title: String(d.title || '').trim(), description: String(d.description || '').trim(), image_url: String(d.image_url || ''), linked_project_ids: Array.isArray(d.linked_project_ids) ? d.linked_project_ids.map(String) : [], active: d.active !== false, created_at: d.created_at || now, updated_at: d.updated_at || '' };
      if (!row.title) return { success: false, error: 'กรุณาระบุชื่อการลงทะเบียน' };
      await upsert('registration_campaigns', row); return { success: true, data: row };
    }
    case 'updateRegistrationCampaign': {
      if (!isSuper) return { success: false, error: 'Super admin only' };
      if (!d.id) return { success: false, error: 'Missing id' };
      const cur = await getById('registration_campaigns', d.id);
      if (!cur) return { success: false, error: 'Not found' };
      const merged = { ...cur, ...d, title: String(d.title ?? cur.title ?? '').trim(), description: String(d.description ?? cur.description ?? '').trim(), image_url: d.image_url !== undefined ? String(d.image_url || '') : String(cur.image_url || ''), linked_project_ids: Array.isArray(d.linked_project_ids) ? d.linked_project_ids.map(String) : (cur.linked_project_ids || []), active: d.active !== undefined ? !!d.active : !!cur.active, updated_at: now };
      if (!merged.title) return { success: false, error: 'กรุณาระบุชื่อการลงทะเบียน' };
      await upsert('registration_campaigns', merged); return { success: true, data: merged };
    }
    case 'deleteRegistrationCampaign': {
      if (!isSuper) return { success: false, error: 'Super admin only' };
      if (!d.id) return { success: false, error: 'Missing id' };
      await delById('registration_campaigns', d.id);
      const subs = await getAllWhere('registration_submissions', 'campaign_id', d.id);
      for (const s of subs) await delById('registration_submissions', s.id);
      return { success: true };
    }
    case 'createRegistrationSubmission': {
      if (!ctx || ctx.role !== 'creator') return { success: false, error: 'Creator only' };
      const infId = String(d.influencer_id || ctx.influencerId || '');
      const campaignId = String(d.campaign_id || '');
      if (!infId || !campaignId) return { success: false, error: 'Missing fields' };
      const name = String(d.name || '').trim(), phone = String(d.phone || '').trim(), line = String(d.line || '').trim();
      if (!name) return { success: false, error: 'กรุณากรอกชื่อ' };
      const camp = await getById('registration_campaigns', campaignId);
      if (!camp || camp.active === false) return { success: false, error: 'การลงทะเบียนนี้ปิดรับแล้ว' };
      const subs = await getAllWhere('registration_submissions', 'campaign_id', campaignId);
      const dup = subs.find((s) => String(s.influencer_id) === infId);
      if (dup) { if (dup.status === 'pending') return { success: false, error: 'คุณส่งใบสมัครแล้ว รอแอดมินอนุมัติ' }; if (dup.status === 'approved') return { success: false, error: 'คุณได้รับการอนุมัติแล้ว' }; }
      const id = d.id || ('regsub_' + Date.now());
      const row = { id, campaign_id: campaignId, influencer_id: infId, name, phone, line, status: 'pending', created_at: d.created_at || now, reviewed_at: '', review_note: '' };
      await upsert('registration_submissions', row);
      const inf = await getById('influencers', infId);
      if (inf) await upsert('influencers', { ...inf, name, phone, line, updated_at: now });
      return { success: true, data: row };
    }
    case 'reviewRegistrationSubmission': {
      if (!isSuper) return { success: false, error: 'Super admin only' };
      const subId = String(d.id || ''), status = String(d.status || '');
      if (!subId || !['approved', 'rejected'].includes(status)) return { success: false, error: 'Invalid review' };
      const sub = await getById('registration_submissions', subId);
      if (!sub) return { success: false, error: 'Not found' };
      if (sub.status !== 'pending') return { success: false, error: 'ใบสมัครนี้ถูกพิจารณาแล้ว' };
      await upsert('registration_submissions', { ...sub, status, reviewed_at: now, review_note: String(d.review_note || '') });
      if (status === 'approved') {
        const camp = await getById('registration_campaigns', String(sub.campaign_id));
        const linked = camp ? (camp.linked_project_ids || []) : [];
        const clipDefault = Math.max(1, parseInt(d.clip_count, 10) || 1);
        for (const projectId of linked) {
          const cur = await getById('projects', String(projectId));
          if (!cur) continue;
          const assigned = Array.isArray(cur.assigned_influencers) ? [...cur.assigned_influencers] : [];
          if (!assigned.some((a) => String(a.id) === String(sub.influencer_id))) assigned.push({ id: String(sub.influencer_id), clip_count: clipDefault });
          await upsert('projects', { ...cur, assigned_influencers: assigned, assigned_influencer_ids: assigned.map((a) => a.id).filter(Boolean), updated_at: now });
        }
        const inf = await getById('influencers', String(sub.influencer_id));
        if (inf) await upsert('influencers', { ...inf, name: sub.name || '', phone: sub.phone || '', line: sub.line || '', updated_at: now });
      }
      return { success: true, data: { id: subId, status } };
    }
    case 'getInfluencers': return { success: true, data: await getAll('influencers') };
    case 'getProjects': return { success: true, data: await getAll('projects') };
    case 'getPosts': return { success: true, data: await getAll('posts') };
    case 'getDepartments': return { success: true, data: await getAll('departments') };
    default: return { success: false, error: 'Unknown action: ' + action };
  }
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
function sendJson(res, status, obj) { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) }); res.end(b); }
function readBody(req) { return new Promise((resolve) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 8e6) req.destroy(); }); req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } }); }); }
function ctxOf(req) { const t = req.headers['x-ims-token']; return (t && SESSIONS.get(String(t))) || null; }

function serveStatic(req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  const fp = path.normalize(path.join(WEB, url));
  if (!fp.startsWith(WEB)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  try {
    if (url === '/api/health') return sendJson(res, 200, { ok: true, db: ENV.DB_NAME, prefix: PREFIX });
    if (url === '/api/login' && req.method === 'POST') { const r = await handleLogin(await readBody(req)); return sendJson(res, r.status, r.json); }
    if (url === '/api/tiktok/config') return sendJson(res, 200, { success: true, configured: tiktokConfigured(), client_key: TIKTOK.clientKey, redirect_uri: TIKTOK.redirectUri, scope: TIKTOK.scopes });
    if (url === '/api/tiktok/exchange' && req.method === 'POST') { const r = await handleTikTokExchange(await readBody(req)); return sendJson(res, r.status, r.json); }
    if (url === '/api/tiktok/me') { const q = new URL(req.url, 'http://x').searchParams; const r = await handleTikTokMe(ctxOf(req), q.get('influencer_id')); return sendJson(res, r.status, r.json); }
    if (url === '/api/tiktok/videos') { const q = new URL(req.url, 'http://x').searchParams; const r = await handleTikTokVideos(ctxOf(req), q.get('influencer_id')); return sendJson(res, r.status, r.json); }
    if (url === '/api/tiktok/revoke' && req.method === 'POST') { const r = await handleTikTokRevoke(ctxOf(req)); return sendJson(res, r.status, r.json); }
    if (url === '/api/snapshot') { const ctx = ctxOf(req); const data = await buildSnapshot(ctx); return sendJson(res, 200, { success: true, data }); }
    if (url === '/api/action' && req.method === 'POST') {
      const ctx = ctxOf(req);
      const body = await readBody(req);
      if (!ctx) return sendJson(res, 401, { success: false, error: 'unauthorized' });
      const r = await dbAction(ctx, String(body.action || ''), body.data || {});
      return sendJson(res, 200, r);
    }
    if (url.startsWith('/api/')) return sendJson(res, 404, { success: false, error: 'not found' });
    return serveStatic(req, res);
  } catch (e) {
    console.error('[server]', url, e);
    if (url.startsWith('/api/')) return sendJson(res, 500, { success: false, error: e.message || String(e) });
    res.writeHead(500); res.end('error');
  }
});

ensureSchema()
  .then(() => server.listen(PORT, () => console.log(`[db] ✓ Xstream backend: http://127.0.0.1:${PORT}/  (DB: ${ENV.DB_NAME} @ ${ENV.DB_HOST})`)))
  .catch((e) => { console.error('[db] เริ่มเซิร์ฟเวอร์ไม่สำเร็จ:', e.message || e); process.exit(1); });
