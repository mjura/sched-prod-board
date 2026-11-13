// Records the deployed board in use (flow ack-incident). Usage: node record.mjs <board url> <out dir>
// A visible pointer is drawn by this script only (Playwright videos have no cursor); the app is unchanged.
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out = 'rec'] = process.argv.slice(2);
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
page.on('console', (m) => { if (m.text().startsWith('ack ')) events.push({ at: mmss(), console: m.text() }); });
const ids = () => page.$$eval('[data-testid="incident-row"]', (r) => r.map((x) => x.dataset.id));
await page.goto(url);
events.push({ at: mmss(), note: 'open-board', loaderVisible: await page.isVisible('[data-testid="loader"]') });
await page.waitForSelector('[data-testid="incident-row"]');
const sha = await page.getAttribute('meta[name="build"]', 'content');
events.push({ at: mmss(), note: 'loaded', sha, footer: await page.textContent('[data-testid="build-sha"]'), rows: await ids() });
await page.waitForTimeout(2500);

// 1) A clean ack: the third row, clicked by selector.
const first = (await ids())[2];
const btn1 = page.locator(`[data-id="${first}"] [data-testid="ack"]`);
const b1 = await btn1.boundingBox();
await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 15 });
await page.waitForTimeout(600);
events.push({ at: mmss(), note: 'clean ack click', intended: first });
await page.mouse.down(); await page.mouse.up();
await page.waitForSelector(`[data-id="${first}"] [data-testid="acked"]`);
await page.waitForTimeout(2000);

// 2) watch-board: the pointer rests on the Ack of the top unacked row while the board refreshes. When a new
// incident arrives, the list shifts down under the pointer. Clicking where the pointer already was acks the row
// that slid into place, not the one the on-call aimed at.
let before = await ids();
const target = before.find((id) => id !== first);
const box = await page.locator(`[data-id="${target}"] [data-testid="ack"]`).boundingBox();
const x = box.x + box.width / 2, y = box.y + box.height / 2;
await page.mouse.move(x, y, { steps: 15 });
events.push({ at: mmss(), note: 'pointer on Ack', intended: target });
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  await page.waitForTimeout(100);
  const now = await ids();
  if (now[0] !== before[0]) { events.push({ at: mmss(), note: 'new incident arrived at top', newTop: now[0] }); break; }
}
await page.waitForTimeout(150); // human reaction: the click lands just after the shift
const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="incident-row"]')?.dataset.id, [x, y]);
events.push({ at: mmss(), note: 'click at the same spot', intended: target, rowUnderPointer: under });
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(1500);
const ackedNow = await page.$$eval('[data-testid="acked"]', (a) => a.map((x) => x.closest('[data-testid="incident-row"]').dataset.id));
events.push({ at: mmss(), note: 'acked rows', ackedNow, targetAcked: ackedNow.includes(target) });
await page.waitForTimeout(3000);
events.push({ at: mmss(), note: 'end', acks: await page.evaluate(async () => (await import('./api.js')).acks) });
await ctx.close(); await browser.close();
fs.writeFileSync(`${out}/events.json`, JSON.stringify({ url, sha, events }, null, 2));
console.log(JSON.stringify({ sha, events }, null, 2));
