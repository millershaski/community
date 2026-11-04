const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.85-3.36L23 10M1 14l4.65 4.36A9 9 0 0020.5 15"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  switch: '<path d="M16 3l4 4-4 4M20 7H8M8 21l-4-4 4-4M4 17h12"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
};

export function icon(name, size = 16) {
  const t = document.createElement('template');
  t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  const span = document.createElement('span');
  span.className = 'icon';
  span.append(t.content.firstElementChild);
  return span;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Tiny hyperscript helper. Children are always added as text or nodes, never parsed as HTML.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(props ?? {})) {
    if (val == null || val === false) continue;
    if (key === 'class') el.className = val;
    else if (key === 'value') value = val;
    else if (key === 'style') Object.assign(el.style, val);
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), val);
    else if (key === 'disabled' || key === 'checked' || key === 'selected' || key === 'hidden') el[key] = true;
    else el.setAttribute(key, val === true ? '' : val);
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const IMG_RE = /^img:[a-z0-9][a-z0-9_\-/]*\.(png|svg|webp|jpg)$/;

export const isImageIcon = (s) => typeof s === 'string' && IMG_RE.test(s);

// Icon text usable inside <option> elements (images cannot be shown there).
export const iconText = (m) => (m && !m.icon.startsWith('img:') ? m.icon : '');

export function avatar(member, size = 28) {
  const color = member && COLOR_RE.test(member.color) ? member.color : '#9ca6af';
  const el = h('span', { class: 'avatar', title: member ? member.name : 'Unassigned' });
  el.style.setProperty('--size', `${size}px`);
  el.style.setProperty('--bg', color);
  if (!member) {
    el.classList.add('avatar-empty');
    el.append(icon('user', Math.round(size * 0.55)));
  } else if (isImageIcon(member.icon)) {
    el.classList.add('avatar-img');
    el.append(h('img', { src: `assets/${member.icon.slice(4)}`, alt: '', draggable: 'false' }));
  } else {
    el.append(h('span', { class: 'avatar-glyph' }, member.icon));
  }
  return el;
}

// ---------- dates (due dates are plain YYYY-MM-DD strings in local time) ----------

const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const daysFromToday = (s) => Math.round((parseDate(s) - parseDate(todayStr())) / 86400000);

export function dueLabel(s) {
  if (!s) return '';
  const n = daysFromToday(s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = parseDate(s);
  const opts = d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

export function dueClass(s, done) {
  if (!s || done) return '';
  const n = daysFromToday(s);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : '';
}

export const formatDateTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const ISSUE_COLORS = ['#4573d2', '#f06a6a', '#5da283', '#e8a33d', '#9b6bd4', '#2ea8c9', '#d4719e', '#7a8b3c'];
export const issueColor = (id) => ISSUE_COLORS[id % ISSUE_COLORS.length];

export function toast(message, kind = 'info') {
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}
