import { dependencyEditor } from './deps.js';
import { confirmDialog, deleteMemberFlow, issueDialog, memberDialog, whoAmIDialog } from './dialogs.js';
import { avatar, daysFromToday, dueClass, dueLabel, h, icon, issueColor } from './dom.js';
import { commentsSection, dateInput, field, memberSelect } from './panes.js';
import { go, hrefFor, openTask, parseRoute } from './router.js';
import { actions, emit, issueById, me, memberById, state, tasksOfIssue } from './store.js';

const empty = (title, text, action) => h('div', { class: 'empty' }, h('h3', {}, title), h('p', { class: 'muted' }, text), action ?? null);

const byDue = (a, b) => (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99') || a.id - b.id;

function tabs(items, current, onSelect) {
  return h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ...items.map(([id, label, href]) =>
      href
        ? h('a', { class: `tab${current === id ? ' active' : ''}`, role: 'tab', 'aria-selected': String(current === id), href }, label)
        : h('button', { type: 'button', class: `tab${current === id ? ' active' : ''}`, role: 'tab', 'aria-selected': String(current === id), onclick: () => onSelect(id) }, label),
    ),
  );
}

// ---------- shared task row ----------

function checkButton(task) {
  return h(
    'button',
    {
      type: 'button',
      class: `check${task.completed ? ' on' : ''}`,
      title: task.completed ? 'Mark incomplete' : 'Mark complete',
      'aria-label': task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`,
      'aria-pressed': String(task.completed),
      onclick: (e) => {
        e.stopPropagation();
        actions.toggleTask(task);
      },
    },
    icon('check', 14),
  );
}

function issuePill(issue) {
  if (!issue) return null;
  return h(
    'a',
    { class: 'issue-pill', href: hrefFor(`/issues/${issue.id}`), onclick: (e) => e.stopPropagation() },
    h('span', { class: 'dot', style: { background: issueColor(issue.id) } }),
    h('span', { class: 'ellipsis' }, issue.title),
  );
}

// mode "issue" shows the assignee column; mode "my" shows the issue column.
function taskRow(task, mode) {
  const selected = parseRoute().taskId === task.id;
  const owner = memberById(task.owner_id);
  return h(
    'div',
    {
      class: `row task-row${task.completed ? ' done' : ''}${selected ? ' selected' : ''}`,
      tabindex: '0',
      role: 'button',
      onclick: () => openTask(task.id),
      onkeydown: (e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openTask(task.id);
      },
    },
    h('div', { class: 'cell cell-name' }, checkButton(task), h('span', { class: 'task-title' }, task.title)),
    mode === 'my'
      ? h('div', { class: 'cell cell-extra' }, issuePill(issueById(task.issue_id)))
      : h('div', { class: 'cell cell-extra' }, owner ? [avatar(owner, 24), h('span', { class: 'ellipsis' }, owner.name)] : h('span', { class: 'muted' }, '—')),
    h('div', { class: `cell cell-due ${dueClass(task.due_date, task.completed)}` }, task.due_date ? dueLabel(task.due_date) : ''),
  );
}

const listHeader = (extra) =>
  h('div', { class: 'row list-head' }, h('div', { class: 'cell cell-name' }, 'Task name'), h('div', { class: 'cell cell-extra' }, extra), h('div', { class: 'cell cell-due' }, 'Due date'));

function addTaskInput({ focusKey, onSubmit, placeholder = 'Add task…' }) {
  const input = h('input', {
    class: 'add-input',
    placeholder,
    'aria-label': placeholder,
    maxlength: '300',
    'data-focus': focusKey,
    onkeydown: async (e) => {
      if (e.key !== 'Enter') return;
      const title = input.value.trim();
      if (!title) return;
      input.disabled = true;
      state.ui.focus = `[data-focus="${focusKey}"]`;
      await onSubmit(title);
    },
  });
  return input;
}

// ---------- My tasks ----------

export function renderMyTasks() {
  const user = me();
  const tab = state.ui.myTab;
  const header = h(
    'div',
    { class: 'page-header' },
    h('div', { class: 'title-row' }, avatar(user, 44), h('h1', {}, 'My tasks')),
    tabs(
      [
        ['incomplete', 'Incomplete'],
        ['completed', 'Completed'],
      ],
      tab,
      (id) => {
        state.ui.myTab = id;
        emit();
      },
    ),
  );

  if (!user) {
    return h('div', { class: 'page' }, header, empty('Choose who you are', 'My tasks shows the tasks assigned to you.', h('button', { type: 'button', class: 'btn primary', onclick: () => whoAmIDialog() }, 'Choose member')));
  }

  const mine = state.tasks.filter((t) => t.owner_id === user.id);
  const page = h('div', { class: 'page' }, header);
  const list = h('div', { class: 'list cols-my' });

  if (tab === 'incomplete') {
    const openIssues = state.issues.filter((i) => i.status === 'open');
    if (openIssues.length) {
      let issueId = openIssues[0].id;
      const select = h(
        'select',
        { class: 'select add-issue', 'aria-label': 'Issue for new task', onchange: (e) => (issueId = Number(e.target.value)) },
        ...openIssues.map((i) => h('option', { value: String(i.id) }, i.title)),
      );
      list.append(
        h(
          'div',
          { class: 'row add-row' },
          icon('plus', 16),
          addTaskInput({ focusKey: 'my-add', placeholder: 'Add a task for yourself…', onSubmit: (title) => actions.createTask(issueId, { title, owner_id: user.id }) }),
          select,
        ),
      );
    }
    list.append(listHeader('Issue'));

    const open = mine.filter((t) => !t.completed).sort(byDue);
    const groups = [
      ['Overdue', (t) => t.due_date && daysFromToday(t.due_date) < 0],
      ['Today', (t) => t.due_date && daysFromToday(t.due_date) === 0],
      ['Next 7 days', (t) => t.due_date && daysFromToday(t.due_date) >= 1 && daysFromToday(t.due_date) <= 7],
      ['Later', (t) => t.due_date && daysFromToday(t.due_date) > 7],
      ['No due date', (t) => !t.due_date],
    ];
    for (const [label, test] of groups) {
      const rows = open.filter(test);
      if (!rows.length) continue;
      list.append(h('div', { class: `section-head${label === 'Overdue' ? ' overdue' : ''}` }, `${label} `, h('span', { class: 'muted' }, String(rows.length))), ...rows.map((t) => taskRow(t, 'my')));
    }
    if (!open.length) list.append(empty('Nothing assigned to you', 'Tasks assigned to you will show up here.'));
  } else {
    list.append(listHeader('Issue'));
    const done = mine.filter((t) => t.completed).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    list.append(...done.map((t) => taskRow(t, 'my')));
    if (!done.length) list.append(empty('No completed tasks yet', 'Finished tasks will be listed here.'));
  }
  page.append(list);
  return page;
}

// ---------- All issues ----------

export function renderIssues() {
  const filter = state.ui.issueFilter;
  const header = h(
    'div',
    { class: 'page-header' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Issues'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn primary', onclick: issueDialog }, icon('plus', 16), 'New issue')),
    tabs(
      [
        ['open', 'Open'],
        ['closed', 'Closed'],
        ['all', 'All'],
      ],
      filter,
      (id) => {
        state.ui.issueFilter = id;
        emit();
      },
    ),
  );

  const shown = state.issues.filter((i) => filter === 'all' || i.status === filter).sort(byDue);
  const list = h(
    'div',
    { class: 'list issues-table' },
    h(
      'div',
      { class: 'row list-head' },
      h('div', { class: 'cell cell-name' }, 'Name'),
      h('div', { class: 'cell c-owner' }, 'Owner'),
      h('div', { class: 'cell cell-due' }, 'Due date'),
      h('div', { class: 'cell c-progress' }, 'Progress'),
      h('div', { class: 'cell c-deps' }, 'Depends on'),
    ),
    ...shown.map((issue) => {
      const owner = memberById(issue.owner_id);
      const pct = issue.task_count ? Math.round((issue.completed_task_count / issue.task_count) * 100) : 0;
      const deps = issue.depends_on.map(issueById).filter(Boolean);
      return h(
        'div',
        { class: `row${issue.status === 'closed' ? ' done' : ''}`, tabindex: '0', role: 'link', onclick: () => go(`/issues/${issue.id}`), onkeydown: (e) => e.key === 'Enter' && go(`/issues/${issue.id}`) },
        h(
          'div',
          { class: 'cell cell-name' },
          h('span', { class: 'dot big', style: { background: issueColor(issue.id) } }),
          h('span', { class: 'task-title' }, issue.title),
          issue.status === 'closed' ? h('span', { class: 'tag done' }, 'Closed') : null,
          issue.blocked ? h('span', { class: 'tag blocked' }, icon('lock', 11), 'Blocked') : null,
        ),
        h('div', { class: 'cell c-owner' }, owner ? [avatar(owner, 24), h('span', { class: 'ellipsis' }, owner.name)] : h('span', { class: 'muted' }, '—')),
        h('div', { class: `cell cell-due ${dueClass(issue.due_date, issue.status === 'closed')}` }, issue.due_date ? dueLabel(issue.due_date) : ''),
        h('div', { class: 'cell c-progress' }, h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'bar-fill', style: { width: `${pct}%` } })), h('span', { class: 'muted small' }, `${issue.completed_task_count}/${issue.task_count}`)),
        h('div', { class: 'cell c-deps' }, deps.length ? deps.map((d) => h('span', { class: 'mini-chip' }, d.title)) : h('span', { class: 'muted' }, '—')),
      );
    }),
  );
  return h('div', { class: 'page' }, header, shown.length ? list : empty('No issues here', filter === 'closed' ? 'Closed issues will appear here.' : 'Create an issue to get started.', h('button', { type: 'button', class: 'btn primary', onclick: issueDialog }, 'New issue')));
}

// ---------- Single issue ----------

export function renderIssue(route) {
  const issue = issueById(route.issueId);
  if (!issue) return h('div', { class: 'page' }, empty('Issue not found', 'It may have been deleted.', h('a', { class: 'btn secondary', href: '#/issues' }, 'Back to issues')));

  const owner = memberById(issue.owner_id);
  const closed = issue.status === 'closed';
  const blockers = issue.depends_on.map(issueById).filter((i) => i && i.status !== 'closed');

  const titleInput = h('input', {
    class: 'title-input',
    value: issue.title,
    maxlength: '200',
    'aria-label': 'Issue title',
    onchange: (e) => {
      const v = e.target.value.trim();
      if (!v) e.target.value = issue.title;
      else if (v !== issue.title) actions.updateIssue(issue.id, { title: v });
    },
  });

  const header = h(
    'div',
    { class: 'page-header' },
    h(
      'div',
      { class: 'title-row' },
      h('span', { class: 'dot big', style: { background: issueColor(issue.id) } }),
      titleInput,
      closed ? h('span', { class: 'tag done' }, 'Closed') : null,
      issue.blocked ? h('span', { class: 'tag blocked' }, icon('lock', 11), 'Blocked') : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => actions.updateIssue(issue.id, { status: closed ? 'open' : 'closed' }) }, closed ? 'Reopen issue' : 'Close issue'),
    ),
    h(
      'div',
      { class: 'meta-row' },
      h('span', { class: 'meta' }, avatar(owner, 22), owner ? owner.name : 'No owner'),
      issue.due_date ? h('span', { class: `meta ${dueClass(issue.due_date, closed)}` }, icon('calendar', 14), dueLabel(issue.due_date)) : null,
      h('span', { class: 'meta muted' }, `${issue.completed_task_count}/${issue.task_count} tasks complete`),
    ),
    tabs(
      [
        ['list', 'List', hrefFor(`/issues/${issue.id}`)],
        ['overview', 'Overview', hrefFor(`/issues/${issue.id}/overview`)],
      ],
      route.tab,
    ),
  );

  const banner = blockers.length
    ? h('div', { class: 'banner' }, icon('lock', 16), h('span', {}, 'Blocked by '), ...blockers.flatMap((b, i) => [i ? ', ' : null, h('a', { href: hrefFor(`/issues/${b.id}`) }, b.title)]))
    : null;

  return h('div', { class: 'page' }, header, banner, route.tab === 'overview' ? issueOverview(issue) : issueList(issue));
}

function issueList(issue) {
  const tasks = tasksOfIssue(issue.id);
  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const list = h(
    'div',
    { class: 'list cols-issue' },
    listHeader('Assignee'),
    ...open.map((t) => taskRow(t, 'issue')),
    h('div', { class: 'row add-row' }, icon('plus', 16), addTaskInput({ focusKey: `add-${issue.id}`, onSubmit: (title) => actions.createTask(issue.id, { title }) })),
  );
  if (!tasks.length) list.append(h('p', { class: 'muted pad' }, 'No tasks yet. Type a name above and press Enter to add one.'));
  if (done.length) {
    list.append(
      h(
        'button',
        {
          type: 'button',
          class: 'section-toggle',
          'aria-expanded': String(state.ui.showCompleted),
          onclick: () => {
            state.ui.showCompleted = !state.ui.showCompleted;
            emit();
          },
        },
        icon('chevron', 14),
        `Completed (${done.length})`,
      ),
    );
    if (state.ui.showCompleted) list.append(...done.map((t) => taskRow(t, 'issue')));
  }
  return list;
}

function issueOverview(issue) {
  const blocking = state.issues.filter((i) => i.depends_on.includes(issue.id));
  return h(
    'div',
    { class: 'overview' },
    h(
      'div',
      { class: 'overview-main' },
      h(
        'section',
        {},
        h('h3', { class: 'section-title' }, 'Description'),
        h('textarea', {
          class: 'textarea',
          rows: '5',
          placeholder: 'What is this issue about?',
          'aria-label': 'Description',
          value: issue.description,
          onchange: (e) => actions.updateIssue(issue.id, { description: e.target.value }),
        }),
      ),
      h(
        'section',
        {},
        h('h3', { class: 'section-title' }, 'Depends on'),
        dependencyEditor({ excludeId: issue.id, selected: issue.depends_on, onChange: (ids) => actions.updateIssue(issue.id, { depends_on: ids }) }),
        blocking.length
          ? h('div', { class: 'blocking' }, h('span', { class: 'label' }, 'Blocking'), h('div', { class: 'chips' }, ...blocking.map((b) => h('a', { class: 'chip', href: hrefFor(`/issues/${b.id}`) }, h('span', { class: 'dot', style: { background: issueColor(b.id) } }), b.title))))
          : null,
      ),
      h('section', {}, h('h3', { class: 'section-title' }, 'Comments'), commentsSection('issue', issue.id)),
    ),
    h(
      'aside',
      { class: 'overview-side' },
      field('Owner', h('div', { class: 'with-avatar' }, avatar(memberById(issue.owner_id), 28), memberSelect(issue.owner_id, (id) => actions.updateIssue(issue.id, { owner_id: id }), 'No owner'))),
      field('Due date', dateInput(issue.due_date, (v) => actions.updateIssue(issue.id, { due_date: v }))),
      field(
        'Status',
        h(
          'select',
          { class: 'select', 'aria-label': 'Status', value: issue.status, onchange: (e) => actions.updateIssue(issue.id, { status: e.target.value }) },
          h('option', { value: 'open' }, 'Open'),
          h('option', { value: 'closed' }, 'Closed'),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn danger-outline',
          onclick: async () => {
            const n = tasksOfIssue(issue.id).length;
            if (await confirmDialog({ title: 'Delete issue?', message: `"${issue.title}"${n ? ` and its ${n} task${n === 1 ? '' : 's'}` : ''} will be permanently deleted.` })) {
              go('/issues');
              actions.deleteIssue(issue.id);
            }
          },
        },
        icon('trash', 16),
        'Delete issue',
      ),
    ),
  );
}

// ---------- Team ----------

export function renderTeam() {
  const header = h('div', { class: 'page-header' }, h('div', { class: 'title-row' }, h('h1', {}, 'Team'), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn primary', onclick: () => memberDialog() }, icon('plus', 16), 'Add member')));
  const cards = state.members.map((m) => {
    const openTasks = state.tasks.filter((t) => t.owner_id === m.id && !t.completed).length;
    const issues = state.issues.filter((i) => i.owner_id === m.id).length;
    return h(
      'div',
      { class: 'member-card' },
      avatar(m, 64),
      h('div', { class: 'member-name' }, m.name, m.id === state.meId ? h('span', { class: 'tag' }, 'You') : null),
      h('div', { class: 'muted small' }, `${openTasks} open task${openTasks === 1 ? '' : 's'} · ${issues} issue${issues === 1 ? '' : 's'}`),
      h(
        'div',
        { class: 'card-actions' },
        h('button', { type: 'button', class: 'btn secondary small', onclick: () => memberDialog(m) }, icon('edit', 14), 'Edit'),
        h('button', { type: 'button', class: 'btn danger-outline small', onclick: () => deleteMemberFlow(m) }, icon('trash', 14), 'Delete'),
      ),
    );
  });
  return h('div', { class: 'page' }, header, state.members.length ? h('div', { class: 'member-grid' }, ...cards) : empty('No members yet', 'Add the first member of your team.'));
}
