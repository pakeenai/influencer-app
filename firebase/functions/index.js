const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

admin.initializeApp();

function assertNonEmptyString(name, v) {
  if (typeof v !== 'string' || !v.trim()) throw new HttpsError('invalid-argument', `${name} is required`);
  return v.trim();
}

async function getDocOrNull(path) {
  const snap = await admin.firestore().doc(path).get();
  return snap.exists ? snap : null;
}

// ---- Creator PIN login ----
exports.loginCreatorByPin = onCall({ region: 'us-central1' }, async (req) => {
  const pin = assertNonEmptyString('pin', req.data?.pin);

  // influencer_pins/{influencerId} : { pin: "1234" }  (แนะนำเก็บเป็น hash ใน production)
  const pinsSnap = await admin.firestore().collection('influencer_pins').get();
  let influencerId = null;
  pinsSnap.forEach((doc) => {
    const d = doc.data() || {};
    if (String(d.pin || '') === pin) influencerId = doc.id;
  });
  if (!influencerId) throw new HttpsError('permission-denied', 'Invalid PIN');

  // Ensure influencer exists
  const infDoc = await getDocOrNull(`influencers/${influencerId}`);
  if (!infDoc) throw new HttpsError('failed-precondition', 'Influencer not found');
  const infData = infDoc.data() || {};
  const deptId = String(infData.department_id || '');
  let can_access_products = false;
  if (deptId) {
    const deptDoc = await getDocOrNull(`departments/${deptId}`);
    const deptData = deptDoc ? (deptDoc.data() || {}) : {};
    can_access_products = (deptData.can_access_products === true || deptData.can_access_products === 'true');
  }

  const token = await admin.auth().createCustomToken(`creator:${influencerId}`, {
    role: 'creator',
    influencerId,
    deptId,
    can_access_products
  });

  return { token, influencerId };
});

// ---- Dept Head login ----
exports.loginDeptHead = onCall({ region: 'us-central1' }, async (req) => {
  const username = assertNonEmptyString('username', req.data?.username);
  const password = assertNonEmptyString('password', req.data?.password);

  const snap = await admin.firestore().collection('department_credentials').get();
  let deptId = null;
  snap.forEach((doc) => {
    const d = doc.data() || {};
    if (String(d.username || '') === username && String(d.password || '') === password) deptId = doc.id;
  });
  if (!deptId) throw new HttpsError('permission-denied', 'Invalid credentials');

  const token = await admin.auth().createCustomToken(`dept:${deptId}`, {
    role: 'department_admin',
    deptId
  });

  return { token, deptId };
});

// ---- Super Admin login ----
// admins/{username} : { password_hash: "..." } (bcrypt)
exports.loginSuperAdmin = onCall({ region: 'us-central1' }, async (req) => {
  const username = assertNonEmptyString('username', req.data?.username);
  const password = assertNonEmptyString('password', req.data?.password);

  const doc = await getDocOrNull(`admins/${username}`);
  if (!doc) throw new HttpsError('permission-denied', 'Invalid credentials');
  const data = doc.data() || {};
  const hash = String(data.password_hash || '');
  if (!hash) throw new HttpsError('failed-precondition', 'Admin not initialized');

  const ok = await bcrypt.compare(password, hash);
  if (!ok) throw new HttpsError('permission-denied', 'Invalid credentials');

  const token = await admin.auth().createCustomToken(`admin:${username}`, {
    role: 'super_admin'
  });
  return { token, username };
});

// ---- Backfill department_id for legacy data ----
// Super admin only. Fills:
// - projects.department_id (infer from assigned influencers if all same dept)
// - posts.department_id (infer from influencer.department_id)
exports.backfillDepartmentIds = onCall({ region: 'us-central1' }, async (req) => {
  const role = req.auth?.token?.role;
  if (role !== 'super_admin') throw new HttpsError('permission-denied', 'Super admin only');

  const db = admin.firestore();
  const dryRun = !!req.data?.dryRun;
  const limit = Math.min(parseInt(req.data?.limit || '200', 10) || 200, 500);

  const influencersSnap = await db.collection('influencers').get();
  const infDept = new Map();
  influencersSnap.forEach((doc) => {
    const d = doc.data() || {};
    infDept.set(doc.id, String(d.department_id || ''));
  });

  let projUpdated = 0;
  let postUpdated = 0;

  const projectsSnap = await db.collection('projects').limit(limit).get();
  for (const doc of projectsSnap.docs) {
    const d = doc.data() || {};
    const curDept = String(d.department_id || '');
    if (curDept) continue;
    const ids = Array.isArray(d.assigned_influencer_ids) ? d.assigned_influencer_ids.map(String) : [];
    const deps = ids.map((id) => infDept.get(id) || '').filter(Boolean);
    if (!deps.length) continue;
    const first = deps[0];
    if (!deps.every((x) => x === first)) continue;
    projUpdated++;
    if (!dryRun) await doc.ref.set({ department_id: first, updated_at: new Date().toISOString() }, { merge: true });
  }

  const postsSnap = await db.collection('posts').limit(limit).get();
  for (const doc of postsSnap.docs) {
    const d = doc.data() || {};
    const curDept = String(d.department_id || '');
    if (curDept) continue;
    const infId = String(d.influencer_id || '');
    if (!infId) continue;
    const dep = infDept.get(infId) || '';
    if (!dep) continue;
    postUpdated++;
    if (!dryRun) await doc.ref.set({ department_id: dep, updated_at: new Date().toISOString() }, { merge: true });
  }

  return { dryRun, limit, projUpdated, postUpdated };
});

