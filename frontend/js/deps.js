import { h, icon, issueColor } from './dom.js';
import { issueById, state } from './store.js';
import { hrefFor } from './router.js';

// Editable list of issue dependencies. Calls onChange(ids) after each edit.
export function dependencyEditor({ excludeId = null, selected, onChange }) {
  let ids = [...selected];
  const root = h('div', { class: 'dep-editor' });

  const draw = () => {
    const chips = ids
      .map((id) => {
        const issue = issueById(id);
        if (!issue) return null;
        return h(
          'span',
          { class: 'chip' },
          h('span', { class: 'dot', style: { background: issueColor(id) } }),
          h('a', { href: hrefFor(`/issues/${id}`) }, issue.title),
          issue.status === 'closed' ? h('span', { class: 'tag done' }, 'Closed') : null,
          h(
            'button',
            {
              type: 'button',
              class: 'chip-x',
              'aria-label': `Remove dependency on ${issue.title}`,
              onclick: () => {
                ids = ids.filter((x) => x !== id);
                draw();
                onChange(ids);
              },
            },
            icon('x', 12),
          ),
        );
      })
      .filter(Boolean);

    const options = state.issues.filter((i) => i.id !== excludeId && !ids.includes(i.id));
    const select = h(
      'select',
      {
        class: 'select',
        'aria-label': 'Add dependency',
        onchange: (e) => {
          const id = Number(e.target.value);
          if (!id) return;
          ids = [...ids, id];
          draw();
          onChange(ids);
        },
      },
      h('option', { value: '' }, ids.length ? 'Add another dependency…' : 'Add a dependency…'),
      ...options.map((i) => h('option', { value: String(i.id) }, i.title)),
    );

    root.replaceChildren(
      h('div', { class: 'chips' }, chips.length ? chips : h('span', { class: 'muted' }, 'No dependencies')),
      options.length ? select : null,
    );
  };

  draw();
  return root;
}
