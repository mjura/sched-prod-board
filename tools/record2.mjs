// Records the rebuilt board (product's decision: list holds still, "N new" bar). Usage: node tools/record2.mjs <board url> <out dir>
// The red pointer is drawn by this script only (Playwright videos have no cursor); the app is unchanged.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out = 'rec2'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Warsaw', viewport: { width: 1100, height: 640 }, recordVideo: { dir: out, size: { width: 1100, height: 640 } } });
await ctx.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;z-index:99999;width:18px;height:18px;border-radius:50%;background:rgba(220,0,0,.55);border:2px solid #900;pointer-events:none;left:-40px;top:-40px;transform:translate(-50%,-50%)';
    document.body.appendChild(d);
    addEventListener('mousemove', (e) => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  });
});
const page = await ctx.newPage();
const t0 = Date.now();
const mmss = () => { const s = Math.floor((Date.now() - t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const events = [];
const receipts = [];
page.on('console', (m) => { const t = m.text(); if (t.startsWith('ack ')) { const [, id, ackedAt, receipt] = t.split(' '); receipts.push({ at: mmss(), id, ackedAt, receipt }); } });
const ids = () => page.$$eval('[data-testid="incident-row"]', (r) => r.map((x) => x.dataset.id));
const bar = page.locator('[data-testid="new-bar"]');
await page.goto(url);
events.push({ at: mmss(), note: 'open-board', loaderVisible: await page.isVisible('[data-testid="loader"]') });
await page.waitForSelector('[data-testid="incident-row"]');
const sha = await page.getAttribute('meta[name="build"]', 'content');
const before = await ids();
events.push({ at: mmss(), note: 'loaded', sha, footer: await page.textContent('[data-testid="build-sha"]'), rows: before });

// watch-board + ack-incident: pointer on the top row's Ack while new incidents arrive.
const target = before[0];
const box = await page.locator(`[data-id="${target}"] [data-testid="ack"]`).boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
await page.mouse.move(x, y, { steps: 15 });
events.push({ at: mmss(), note: 'pointer on Ack', intended: target });
await bar.waitFor({ state: 'visible', timeout: 60000 });
events.push({ at: mmss(), note: 'new-bar shows', text: await bar.textContent(), rows: await ids(), rowsUnchanged: JSON.stringify(await ids()) === JSON.stringify(before) });
await page.waitForTimeout(400);
const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
events.push({ at: mmss(), note: 'click at the same spot', intended: target, rowUnderPointer: under });
await page.mouse.down(); await page.mouse.up();
await page.waitForSelector(`[data-id="${target}"] [data-testid="acked"]`);
events.push({ at: mmss(), note: 'acked', expected: target, ackedRows: await page.$$eval('[data-testid="acked"]', (a) => a.map((x) => x.closest('[data-testid="incident-row"]').dataset.id)) });
await page.waitForTimeout(2500);

// The bar brings the new incidents in on click, at the top, newest first; the acked mark stays on its row.
const bb = await bar.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 15 });
const barText = await bar.textContent();
await page.waitForTimeout(400);
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(300);
const after = await ids();
events.push({ at: mmss(), note: 'new-bar clicked', barText, rows: after, barHidden: await bar.isHidden(), targetStillAcked: await page.isVisible(`[data-id="${target}"] [data-testid="acked"]`) });
await page.waitForTimeout(3000);
await ctx.close(); await browser.close();
fs.writeFileSync(`${out}/events.json`, JSON.stringify({ url, sha, events, receipts }, null, 2));
console.log(JSON.stringify({ sha, events, receipts }, null, 2));
