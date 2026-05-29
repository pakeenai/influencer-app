import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8091/';
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';

const browser = await chromium.launch({ channel: CHANNEL });
const page = await browser.newPage();

const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

function isIgnorableConsoleError(text) {
  const t = String(text || '').toLowerCase();
  return (
    t.includes('/_sdk/') ||
    t.includes('favicon.ico') ||
    t.includes('failed to load resource')
  );
}

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof STATE !== 'undefined' && typeof render === 'function', null, { timeout: 10000 });
await page.waitForTimeout(400);

// Login as Admin
await page.evaluate(() => { STATE._loginTab = 'admin'; render(); });
await page.fill('#adminUsername', 'admin');
await page.fill('#adminPassword', 'admin123');
await page.click('form#adminLoginForm button[type="submit"]');
await page.waitForTimeout(700);

// Go to Influencers page and add influencer
await page.evaluate(() => { STATE.currentPage = 'admin-influencers'; render(); });
await page.waitForTimeout(300);
await page.evaluate(() => { STATE.editItem = null; STATE.modalOpen = 'add-influencer'; render(); });
await page.fill('#mInfName', 'TestUser');
await page.fill('#mInfPhone', '080-000-0000');
await page.fill('#mInfLine', 'testline');
await page.click('form#influencerForm button[type="submit"]');
await page.waitForTimeout(900);

// Go to Projects page and add project assigned to TestUser
await page.evaluate(() => { STATE.currentPage = 'admin-projects'; render(); });
await page.waitForTimeout(300);
await page.evaluate(() => { STATE.editItem = null; STATE.modalOpen = 'add-project'; render(); });
await page.fill('#mProjName', 'Smoke Project');
await page.fill('#mProjClips', '2');
await page.fill('#mProjDeadline', '15/06/2026');
await page.selectOption('#mProjQuality', 'level1');

const testInfId = await page.evaluate(() => {
  const inf = STATE.influencers.find(i => i.name === 'TestUser');
  return inf?.id || null;
});
if (!testInfId) throw new Error('Failed to create/find TestUser influencer');
await page.check(`.influencer-checkbox[data-id="${testInfId}"]`);
await page.fill(`.influencer-clips[data-id="${testInfId}"]`, '2');
await page.click('form#projectForm button[type="submit"]');
await page.waitForTimeout(900);

// Generate PIN for creator, login by PIN, submit post
await page.evaluate(() => { STATE.currentPage = 'admin-influencers'; render(); });
await page.waitForTimeout(300);
await page.evaluate((id) => {
  const inf = STATE.influencers.find(x => x.id === id);
  generateInfluencerPIN(id, inf?.name || '');
}, testInfId);
await page.waitForTimeout(300);

const pin = await page.evaluate((id) => STATE.influencerPINs?.[id]?.pin || null, testInfId);
if (!pin) throw new Error('Failed to generate PIN');

await page.evaluate(() => { STATE.currentPage='login'; STATE.role=null; STATE.adminUser=null; STATE._loginTab='pin'; render(); });
await page.fill('#pinInput', String(pin));
await page.click('form#pinLoginForm button[type="submit"]');
await page.waitForTimeout(700);

// Submit a post
const smokeProjId = await page.evaluate(() => {
  const p = STATE.projects.find(x => x.name === 'Smoke Project');
  return p?.id || null;
});
if (!smokeProjId) throw new Error('Failed to find Smoke Project');
await page.selectOption('#cProjectSelect', smokeProjId);
await page.selectOption('#cPlatformSelect', 'tiktok');
await page.fill('#cLinkInput', 'https://www.tiktok.com/@example/video/123456789');
await page.click('form#creatorSubmitForm button[type="submit"]');
await page.waitForTimeout(1000);

// Back to admin, approve then reject flow
await page.evaluate(() => { STATE.currentPage='login'; STATE.role=null; STATE.adminUser=null; STATE._loginTab='admin'; render(); });
await page.fill('#adminUsername', 'admin');
await page.fill('#adminPassword', 'admin123');
await page.click('form#adminLoginForm button[type="submit"]');
await page.waitForTimeout(800);

await page.evaluate(() => { STATE.currentPage = 'admin-tracking'; render(); });
await page.waitForTimeout(400);

const latestPostId = await page.evaluate((id) => {
  const posts = STATE.posts.filter(p => p.influencer_id === id);
  posts.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return posts[0]?.id || null;
}, testInfId);
if (!latestPostId) throw new Error('No post found after creator submit');

await page.evaluate((pid) => updatePostStatus(pid, 'completed'), latestPostId);
await page.waitForTimeout(500);

await page.evaluate((pid) => updatePostStatus(pid, 'pending'), latestPostId);
await page.waitForTimeout(300);
await page.evaluate(({ pid, reason, name }) => rejectPostWithReason(pid, reason, name), { pid: latestPostId, reason: 'bad link', name: 'TestUser' });
await page.waitForTimeout(500);

await page.evaluate((pid) => { editPost(pid); }, latestPostId);
await page.waitForTimeout(300);
await page.fill('#editLinkInput', 'https://www.tiktok.com/@example/video/987654321');
await page.selectOption('#editStatusSelect', 'pending');
await page.click('form#editPostForm button[type="submit"]');
await page.waitForTimeout(700);

await browser.close();

const nonIgnorableConsoleErrors = consoleErrors.filter(t => !isIgnorableConsoleError(t));
if (pageErrors.length || nonIgnorableConsoleErrors.length) {
  console.log('pageErrors:', pageErrors);
  console.log('consoleErrors:', nonIgnorableConsoleErrors);
  process.exit(1);
}

console.log('OK: flow smoke test passed without page/console errors.');

