import { issueDialog, memberDialog, openMenu, settingsDialog, whoAmIDialog } from './dialogs.js';
import { avatar, h, icon } from './dom.js';
import { settings } from './api.js';
import { renderTaskPane } from './panes.js';
import { closeTask, go, parseRoute } from './router.js';
import { renderSidebar } from './sidebar.js';
import { commentKey, issueById, loadComments, me, refresh, state, subscribe, taskById } from './store.js';
import { renderIssue, renderIssues, renderMyTasks, renderTeam } from './views.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

let promptedIdentity = false;
let promptedSettings = false;
let lastPath = null;
let lastTaskId = null;

// ---------- top bar (built once; only the account button is redrawn) ----------

const meSlot = h('div', { class: 'me-slot' });
const results = h('div', { class: 'search-results', hidden: true });
const searchInput = h('input', {
  class: 'search-input',
  type: 'search',
  placeholder: 'Search issues and tasks',
  'aria-label': 'Search issues and tasks',
  autocomplete: 'off',
  oninput: onSearch,
  onfocus: onSearch,
  onkeydown: (e) => {
    if (e.key === 'Escape') {
      results.hidden = true;
      searchInput.blur();
    }
  },
});

function onSearch() {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    results.hidden = true;
    return;
  }
  const pick = (path, taskId) => {
    results.hidden = true;
    searchInput.value = '';
    go(path, taskId);
  };
  const issues = state.issues.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 5);
  const tasks = state.tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 6);
  results.replaceChildren(
    ...issues.map((i) => h('button', { type: 'button', class: 'search-item', onclick: () => pick(`/issues/${i.id}`) }, icon('list', 14), h('span', { class: 'ellipsis' }, i.title), h('span', { class: 'muted small' }, 'Issue'))),
    ...tasks.map((t) => h('button', { type: 'button', class: 'search-item', onclick: () => pick(`/issues/${t.issue_id}`, t.id) }, icon('circleCheck', 14), h('span', { class: 'ellipsis' }, t.title), h('span', { class: 'muted small' }, issueById(t.issue_id)?.title ?? 'Task'))),
    !issues.length && !tasks.length ? h('div', { class: 'search-empty muted' }, 'No matches') : null,
  );
  results.hidden = false;
}

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.search')) results.hidden = true;
});

function buildTopbar() {
  $('topbar').append(
    h('button', { type: 'button', class: 'icon-btn nav-toggle', 'aria-label': 'Open menu', onclick: () => app.classList.toggle('nav-open') }, icon('menu', 20)),
    h(
      'button',
      {
        type: 'button',
        class: 'btn primary create-btn',
        onclick: (e) =>
          openMenu(e.currentTarget, [
            { label: 'New issue', icon: 'list', onClick: issueDialog },
            { label: 'New member', icon: 'users', onClick: () => memberDialog() },
          ]),
      },
      icon('plus', 16),
      h('span', { class: 'create-label' }, 'Create'),
    ),
    h('div', { class: 'search' }, icon('search', 16), searchInput, results),
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'icon-btn', title: 'Refresh', 'aria-label': 'Refresh', onclick: hardRefresh }, icon('refresh', 18)),
    meSlot,
  );
}

function drawMe() {
  const user = me();
  meSlot.replaceChildren(
    h(
      'button',
      {
        type: 'button',
        class: 'me-btn',
        'aria-label': user ? `Account menu for ${user.name}` : 'Account menu',
        onclick: (e) =>
          openMenu(e.currentTarget, [
            { label: 'Switch member', icon: 'switch', onClick: () => whoAmIDialog() },
            ...(user ? [{ label: 'Edit my profile', icon: 'edit', onClick: () => memberDialog(user) }] : []),
            { label: 'Connection settings', icon: 'sliders', onClick: () => settingsDialog() },
          ]),
      },
      avatar(user, 32),
    ),
  );
}

// ---------- rendering ----------

function renderConnecting() {
  const err = state.error;
  if (!err) {
    return h('div', { class: 'page' }, h('div', { class: 'empty' }, h('p', { class: 'muted' }, settings.apiUrl ? 'Loading…' : 'Set the server address to get started.')));
  }
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'empty' },
      h('h3', {}, err.status === 401 ? 'Access code required' : 'Cannot connect'),
      h('p', { class: 'muted' }, err.status === 401 ? 'The server needs a valid access code.' : err.message),
      h(
        'div',
        { class: 'empty-actions' },
        h('button', { type: 'button', class: 'btn secondary', onclick: refresh }, 'Retry'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => settingsDialog() }, 'Connection settings'),
      ),
    ),
  );
}

function syncComments(route) {
  const wanted = [];
  if (route.taskId && taskById(route.taskId)) wanted.push(['task', route.taskId]);
  if (route.name === 'issue' && route.tab === 'overview' && issueById(route.issueId)) wanted.push(['issue', route.issueId]);
  const keys = wanted.map(([kind, id]) => commentKey(kind, id));
  for (const key of [...state.comments.keys()]) if (!keys.includes(key)) state.comments.delete(key);
  for (const [kind, id] of wanted) if (!state.comments.has(commentKey(kind, id))) loadComments(kind, id);
}

function render() {
  const route = parseRoute();
  const main = $('main');
  const detail = $('detail');
  const samePage = lastPath === route.path;
  const sameTask = lastTaskId === route.taskId;
  const mainScroll = samePage ? main.scrollTop : 0;
  const detailScroll = sameTask ? detail.scrollTop : 0;
  lastPath = route.path;
  lastTaskId = route.taskId;

  drawMe();
  $('sidebar').replaceChildren(renderSidebar(route));

  if (!state.loaded) {
    main.replaceChildren(renderConnecting());
    detail.replaceChildren();
    detail.hidden = true;
    app.classList.remove('has-detail');
    if (state.error && (state.error.status === 401 || !settings.apiUrl) && !promptedSettings) {
      promptedSettings = true;
      settingsDialog({ message: state.error.status === 401 ? 'The server needs an access code.' : '' });
    }
    return;
  }

  const views = { my: renderMyTasks, issues: renderIssues, issue: renderIssue, team: renderTeam };
  main.replaceChildren(views[route.name](route));

  const pane = renderTaskPane(route);
  detail.replaceChildren(...(pane ? [pane] : []));
  detail.hidden = !pane;
  app.classList.toggle('has-detail', Boolean(pane));

  main.scrollTop = mainScroll;
  detail.scrollTop = detailScroll;

  syncComments(route);

  if (state.ui.focus) {
    document.querySelector(state.ui.focus)?.focus();
    state.ui.focus = null;
  }

  // Deferred so a dialog that triggered this render (e.g. connection settings) can close first.
  if (!state.meId && !promptedIdentity) {
    setTimeout(() => {
      if (state.meId || promptedIdentity || !state.loaded || document.querySelector('.overlay')) return;
      promptedIdentity = true;
      whoAmIDialog({ required: true });
    }, 50);
  }
}

// ---------- refreshing ----------

async function hardRefresh() {
  state.comments.clear();
  await refresh();
}

function softRefresh() {
  const active = document.activeElement;
  const typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  if (document.hidden || typing || document.querySelector('.overlay') || !state.loaded) return;
  refresh();
}

// ---------- boot ----------

subscribe(render);
window.addEventListener('hashchange', () => {
  app.classList.remove('nav-open');
  render();
});
$('scrim').addEventListener('click', () => app.classList.remove('nav-open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.overlay') && parseRoute().taskId) closeTask();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) softRefresh();
});
setInterval(softRefresh, 30000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

buildTopbar();
render();
if (settings.apiUrl) refresh();
else settingsDialog({ message: 'Enter the address of your TheCommunity server to get started.' });
