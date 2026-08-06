import { getTraceId } from './traceId.js';

// Admin surface API — served behind the admin Cloudflare Access application's
// path scope and the server-side JWT aud check (see cfAccessJwt.js).
const BASE = '/admin/api';

// Error carrying the HTTP status and machine-readable code from the server
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId(), ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed: ${res.status}`, res.status, body.code);
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
  getDefaults: () => request('/ai-config/defaults'),
  updateConfig: (data) => request('/ai-config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/ai-config/test-connection', { method: 'POST', body: JSON.stringify(data) }),
};

// Gemini Config
export const geminiConfigApi = {
  getConfig: () => request('/gemini-config'),
  getDefaults: () => request('/gemini-config/defaults'),
  updateConfig: (data) => request('/gemini-config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/gemini-config/test-connection', { method: 'POST', body: JSON.stringify(data) }),
  uploadBackgroundMusic: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/gemini-config/background-music`, {
      method: 'POST',
      headers: { 'X-Trace-Id': getTraceId() },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },
  deleteBackgroundMusic: () => request('/gemini-config/background-music', { method: 'DELETE' }),
};

// MCP Auth
export const mcpAuthApi = {
  getConfig: () => request('/mcp-auth'),
  updateConfig: (data) => request('/mcp-auth', { method: 'PUT', body: JSON.stringify(data) }),
};

// AI Providers (Agents — chat provider registry)
export const aiProvidersApi = {
  getAll: () => request('/ai-providers'),
  getById: (id) => request(`/ai-providers/${id}`),
  create: (data) => request('/ai-providers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/ai-providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/ai-providers/${id}`, { method: 'DELETE' }),
  testConnection: (id, data = {}) => request(`/ai-providers/${id}/test-connection`, { method: 'POST', body: JSON.stringify(data) }),
};

// Agent tool definitions (Agents) — admin-managed records mapped onto
// code-side handlers; /handlers lists the mappable handler names
export const agentToolsApi = {
  getAll: () => request('/agent-tools'),
  getById: (id) => request(`/agent-tools/${id}`),
  getHandlers: () => request('/agent-tools/handlers'),
  create: (data) => request('/agent-tools', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/agent-tools/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/agent-tools/${id}`, { method: 'DELETE' }),
};

// Agent cards (Agents) — file-led folders; writes go to disk + reindex
export const agentCardsApi = {
  getAll: () => request('/agents'),
  getBySlug: (slug) => request(`/agents/${encodeURIComponent(slug)}`),
  create: (data) => request('/agents', { method: 'POST', body: JSON.stringify(data) }),
  update: (slug, data) => request(`/agents/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (slug) => request(`/agents/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  rescan: () => request('/agents/rescan', { method: 'POST', body: '{}' }),
  getTools: () => request('/agents/tools'),
};

// Routing eval-set (Agents)
export const evalExamplesApi = {
  getAll: () => request('/eval-examples'),
  create: (data) => request('/eval-examples', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/eval-examples/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/eval-examples/${id}`, { method: 'DELETE' }),
  run: () => request('/eval-examples/run', { method: 'POST', body: '{}' }),
};

// Routing engine (Agents) — config, index status, tier-aware probe
export const routingApi = {
  getConfig: () => request('/routing/config'),
  getDefaults: () => request('/routing/defaults'),
  updateConfig: (data) => request('/routing/config', { method: 'PUT', body: JSON.stringify(data) }),
  getStatus: () => request('/routing/status'),
  rebuild: () => request('/routing/rebuild', { method: 'POST', body: '{}' }),
  probe: (utterance) => request('/routing/probe', { method: 'POST', body: JSON.stringify({ utterance }) }),
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

// Notebook Git Config
export const notebookGitApi = {
  getConfig: () => request('/notebooks/git/config'),
  updateConfig: (data) => request('/notebooks/git/config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: () => request('/notebooks/git/test-connection', { method: 'POST', body: '{}' }),
  listBranches: () => request('/notebooks/git/branches'),
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


// Users (Access Control)
export const usersApi = {
  getAll: () => request('/users'),
  getById: (id) => request(`/users/${id}`),
  create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
};

// Roles (Access Control)
export const rolesApi = {
  getAll: () => request('/roles'),
  getById: (id) => request(`/roles/${id}`),
  create: (data) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  // Sampled field names for the fls (hidden fields) pickers
  getTableFields: (table) => request(`/roles/table-fields/${encodeURIComponent(table)}`),
};
