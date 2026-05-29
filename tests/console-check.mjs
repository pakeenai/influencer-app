import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8091/';
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';

function isIgnorable(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('/_sdk/') ||
    text.includes('favicon.ico') ||
    text.includes('failed to load resource') ||
    text.includes('net::err_failed') ||
    text.includes('net::err_connection_refused')
  );
}

const browser = await chromium.launch({ channel: CHANNEL });
const page = await browser.newPage();

const consoleEvents = [];
const pageErrors = [];
const requestFailed = [];

page.on('console', (msg) => {
  consoleEvents.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location()
  });
});

page.on('pageerror', (err) => {
  pageErrors.push(String(err?.stack || err));
});

page.on('requestfailed', (req) => {
  requestFailed.push({
    url: req.url(),
    failure: req.failure()?.errorText || 'unknown'
  });
});

const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const errors = consoleEvents.filter(e => e.type === 'error');
const warns = consoleEvents.filter(e => e.type === 'warning');

function printSection(title, items) {
  if (!items.length) return;
  console.log(`\n=== ${title} (${items.length}) ===`);
  for (const it of items) console.log(it);
}

console.log(`Loaded: ${BASE_URL} status=${res?.status?.() ?? 'n/a'}`);
printSection('pageerror', pageErrors);
printSection('console.error', errors);
printSection('console.warning', warns);
printSection('requestfailed', requestFailed);

const nonIgnorableConsoleErrors = errors.filter(e => !isIgnorable(e.text));
const hasSerious = pageErrors.length > 0 || nonIgnorableConsoleErrors.length > 0;

await browser.close();

if (hasSerious) {
  console.error('\nFAIL: Detected non-ignorable runtime errors.');
  process.exit(1);
} else {
  console.log('\nOK: No non-ignorable runtime errors detected.');
}

