import { request, settings } from './api.js';
import { dependencyEditor } from './deps.js';
import { avatar, h, icon, iconText, todayStr, toast } from './dom.js';
import { go } from './router.js';
import { actions, me, refresh, setMe, state } from './store.js';

// ---------- modal / menu primitives ----------

export function openModal({ title, content, buttons = [], dismissable = true, className = '' }) {
  const previouslyFocused = document.activeElement;
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    }
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previouslyFocused?.focus?.();
  };

  const footer = buttons.length
    ? h(
        'div',
        { class: 'modal-foot' },
        ...buttons.map((b) =>
          h(
            'button',
            {
              type: 'button',
              class: `btn ${b.kind ?? 'secondary'}`,
              onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                let keepOpen = false;
                try {
                  keepOpen = (await b.onClick?.(close)) === false;
                } finally {
                  btn.disabled = false;
                }
                if (!keepOpen) close();
              },
            },
            b.label,
          ),
        ),
      )
    : null;

  const dialog = h(
    'div',
    { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', {}, title),
      dismissable ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('x', 18)) : null,
    ),
    h('div', { class: 'modal-body' }, content),
    footer,
  );
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => dismissable && e.target === overlay && close() }, dialog);

  document.getElementById('modal-root').append(overlay);
  document.addEventListener('keydown', onKey, true);
  dialog.querySelector('input:not([type=hidden]), textarea, select')?.focus();
  return { close, dialog };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const { dialog } = openModal({
      title,
      content: h('p', {}, message),
      buttons: [
        { label: 'Cancel', onClick: () => done(false) },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => done(true) },
      ],
    });
    new MutationObserver((_, obs) => {
      if (!dialog.isConnected) {
        done(false);
        obs.disconnect();
      }
    }).observe(document.getElementById('modal-root'), { childList: true });
  });
}

let activeMenu = null;
const closeMenu = () => {
  activeMenu?.remove();
  activeMenu = null;
  document.removeEventListener('mousedown', onOutside, true);
};
const onOutside = (e) => {
  if (activeMenu && !activeMenu.contains(e.target)) closeMenu();
};

export function openMenu(anchor, items) {
  closeMenu();
  const menu = h(
    'div',
    { class: 'menu', role: 'menu' },
    ...items.map((it) =>
      it.separator
        ? h('div', { class: 'menu-sep' })
        : h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              class: `menu-item${it.danger ? ' danger' : ''}`,
              onclick: () => {
                closeMenu();
                it.onClick();
              },
            },
            it.icon ? icon(it.icon, 16) : null,
            it.node ?? it.label,
          ),
    ),
  );
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  activeMenu = menu;
  setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
}

// ---------- member editor ----------

const COLORS = ['#f06a6a', '#f1bd6c', '#e8a33d', '#5da283', '#4573d2', '#2ea8c9', '#9b6bd4', '#d4719e', '#8d6e4c', '#6d6e6f', '#7a8b3c', '#1e1f21'];
const BUILTIN_ICONS = ['img:avatars/tyler.png'];
const EMOJIS = [
  '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🦄', '🐙', '🐢', '🦋', '🐝', '🐳',
  '🤖', '👽', '👻', '🥷', '🧙', '🧛', '🦸', '🧑‍🚀', '🧑‍🎨', '🧑‍💻', '🧑‍🔬', '👨‍🏫', '🕵️', '👩‍🍳', '🧑‍🚒', '🎓',
  '❤️', '⭐', '🔥', '⚡', '🌈', '🍕', '🎸', '🚀', '🌵', '🍀', '🧠', '🙂',
];

export function memberDialog(existing = null, { required = false, onSaved } = {}) {
  const data = { name: existing?.name ?? '', icon: existing?.icon ?? '🦊', color: existing?.color ?? COLORS[0] };

  const preview = h('div', { class: 'member-preview' });
  const iconGrid = h('div', { class: 'icon-grid', role: 'listbox', 'aria-label': 'Icon' });
  const drawPreview = () => preview.replaceChildren(avatar({ ...data, name: data.name || 'New member' }, 72));
  const drawIcons = () =>
    iconGrid.replaceChildren(
      ...[...BUILTIN_ICONS, ...EMOJIS].map((ic) =>
        h(
          'button',
          {
            type: 'button',
            role: 'option',
            'aria-selected': String(data.icon === ic),
            class: `icon-option${data.icon === ic ? ' selected' : ''}`,
            onclick: () => {
              data.icon = ic;
              customInput.value = '';
              drawIcons();
              drawPreview();
            },
          },
          avatar({ icon: ic, color: data.color, name: '' }, 38),
        ),
      ),
    );

  const nameInput = h('input', {
    class: 'input',
    maxlength: '80',
    placeholder: 'Name',
    'aria-label': 'Name',
    value: data.name,
    oninput: (e) => {
      data.name = e.target.value;
      drawPreview();
    },
  });
  const customInput = h('input', {
    class: 'input',
    maxlength: '8',
    placeholder: 'Or type your own emoji or initials',
    'aria-label': 'Custom icon',
    oninput: (e) => {
      const v = e.target.value.trim();
      if (v) {
        data.icon = v;
        drawIcons();
        drawPreview();
      }
    },
  });
  const swatches = h('div', { class: 'swatches' });
  const colorInput = h('input', {
    type: 'color',
    class: 'color-input',
    'aria-label': 'Custom color',
    value: data.color,
    oninput: (e) => setColor(e.target.value),
  });
  const setColor = (c) => {
    data.color = c.toLowerCase();
    drawSwatches();
    drawIcons();
    drawPreview();
  };
  const drawSwatches = () =>
    swatches.replaceChildren(
      ...COLORS.map((c) =>
        h('button', {
          type: 'button',
          class: `swatch${data.color === c ? ' selected' : ''}`,
          style: { background: c },
          'aria-label': `Color ${c}`,
          onclick: () => {
            colorInput.value = c;
            setColor(c);
          },
        }),
      ),
      colorInput,
    );

  drawPreview();
  drawIcons();
  drawSwatches();

  const content = h(
    'div',
    { class: 'form' },
    preview,
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Name'), nameInput),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Icon'), iconGrid, customInput),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Color'), swatches),
  );

  return openModal({
    title: existing ? 'Edit member' : 'New member',
    content,
    dismissable: !required,
    buttons: [
      ...(required ? [] : [{ label: 'Cancel' }]),
      {
        label: existing ? 'Save' : 'Add member',
        kind: 'primary',
        onClick: async () => {
          if (!data.name.trim()) {
            toast('Please enter a name', 'error');
            return false;
          }
          const payload = { name: data.name.trim(), icon: data.icon, color: data.color };
          const result = existing ? await actions.updateMember(existing.id, payload) : await actions.createMember(payload);
          if (!result) return false;
          onSaved?.(result);
        },
      },
    ],
  });
}

export async function deleteMemberFlow(member) {
  const ok = await confirmDialog({
    title: `Delete ${member.name}?`,
    message: 'Their tasks and issues become unassigned. Their comments stay, shown as "Deleted member".',
  });
  if (ok) await actions.deleteMember(member.id);
}

// ---------- who am I ----------

export function whoAmIDialog({ required = false } = {}) {
  if (!state.members.length) {
    return memberDialog(null, { required: true, onSaved: (m) => setMe(m.id) });
  }
  const modal = openModal({
    title: 'Who are you?',
    dismissable: !required,
    content: h(
      'div',
      { class: 'who-list' },
      h('p', { class: 'muted' }, 'Comments you write will be attributed to this member.'),
      ...state.members.map((m) =>
        h(
          'button',
          {
            type: 'button',
            class: `who-item${m.id === state.meId ? ' selected' : ''}`,
            onclick: () => {
              setMe(m.id);
              modal.close();
            },
          },
          avatar(m, 36),
          h('span', {}, m.name),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'who-item',
          onclick: () => {
            modal.close();
            memberDialog(null, { onSaved: (created) => setMe(created.id) });
          },
        },
        (() => {
          const plus = avatar(null, 36);
          plus.replaceChildren(icon('plus', 18));
          return plus;
        })(),
        h('span', {}, 'Add a new member…'),
      ),
    ),
  });
  return modal;
}

// ---------- new issue ----------

export function issueDialog() {
  const data = { title: '', description: '', owner_id: me()?.id ?? null, due_date: null, depends_on: [] };
  const titleInput = h('input', { class: 'input', maxlength: '200', placeholder: 'Issue title', 'aria-label': 'Title', oninput: (e) => (data.title = e.target.value) });
  const ownerSelect = h(
    'select',
    { class: 'select', 'aria-label': 'Owner', value: data.owner_id ?? '', onchange: (e) => (data.owner_id = e.target.value ? Number(e.target.value) : null) },
    h('option', { value: '' }, 'Unassigned'),
    ...state.members.map((m) => h('option', { value: String(m.id) }, `${iconText(m)} ${m.name}`.trim())),
  );

  return openModal({
    title: 'New issue',
    content: h(
      'div',
      { class: 'form' },
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Title'), titleInput),
      h(
        'div',
        { class: 'field-row' },
        h('label', { class: 'field' }, h('span', { class: 'label' }, 'Owner'), ownerSelect),
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'label' }, 'Due date'),
          h('input', { type: 'date', class: 'input', 'aria-label': 'Due date', min: todayStr(), onchange: (e) => (data.due_date = e.target.value || null) }),
        ),
      ),
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'label' }, 'Description'),
        h('textarea', { class: 'textarea', rows: '3', 'aria-label': 'Description', oninput: (e) => (data.description = e.target.value) }),
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Depends on'), dependencyEditor({ selected: [], onChange: (ids) => (data.depends_on = ids) })),
    ),
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Create issue',
        kind: 'primary',
        onClick: async () => {
          if (!data.title.trim()) {
            toast('Please enter a title', 'error');
            return false;
          }
          const created = await actions.createIssue({ ...data, title: data.title.trim() });
          if (!created) return false;
          go(`/issues/${created.id}`);
        },
      },
    ],
  });
}

// ---------- connection settings ----------

export function settingsDialog({ message = '' } = {}) {
  const urlInput = h('input', { class: 'input', type: 'url', placeholder: 'https://your-api.example.com', 'aria-label': 'Server address', value: settings.apiUrl, autocomplete: 'off' });
  const codeInput = h('input', { class: 'input', type: 'password', placeholder: 'Leave blank if the server has none', 'aria-label': 'Access code', value: settings.accessCode, autocomplete: 'off' });
  const status = h('div', { class: 'test-status', role: 'status' });

  const test = async () => {
    status.className = 'test-status';
    status.textContent = 'Testing…';
    const override = { apiUrl: urlInput.value.trim().replace(/\/+$/, ''), accessCode: codeInput.value };
    try {
      await request('GET', '/members', undefined, override);
      status.className = 'test-status ok';
      status.textContent = 'Connected.';
      return true;
    } catch (e) {
      status.className = 'test-status bad';
      status.textContent = e.status === 401 ? 'The server rejected the access code.' : e.message;
      return false;
    }
  };

  return openModal({
    title: 'Connection settings',
    content: h(
      'div',
      { class: 'form' },
      message ? h('p', { class: 'notice' }, message) : null,
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Server address'), urlInput),
      h('label', { class: 'field' }, h('span', { class: 'label' }, 'Access code'), codeInput),
      h('div', { class: 'field-row' }, h('button', { type: 'button', class: 'btn secondary', onclick: test }, 'Test connection'), status),
    ),
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Save',
        kind: 'primary',
        onClick: async () => {
          if (!urlInput.value.trim()) {
            toast('Enter the server address', 'error');
            return false;
          }
          settings.save(urlInput.value, codeInput.value);
          state.loaded = false;
          await refresh();
        },
      },
    ],
  });
}
