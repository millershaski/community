import { issueDialog, memberDialog } from './dialogs.js';
import { avatar, h, icon, issueColor } from './dom.js';
import { hrefFor } from './router.js';
import { state } from './store.js';

function navItem({ href, label, active, lead, trail }) {
  return h(
    'a',
    { class: `nav-item${active ? ' active' : ''}`, href, 'aria-current': active ? 'page' : null },
    lead,
    h('span', { class: 'ellipsis' }, label),
    trail ?? null,
  );
}

function sectionHead(label, addLabel, onAdd) {
  return h(
    'div',
    { class: 'nav-section' },
    h('span', {}, label),
    h('button', { type: 'button', class: 'nav-add', title: addLabel, 'aria-label': addLabel, onclick: onAdd }, icon('plus', 14)),
  );
}

export function renderSidebar(route) {
  const issues = [...state.issues].sort((a, b) => (a.status === b.status ? a.id - b.id : a.status === 'open' ? -1 : 1));

  return h(
    'div',
    { class: 'sidebar-inner' },
    h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('circleCheck', 20)), 'TheCommunity'),
    h(
      'nav',
      { 'aria-label': 'Main' },
      navItem({ href: '#/my', label: 'My tasks', active: route.name === 'my', lead: icon('circleCheck', 18) }),
      navItem({ href: '#/issues', label: 'All issues', active: route.name === 'issues', lead: icon('list', 18) }),
    ),
    sectionHead('Issues', 'New issue', issueDialog),
    h(
      'div',
      { class: 'nav-list' },
      ...issues.map((i) =>
        navItem({
          href: hrefFor(`/issues/${i.id}`),
          label: i.title,
          active: route.name === 'issue' && route.issueId === i.id,
          lead: h('span', { class: 'dot big', style: { background: issueColor(i.id) } }),
          trail: i.blocked ? icon('lock', 12) : i.status === 'closed' ? h('span', { class: 'nav-tag' }, 'Closed') : null,
        }),
      ),
    ),
    sectionHead('Team', 'Add member', () => memberDialog()),
    h(
      'div',
      { class: 'nav-list' },
      ...state.members.map((m) => navItem({ href: '#/team', label: m.name, active: route.name === 'team', lead: avatar(m, 20) })),
    ),
  );
}
