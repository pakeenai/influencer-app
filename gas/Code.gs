/**
 * Influencer Management System — Google Apps Script backend (JSONP)
 *
 * 1) สร้างโปรเจกต์ Apps Script → วางโค้ดนี้ใน Code.gs
 * 2) Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone (หรือ Anyone with Google account ตามต้องการ)
 * 3) แชร์ Google Sheet ให้บัญชีที่รันสคริปต์เป็น Editor
 *
 * Spreadsheet ปลายทาง (ล็อกค่าเริ่มต้น — แก้ได้ที่ IMS_SPREADSHEET_ID หรือ Script property SPREADSHEET_ID)
 */
var IMS_SPREADSHEET_ID = '1kt1YJJd7xINcm8tTftHamNCRNGIPN16ui0mTdKXsL7g';

var SHEET_NAMES = {
  influencers: 'influencers',
  projects: 'projects',
  posts: 'posts',
  departments: 'departments',
  influencer_pins: 'influencer_pins',
  department_credentials: 'department_credentials'
};

/** ลำดับคอลัมน์คงที่ — ลดบั๊ก parse หลายรูปแบบ */
var ENTITY_HEADERS = {
  influencers: ['id', 'created_at', 'updated_at', 'name', 'phone', 'line', 'department_id', 'platforms', 'notes', 'email', 'national_id', 'url_tiktok', 'url_shopee', 'url_facebook', 'url_instagram', 'url_lemon9'],
  projects: ['id', 'created_at', 'updated_at', 'name', 'brand', 'budget', 'start_date', 'end_date', 'department_id', 'clip_count', 'deadline', 'quality', 'assigned_influencers'],
  posts: ['id', 'created_at', 'updated_at', 'influencer_id', 'project_id', 'platform', 'link', 'status', 'rejection_reason'],
  departments: ['id', 'created_at', 'updated_at', 'name', 'head', 'description', 'member_ids'],
  influencer_pins: ['influencer_id', 'pin', 'created_at', 'updated_at'],
  department_credentials: ['department_id', 'username', 'password', 'created_at', 'updated_at']
};

function doGet(e) {
  var p = normalizeParams_(e);
  var callback = p.callback || 'cb';
  var action = String(p.action || '');
  var result;
  try {
    result = route_(action, p);
  } catch (err) {
    result = { success: false, error: String(err && err.message ? err.message : err) };
  }
  var out = callback + '(' + JSON.stringify(result) + ');';
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function normalizeParams_(e) {
  var raw = (e && e.parameter) ? e.parameter : {};
  var out = {};
  for (var k in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
    var v = raw[k];
    if (typeof v === 'string' && v.length > 0 && (v.charAt(0) === '{' || v.charAt(0) === '[')) {
      try {
        v = JSON.parse(v);
      } catch (x) { /* keep string */ }
    }
    out[k] = v;
  }
  return out;
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID') || IMS_SPREADSHEET_ID;
  return SpreadsheetApp.openById(id);
}

function getOrCreateSheet_(entityKey) {
  var name = SHEET_NAMES[entityKey];
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  var headers = ENTITY_HEADERS[entityKey];
  var hc = headers.length;
  if (sh.getLastRow() === 0) {
    safeSetSingleRow_(sh, 1, hc, headers);
  } else {
    var lastCol = Math.max(sh.getLastColumn(), hc, 1);
    var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var first = String(existing[0] || '');
    if (first !== headers[0]) {
      safeSetSingleRow_(sh, 1, hc, headers);
    }
  }
  return sh;
}

function genId_(prefix) {
  return prefix + new Date().getTime();
}

/**
 * เขียน 1 แถวลงชีทอย่างปลอดภัย — แก้ error "ข้อมูลมี 1 แถว แต่ช่วงมี 2 แถว"
 * มักเกิดเมื่อเซลล์ในแถวนั้นถูก merge แนวตั้ง / merge หัวตารางทับหลายแถว
 */
function safeSetSingleRow_(sh, rowIndex, numCols, cells1D) {
  var row = [];
  for (var c = 0; c < numCols; c++) {
    row.push(c < cells1D.length ? cells1D[c] : '');
  }
  var rng = sh.getRange(rowIndex, 1, rowIndex, numCols);
  try {
    rng.breakApart();
  } catch (e) { /* บางโหมด/เวอร์ชันไม่รองรับ — ข้ามได้ */ }
  rng.setValues([row]);
}

function rowToObject_(entityKey, row) {
  var headers = ENTITY_HEADERS[entityKey];
  var o = {};
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    var v = row[i];
    if (key === 'platforms' || key === 'assigned_influencers' || key === 'member_ids') {
      if (typeof v === 'string' && v) {
        try {
          o[key] = JSON.parse(v);
        } catch (e) {
          o[key] = v;
        }
      } else {
        o[key] = v || (key === 'platforms' || key === 'assigned_influencers' || key === 'member_ids' ? [] : v);
      }
    } else if (key === 'budget' || key === 'clip_count') {
      if (v === '' || v === null || v === undefined) o[key] = '';
      else {
        var n = Number(v);
        o[key] = isNaN(n) ? v : n;
      }
    } else if (key === 'phone') {
      o[key] = v === '' || v === null ? '' : v;
    } else {
      o[key] = v === undefined ? '' : v;
    }
  }
  return o;
}

function objectToRow_(entityKey, obj) {
  var headers = ENTITY_HEADERS[entityKey];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var key = headers[i];
    var v = obj[key];
    if (key === 'platforms' || key === 'assigned_influencers' || key === 'member_ids') {
      row.push(v === undefined || v === null ? '' : JSON.stringify(v));
    } else {
      row.push(v === undefined || v === null ? '' : v);
    }
  }
  return row;
}

function findRowById_(sh, idColIndex1, idValue) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var col = sh.getRange(2, idColIndex1, last, idColIndex1).getValues();
  for (var r = 0; r < col.length; r++) {
    if (String(col[r][0]) === String(idValue)) return r + 2;
  }
  return -1;
}

function listEntity_(entityKey) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_(entityKey);
    var headers = ENTITY_HEADERS[entityKey];
    var last = sh.getLastRow();
    if (last < 2) return { success: true, data: [] };
    var values = sh.getRange(2, 1, last, headers.length).getValues();
    var list = [];
    for (var i = 0; i < values.length; i++) {
      if (!values[i][0]) continue;
      list.push(rowToObject_(entityKey, values[i]));
    }
    return { success: true, data: list };
  } finally {
    lock.releaseLock();
  }
}

function createEntity_(entityKey, p, idPrefix) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_(entityKey);
    var headers = ENTITY_HEADERS[entityKey];
    var now = new Date().toISOString();
    var id = p.id ? String(p.id) : genId_(idPrefix);
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (h === 'id') obj.id = id;
      else if (h === 'created_at') obj.created_at = p.created_at || now;
      else if (h === 'updated_at') obj.updated_at = p.updated_at || '';
      else if (Object.prototype.hasOwnProperty.call(p, h)) obj[h] = p[h];
      else obj[h] = defaultField_(entityKey, h);
    }
    sh.appendRow(objectToRow_(entityKey, obj));
    return { success: true, data: obj };
  } finally {
    lock.releaseLock();
  }
}

function defaultField_(entityKey, h) {
  if (h === 'platforms' || h === 'assigned_influencers' || h === 'member_ids') return [];
  return '';
}

function updateEntity_(entityKey, p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_(entityKey);
    var headers = ENTITY_HEADERS[entityKey];
    var id = p.id;
    if (!id) return { success: false, error: 'Missing id' };
    var idCol = 1;
    var rowIndex = findRowById_(sh, idCol, id);
    if (rowIndex < 0) return { success: false, error: 'Not found' };
    var existing = rowToObject_(entityKey, sh.getRange(rowIndex, 1, rowIndex, headers.length).getValues()[0]);
    var now = new Date().toISOString();
    var merged = {};
    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (h === 'id') merged.id = existing.id;
      else if (h === 'created_at') merged.created_at = existing.created_at;
      else if (h === 'updated_at') merged.updated_at = now;
      else if (Object.prototype.hasOwnProperty.call(p, h)) merged[h] = p[h];
      else merged[h] = existing[h];
    }
    safeSetSingleRow_(sh, rowIndex, headers.length, objectToRow_(entityKey, merged));
    return { success: true, data: merged };
  } finally {
    lock.releaseLock();
  }
}

function deleteEntity_(entityKey, id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_(entityKey);
    var rowIndex = findRowById_(sh, 1, id);
    if (rowIndex < 0) return { success: false, error: 'Not found' };
    sh.deleteRow(rowIndex);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function getInfluencerPINs_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_('influencer_pins');
    var headers = ENTITY_HEADERS.influencer_pins;
    var last = sh.getLastRow();
    var out = {};
    if (last < 2) return { success: true, data: out };
    var values = sh.getRange(2, 1, last, headers.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var infId = values[i][0];
      if (!infId) continue;
      out[String(infId)] = {
        pin: String(values[i][1] || ''),
        created_at: values[i][2] || '',
        updated_at: values[i][3] || ''
      };
    }
    return { success: true, data: out };
  } finally {
    lock.releaseLock();
  }
}

function setInfluencerPIN_(p) {
  var infId = p.influencer_id;
  var pin = p.pin;
  if (!infId || pin === undefined || pin === null) return { success: false, error: 'Missing influencer_id or pin' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_('influencer_pins');
    var headers = ENTITY_HEADERS.influencer_pins;
    var now = new Date().toISOString();
    var created = p.created_at || now;
    var updated = p.updated_at || '';
    var rowIndex = findRowById_(sh, 1, infId);
    if (rowIndex < 0) {
      sh.appendRow([String(infId), String(pin), created, updated]);
    } else {
      var cur = sh.getRange(rowIndex, 1, rowIndex, 4).getValues()[0];
      var keepCreated = cur[2] || created;
      safeSetSingleRow_(sh, rowIndex, 4, [String(infId), String(pin), keepCreated, now]);
    }
    return {
      success: true,
      data: { influencer_id: String(infId), pin: String(pin), created_at: created, updated_at: updated }
    };
  } finally {
    lock.releaseLock();
  }
}

function getDepartmentCredentials_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_('department_credentials');
    var headers = ENTITY_HEADERS.department_credentials;
    var last = sh.getLastRow();
    var out = {};
    if (last < 2) return { success: true, data: out };
    var values = sh.getRange(2, 1, last, headers.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var deptId = values[i][0];
      if (!deptId) continue;
      out[String(deptId)] = {
        username: String(values[i][1] || ''),
        password: String(values[i][2] || ''),
        created_at: values[i][3] || '',
        updated_at: values[i][4] || ''
      };
    }
    return { success: true, data: out };
  } finally {
    lock.releaseLock();
  }
}

function setDepartmentCredentials_(p) {
  var deptId = p.department_id;
  var username = p.username;
  var password = p.password;
  if (!deptId || !username || !password) return { success: false, error: 'Missing department_id, username, or password' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = getOrCreateSheet_('department_credentials');
    var now = new Date().toISOString();
    var created = p.created_at || now;
    var updated = p.updated_at || '';
    var rowIndex = findRowById_(sh, 1, deptId);
    if (rowIndex < 0) {
      sh.appendRow([String(deptId), String(username), String(password), created, '']);
    } else {
      var cur = sh.getRange(rowIndex, 1, rowIndex, 5).getValues()[0];
      var keepCreated = cur[3] || created;
      var upd = p.updated_at ? String(p.updated_at) : now;
      safeSetSingleRow_(sh, rowIndex, 5, [String(deptId), String(username), String(password), keepCreated, upd]);
    }
    return {
      success: true,
      data: {
        department_id: String(deptId),
        username: String(username),
        password: String(password),
        created_at: created,
        updated_at: updated || now
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function route_(action, p) {
  switch (action) {
    case 'getInfluencers':
      return listEntity_('influencers');
    case 'createInfluencer':
      return createEntity_('influencers', p, 'inf_');
    case 'updateInfluencer':
      return updateEntity_('influencers', p);
    case 'deleteInfluencer':
      return deleteEntity_('influencers', p.id);

    case 'getProjects':
      return listEntity_('projects');
    case 'createProject':
      return createEntity_('projects', p, 'proj_');
    case 'updateProject':
      return updateEntity_('projects', p);
    case 'deleteProject':
      return deleteEntity_('projects', p.id);

    case 'getPosts':
      return listEntity_('posts');
    case 'createPost':
      return createEntity_('posts', p, 'post_');
    case 'updatePost':
      return updateEntity_('posts', p);
    case 'deletePost':
      return deleteEntity_('posts', p.id);

    case 'getDepartments':
      return listEntity_('departments');
    case 'createDepartment':
      return createEntity_('departments', p, 'dept_');
    case 'updateDepartment':
      return updateEntity_('departments', p);
    case 'deleteDepartment':
      return deleteEntity_('departments', p.id);

    case 'getInfluencerPINs':
      return getInfluencerPINs_();
    case 'setInfluencerPIN':
      return setInfluencerPIN_(p);

    case 'getDepartmentCredentials':
      return getDepartmentCredentials_();
    case 'setDepartmentCredentials':
      return setDepartmentCredentials_(p);

    default:
      return { success: false, error: 'Unknown action: ' + action };
  }
}
