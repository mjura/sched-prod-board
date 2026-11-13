import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const newBar = document.querySelector('[data-testid="new-bar"]');

const rows = new Map(); // incident id -> <li>
const acked = new Set(); // ids acked from this board

// R5: the viewer's own locale and time zone; the locale decides the order (dd/mm in EU locales).
const timeFmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text; // incident text is data: never innerHTML
  return node;
}

function markAcked(li) {
  li.classList.add('is-acked');
  const slot = li.querySelector('.act');
  slot.replaceChildren(el('span', { 'data-testid': 'acked', class: 'acked' }, 'acked'));
}

function rowFor(i) {
  const li = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  li.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, timeFmt.format(new Date(i.openedAt))),
  );
  const slot = el('span', { class: 'act' });
  const btn = el('button', { type: 'button', 'data-testid': 'ack', class: 'ack' }, 'Ack');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await ack(i.id); // R2
      acked.add(i.id);
      markAcked(li);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Ack (retry)';
    }
  });
  slot.append(btn);
  li.append(slot);
  if (acked.has(i.id)) markAcked(li);
  return li;
}

// R1 (as product decided after step 1): the list holds still while it is on screen. The first answer fills it;
// later incidents wait behind the "N new" bar and come in at the top, newest first, only when on-call clicks it.
// So a row never moves under the pointer, and Ack stays on the row it was aimed at.
let latest = []; // the API's current list, newest first
let shown = false; // has the list been filled once

function apply(incidents) {
  const seen = new Set();
  let anchor = list.firstElementChild;
  for (const i of incidents) {
    seen.add(i.id);
    let li = rows.get(i.id);
    if (!li) {
      li = rowFor(i);
      rows.set(i.id, li);
    }
    if (li !== anchor) list.insertBefore(li, anchor);
    else anchor = anchor.nextElementSibling;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) {
      li.remove();
      rows.delete(id);
    }
  }
  empty.hidden = incidents.length > 0;
}

function pending() {
  return latest.filter((i) => !rows.has(i.id)).length;
}

function updateBar() {
  const n = pending();
  newBar.hidden = n === 0;
  newBar.dataset.count = String(n);
  newBar.textContent = n === 1 ? '1 new incident' : `${n} new incidents`;
}

function render(incidents) {
  latest = incidents;
  if (!shown) {
    apply(latest);
    shown = true;
  }
  updateBar();
}

newBar.addEventListener('click', () => {
  apply(latest);
  updateBar();
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    board.dataset.updatedAt = page.updatedAt;
  } catch (err) {
    console.error(err);
  } finally {
    loader.hidden = true; // R3: gone once the first answer is in
    board.setAttribute('aria-busy', 'false');
    setTimeout(refresh, REFRESH_MS);
  }
}

refresh();
