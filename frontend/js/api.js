const URL_KEY = 'pm.apiUrl';

// Older versions stored an access code; drop it.
localStorage.removeItem('pm.accessCode');

export const settings = {
  get apiUrl() {
    const saved = localStorage.getItem(URL_KEY);
    return (saved ?? window.PM_CONFIG?.API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  },
  save(apiUrl) {
    localStorage.setItem(URL_KEY, apiUrl.trim().replace(/\/+$/, ''));
  },
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function request(method, path, body, override = {}) {
  const base = override.apiUrl ?? settings.apiUrl;
  if (!base) throw new ApiError(0, 'The server address is not configured');

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and the server address.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
