const URL_KEY = 'pm.apiUrl';
const CODE_KEY = 'pm.accessCode';

export const settings = {
  get apiUrl() {
    const saved = localStorage.getItem(URL_KEY);
    return (saved ?? window.PM_CONFIG?.API_BASE_URL ?? '').trim().replace(/\/+$/, '');
  },
  get accessCode() {
    return localStorage.getItem(CODE_KEY) ?? '';
  },
  save(apiUrl, accessCode) {
    localStorage.setItem(URL_KEY, apiUrl.trim().replace(/\/+$/, ''));
    if (accessCode) localStorage.setItem(CODE_KEY, accessCode);
    else localStorage.removeItem(CODE_KEY);
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
  const code = override.accessCode ?? settings.accessCode;
  if (!base) throw new ApiError(0, 'The server address is not configured');

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (code) headers.Authorization = `Bearer ${code}`;

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
