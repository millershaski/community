import { confirmDialog, whoAmIDialog } from './dialogs.js';
import { avatar, formatDateTime, h, icon, iconText, issueColor } from './dom.js';
import { closeTask, hrefFor } from './router.js';
import { actions, commentKey, issueById, me, memberById, state, taskById } from './store.js';

export function memberSelect(value, onChange, placeholder = 'Unassigned') {
  return h(
    'select',
    { class: 'select', 'aria-label': 'Assignee', value: value ?? '', onchange: (e) => onChange(e.target.value ? Number(e.target.value) : null) },
    h('option', { value: '' }, placeholder),
    ...state.members.map((m) => h('option', { value: String(m.id) }, `${iconText(m)} ${m.name}`.trim())),
  );
}

export function dateInput(value, onChange, label = 'Due date') {
  return h('input', { type: 'date', class: 'input', 'aria-label': label, value: value ?? '', onchange: (e) => onChange(e.target.value || null) });
}

export const field = (label, control) => h('div', { class: 'pane-field' }, h('span', { class: 'label' }, label), control);

function commentItem(kind, parentId, c) {
  const owner = memberById(c.owner_id);
  const mine = c.owner_id != null && c.owner_id === state.meId;
  return h(
    'div',
    { class: 'comment' },
    avatar(owner, 32),
    h(
      'div',
      { class: 'comment-main' },
      h(
        'div',
        { class: 'comment-head' },
        h('strong', {}, owner?.name ?? 'Deleted member'),
        h('span', { class: 'muted small' }, formatDateTime(c.created_at)),
        mine
          ? h(
              'button',
              {
                type: 'button',
                class: 'icon-btn small',
                title: 'Delete comment',
                'aria-label': 'Delete comment',
                onclick: async () => {
                  if (await confirmDialog({ title: 'Delete comment?', message: 'This cannot be undone.' })) actions.deleteComment(kind, parentId, c.id);
                },
              },
              icon('trash', 14),
            )
          : null,
      ),
      h('div', { class: 'comment-text' }, c.body),
    ),
  );
}

// Comments on an issue or task. The author of a new comment is always the current member.
export function commentsSection(kind, parentId) {
  const key = commentKey(kind, parentId);
  const draftKey = `c:${key}`;
  const list = state.comments.get(key);
  const author = me();

  const submit = async () => {
    const body = textarea.value.trim();
    if (!body) return;
    if (!author) {
      whoAmIDialog();
      return;
    }
    button.disabled = true;
    const ok = await actions.addComment(kind, parentId, body);
    if (!ok) button.disabled = false;
  };

  const textarea = h('textarea', {
    class: 'textarea',
    rows: '2',
    placeholder: 'Add a comment…',
    'aria-label': 'Add a comment',
    value: state.drafts.get(draftKey) ?? '',
    oninput: (e) => state.drafts.set(draftKey, e.target.value),
    onkeydown: (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit();
    },
  });
  const button = h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Comment');

  return h(
    'div',
    { class: 'comments' },
    list === undefined
      ? h('p', { class: 'muted' }, 'Loading comments…')
      : list.length
        ? h('div', { class: 'comment-list' }, ...list.map((c) => commentItem(kind, parentId, c)))
        : h('p', { class: 'muted' }, 'No comments yet.'),
    h('div', { class: 'composer' }, avatar(author, 32), h('div', { class: 'composer-main' }, textarea, h('div', { class: 'composer-actions' }, button))),
  );
}

const autosize = (el) => {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export function renderTaskPane(route) {
  const task = taskById(route.taskId);
  if (!task) return null;
  const issue = issueById(task.issue_id);
  const owner = memberById(task.owner_id);

  const title = h('textarea', {
    class: 'pane-title',
    rows: '1',
    'aria-label': 'Task name',
    maxlength: '300',
    value: task.title,
    oninput: (e) => autosize(e.target),
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    },
    onchange: (e) => {
      const v = e.target.value.trim();
      if (!v) e.target.value = task.title;
      else if (v !== task.title) actions.updateTask(task.id, { title: v });
    },
  });
  requestAnimationFrame(() => autosize(title));

  const blockers = issue ? issue.depends_on.map(issueById).filter((i) => i && i.status !== 'closed') : [];

  return h(
    'div',
    { class: 'pane' },
    h(
      'div',
      { class: 'pane-head' },
      h('button', { type: 'button', class: 'icon-btn back-btn', 'aria-label': 'Back', onclick: closeTask }, icon('arrowLeft', 18)),
      h('button', { type: 'button', class: `btn complete${task.completed ? ' on' : ''}`, onclick: () => actions.toggleTask(task) }, icon('check', 16), task.completed ? 'Completed' : 'Mark complete'),
      h('span', { class: 'spacer' }),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          title: 'Delete task',
          'aria-label': 'Delete task',
          onclick: async () => {
            if (await confirmDialog({ title: 'Delete task?', message: `"${task.title}" and its comments will be permanently deleted.` })) {
              closeTask();
              actions.deleteTask(task.id);
            }
          },
        },
        icon('trash', 18),
      ),
      h('button', { type: 'button', class: 'icon-btn close-btn', title: 'Close', 'aria-label': 'Close', onclick: closeTask }, icon('x', 18)),
    ),
    h(
      'div',
      { class: 'pane-body' },
      title,
      task.completed && task.completed_at ? h('p', { class: 'muted small' }, `Completed ${formatDateTime(task.completed_at)}`) : null,
      field('Assignee', h('div', { class: 'with-avatar' }, avatar(owner, 28), memberSelect(task.owner_id, (id) => actions.updateTask(task.id, { owner_id: id })))),
      field('Due date', dateInput(task.due_date, (v) => actions.updateTask(task.id, { due_date: v }))),
      field(
        'Issue',
        issue
          ? h('a', { class: 'issue-link', href: hrefFor(`/issues/${issue.id}`) }, h('span', { class: 'dot', style: { background: issueColor(issue.id) } }), issue.title)
          : h('span', { class: 'muted' }, '—'),
      ),
      blockers.length
        ? h('p', { class: 'notice' }, icon('lock', 14), ` Its issue is blocked by: ${blockers.map((b) => b.title).join(', ')}`)
        : null,
      field(
        'Description',
        h('textarea', {
          class: 'textarea',
          rows: '4',
          placeholder: 'Add more detail…',
          'aria-label': 'Description',
          value: task.description,
          onchange: (e) => actions.updateTask(task.id, { description: e.target.value }),
        }),
      ),
      h('h3', { class: 'section-title' }, 'Comments'),
      commentsSection('task', task.id),
    ),
  );
}
