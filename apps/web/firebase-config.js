/**
 * Backend: Firebase เท่านั้น (ไม่ใช้ Google Apps Script)
 *
 * localhost → Firestore Emulator (127.0.0.1:8080) โดยค่าเริ่มต้น
 *   รัน: npm run dev   หรือ   npm run firebase:emu + npm run serve
 *
 * Production → คัดลอก firebase-config.local.js.example เป็น firebase-config.local.js
 *   ใส่ค่าจาก Firebase Console โปรเจกต์ใหม่ของคุณ (ไม่เกี่ยวกับ data-clip)
 *
 * ?prod=1 บน localhost → บังคับใช้ config จาก firebase-config.local.js
 */
(function () {
  var EMULATOR_CONFIG = {
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'xstream-solution',
    storageBucket: 'xstream-solution.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:local-emulator'
  };

  function readProdConfig_() {
    var inline = typeof window.IMS_FIREBASE_CONFIG !== 'undefined' ? window.IMS_FIREBASE_CONFIG : null;
    if (inline && inline.apiKey && inline.projectId) return inline;
    try {
      var raw = localStorage.getItem('ims_firebase_config');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.apiKey && o.projectId) return o;
      }
    } catch (e) {}
    return null;
  }

  var h = typeof location !== 'undefined' ? String(location.hostname || '') : '';
  var local = h === 'localhost' || h === '127.0.0.1';
  var search = typeof location !== 'undefined' ? String(location.search || '') : '';
  var forceProd = search.indexOf('prod=1') >= 0;

  var prod = readProdConfig_();

  if (prod && (!local || forceProd)) {
    window.IMS_USE_FIRESTORE_EMULATOR = false;
    window.FIREBASE_CONFIG = prod;
    return;
  }

  if (local) {
    window.IMS_USE_FIRESTORE_EMULATOR = true;
    window.IMS_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    window.FIREBASE_CONFIG = EMULATOR_CONFIG;
    return;
  }

  if (prod) {
    window.IMS_USE_FIRESTORE_EMULATOR = false;
    window.FIREBASE_CONFIG = prod;
    return;
  }

  window.IMS_USE_FIRESTORE_EMULATOR = false;
  window.FIREBASE_CONFIG = null;
})();
