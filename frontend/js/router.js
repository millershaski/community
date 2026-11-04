export function parseRoute() {
  const raw = location.hash.slice(1) || '/my';
  const [path, qs = ''] = raw.split('?');
  const seg = path.split('/').filter(Boolean);
  const taskId = Number(new URLSearchParams(qs).get('task')) || null;

  if (seg[0] === 'issues' && seg[1]) {
    const issueId = Number(seg[1]) || 0;
    const tab = seg[2] === 'overview' ? 'overview' : 'list';
    return { name: 'issue', issueId, tab, taskId, path: `/issues/${issueId}${tab === 'overview' ? '/overview' : ''}` };
  }
  if (seg[0] === 'issues') return { name: 'issues', taskId, path: '/issues' };
  if (seg[0] === 'team') return { name: 'team', taskId, path: '/team' };
  return { name: 'my', taskId, path: '/my' };
}

export const hrefFor = (path, taskId = null) => `#${path}${taskId ? `?task=${taskId}` : ''}`;

export function go(path, taskId = null) {
  const next = hrefFor(path, taskId);
  if (location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = next;
}

export const openTask = (id) => go(parseRoute().path, id);
export const closeTask = () => go(parseRoute().path);
