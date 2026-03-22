import { getTraceId } from './traceId.js';

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId(), ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Settings
export const settingsApi = {
  get: () => request('/settings'),
  update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// Clients (needed for InvoicingPage business client dropdown and AdminLayout title)
export const clientsApi = {
  getAll: () => request('/clients'),
  getById: (id) => request(`/clients/${id}`),
};

// AI Config
export const aiConfigApi = {
  getConfig: () => request('/ai-config'),
  updateConfig: (data) => request('/ai-config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/ai-config/test-connection', { method: 'POST', body: JSON.stringify(data) }),
};

// MCP Auth
export const mcpAuthApi = {
  getConfig: () => request('/mcp-auth'),
  updateConfig: (data) => request('/mcp-auth', { method: 'PUT', body: JSON.stringify(data) }),
};

// Backup
export const backupApi = {
  getConfig: () => request('/backup/config'),
  updateConfig: (data) => request('/backup/config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/backup/test-connection', { method: 'POST', body: JSON.stringify(data) }),
  create: () => request('/backup/create', { method: 'POST', body: JSON.stringify({}) }),
  getOperation: (id) => request(`/backup/operations/${id}`),
  list: () => request('/backup/list'),
  restore: (backupKey) => request('/backup/restore', { method: 'POST', body: JSON.stringify({ backupKey }) }),
  delete: (key) => request(`/backup/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};

// Calendar Sources
export const calendarSourcesApi = {
  getAll: () => request('/calendar-sources'),
  getById: (id) => request(`/calendar-sources/${id}`),
  create: (data) => request('/calendar-sources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/calendar-sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/calendar-sources/${id}`, { method: 'DELETE' }),
  refresh: (id) => request(`/calendar-sources/${id}/refresh`, { method: 'POST', body: '{}' }),
  refreshAll: () => request('/calendar-sources/refresh-all', { method: 'POST', body: '{}' }),
};

// Ticket Sources
export const ticketSourcesApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/ticket-sources${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/ticket-sources/${id}`),
  create: (data) => request('/ticket-sources', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/ticket-sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/ticket-sources/${id}`, { method: 'DELETE' }),
  refresh: (id) => request(`/ticket-sources/${id}/refresh`, { method: 'POST', body: '{}' }),
  refreshAll: () => request('/ticket-sources/refresh-all', { method: 'POST', body: '{}' }),
  test: (id) => request(`/ticket-sources/${id}/test`, { method: 'POST', body: '{}' }),
};

// Logs
export const logApi = {
  getConfig: () => request('/logs/config'),
  updateConfig: (data) => request('/logs/config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/logs/test-connection', { method: 'POST', body: JSON.stringify(data) }),
  listFiles: () => request('/logs/files'),
  readFile: (filename, params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/logs/files/${encodeURIComponent(filename)}${query ? `?${query}` : ''}`);
  },
  search: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/logs/search${query ? `?${query}` : ''}`);
  },
  uploadToR2: (filename) => request(`/logs/upload/${encodeURIComponent(filename)}`, { method: 'POST', body: '{}' }),
  deleteLocal: (filename) => request(`/logs/files/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  downloadFromR2: (filename) => request(`/logs/download/${encodeURIComponent(filename)}`, { method: 'POST', body: '{}' }),
  listR2: () => request('/logs/r2'),
};

