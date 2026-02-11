const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Clients
export const clientsApi = {
  getAll: () => request('/clients'),
  getById: (id) => request(`/clients/${id}`),
  create: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
};

// Projects
export const projectsApi = {
  getAll: () => request('/projects'),
  getById: (id) => request(`/projects/${id}`),
  create: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
};

// Timesheets
export const timesheetsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/timesheets${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/timesheets/${id}`),
  create: (data) => request('/timesheets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/timesheets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/timesheets/${id}`, { method: 'DELETE' }),
};

// Settings
export const settingsApi = {
  get: () => request('/settings'),
  update: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// Reports
export const reportsApi = {
  downloadTimesheetPdf: async (clientId, startDate, endDate) => {
    const params = new URLSearchParams({ clientId, startDate, endDate });
    const res = await fetch(`${BASE}/reports/timesheet-pdf?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Download failed: ${res.status}`);
    }
    return res.blob();
  },
  getTimesheetPdfBlob: async (clientId, projectId, startDate, endDate) => {
    const params = new URLSearchParams({ clientId, startDate, endDate, projectId });
    const res = await fetch(`${BASE}/reports/timesheet-pdf?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
};

// Documents
export const documentsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/documents${query ? `?${query}` : ''}`);
  },
  getFileUrl: (id) => `${BASE}/documents/${id}/file`,
  save: (data) => request('/documents', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
};
