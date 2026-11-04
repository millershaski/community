import { api } from './api.js';
import { toast } from './dom.js';

export const state = {
  members: [],
  issues: [],
  tasks: [],
  comments: new Map(),
  commentsLoading: new Set(),
  drafts: new Map(),
  meId: Number(localStorage.getItem('pm.me')) || null,
  loaded: false,
  error: null,
  ui: { focus: null, myTab: 'incomplete', issueFilter: 'open', showCompleted: false, collapsedIssues: new Set() },
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export const memberById = (id) => state.members.find((m) => m.id === id) ?? null;
export const issueById = (id) => state.issues.find((i) => i.id === id) ?? null;
export const taskById = (id) => state.tasks.find((t) => t.id === id) ?? null;
export const tasksOfIssue = (id) => state.tasks.filter((t) => t.issue_id === id);
export const me = () => memberById(state.meId);
export const commentKey = (kind, id) => `${kind}:${id}`;

export function setMe(id) {
  state.meId = id;
  if (id) localStorage.setItem('pm.me', String(id));
  else localStorage.removeItem('pm.me');
  emit();
}

export async function refresh() {
  try {
    const [members, issues, tasks] = await Promise.all([api.get('/members'), api.get('/issues'), api.get('/tasks')]);
    Object.assign(state, { members, issues, tasks, loaded: true, error: null });
    if (state.meId && !members.some((m) => m.id === state.meId)) {
      state.meId = null;
      localStorage.removeItem('pm.me');
    }
  } catch (e) {
    state.error = e;
    if (state.loaded) toast(e.message, 'error');
  }
  emit();
}

export async function loadComments(kind, id) {
  const key = commentKey(kind, id);
  if (state.commentsLoading.has(key)) return;
  state.commentsLoading.add(key);
  try {
    state.comments.set(key, await api.get(`/comments?${kind}_id=${id}`));
  } catch (e) {
    toast(e.message, 'error');
    state.comments.set(key, []);
  } finally {
    state.commentsLoading.delete(key);
  }
  emit();
}

// Runs a write, then re-syncs everything. Returns the API result (or true), or false on failure.
async function mutate(fn) {
  try {
    const result = await fn();
    await refresh();
    return result ?? true;
  } catch (e) {
    toast(e.message, 'error');
    await refresh();
    return false;
  }
}

export const actions = {
  createMember: (data) => mutate(() => api.post('/members', data)),
  updateMember: (id, data) => mutate(() => api.patch(`/members/${id}`, data)),
  deleteMember: (id) => mutate(() => api.del(`/members/${id}`)),

  createIssue: (data) => mutate(() => api.post('/issues', data)),
  updateIssue: (id, data) => mutate(() => api.patch(`/issues/${id}`, data)),
  deleteIssue: (id) => mutate(() => api.del(`/issues/${id}`)),

  createTask: (issueId, data) => mutate(() => api.post(`/issues/${issueId}/tasks`, data)),
  updateTask: (id, data) => mutate(() => api.patch(`/tasks/${id}`, data)),
  toggleTask: (task) => mutate(() => api.patch(`/tasks/${task.id}`, { completed: !task.completed })),
  deleteTask: (id) => mutate(() => api.del(`/tasks/${id}`)),

  async addComment(kind, parentId, body) {
    try {
      const created = await api.post(`/${kind}s/${parentId}/comments`, { owner_id: state.meId, body });
      const key = commentKey(kind, parentId);
      state.comments.set(key, [...(state.comments.get(key) ?? []), created]);
      state.drafts.delete(`c:${key}`);
      emit();
      return true;
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  },

  async deleteComment(kind, parentId, id) {
    try {
      await api.del(`/comments/${id}`);
      const key = commentKey(kind, parentId);
      state.comments.set(key, (state.comments.get(key) ?? []).filter((c) => c.id !== id));
      emit();
    } catch (e) {
      toast(e.message, 'error');
    }
  },
};
