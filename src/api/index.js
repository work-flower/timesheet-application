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
  getExpensePdfBlob: async (clientId, projectId, startDate, endDate) => {
    const params = new URLSearchParams({ clientId, startDate, endDate, projectId });
    const res = await fetch(`${BASE}/reports/expense-pdf?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getCombinedPdfBlob: async (reports) => {
    const res = await fetch(`${BASE}/reports/combined-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Combined PDF generation failed: ${res.status}`);
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

// Expenses
export const expensesApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/expenses${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/expenses/${id}`),
  getTypes: () => request('/expenses/types'),
  create: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
  linkTransaction: (id, transactionId) => request(`/expenses/${id}/link-transaction`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  unlinkTransaction: (id, transactionId) => request(`/expenses/${id}/unlink-transaction`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  uploadAttachments: async (id, files) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${BASE}/expenses/${id}/attachments`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },
  deleteAttachment: (id, filename) =>
    request(`/expenses/${id}/attachments/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  getAttachmentUrl: (id, filename) =>
    `${BASE}/expenses/${id}/attachments/${encodeURIComponent(filename)}`,
  getThumbnailUrl: (id, filename) =>
    `${BASE}/expenses/${id}/attachments/${encodeURIComponent(filename)}/thumbnail`,
};

// Invoices
export const invoicesApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/invoices${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/invoices/${id}`),
  create: (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
  confirm: (id) => request(`/invoices/${id}/confirm`, { method: 'POST', body: '{}' }),
  post: (id) => request(`/invoices/${id}/post`, { method: 'POST', body: '{}' }),
  unconfirm: (id) => request(`/invoices/${id}/unconfirm`, { method: 'POST', body: '{}' }),
  recalculate: (id) => request(`/invoices/${id}/recalculate`, { method: 'POST', body: '{}' }),
  consistencyCheck: (id) => request(`/invoices/${id}/consistency-check`, { method: 'POST', body: '{}' }),
  updatePayment: (id, data) => request(`/invoices/${id}/payment`, { method: 'PUT', body: JSON.stringify(data) }),
  linkTransaction: (id, transactionId) => request(`/invoices/${id}/link-transaction`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  unlinkTransaction: (id, transactionId) => request(`/invoices/${id}/unlink-transaction`, { method: 'POST', body: JSON.stringify({ transactionId }) }),
  getPdfUrl: (id) => `${BASE}/invoices/${id}/pdf`,
  getFileUrl: (id) => `${BASE}/invoices/${id}/file`,
};

// Transactions
export const transactionsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/transactions${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/transactions/${id}`),
  create: (data) => request('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  updateMapping: (id, data) => request(`/transactions/${id}/mapping`, { method: 'PUT', body: JSON.stringify(data) }),
  getMetadata: () => request('/transactions/$metadata'),
};

// Import Jobs
export const importJobsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/import-jobs${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/import-jobs/${id}`),
  create: async (formData) => {
    // formData is a FormData object — no Content-Type header (browser sets multipart boundary)
    const res = await fetch(`${BASE}/import-jobs`, { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
  },
  update: async (id, data) => {
    // Support both FormData (file re-upload) and plain object
    if (data instanceof FormData) {
      const res = await fetch(`${BASE}/import-jobs/${id}`, { method: 'PUT', body: data });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      return res.json();
    }
    return request(`/import-jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  delete: (id) => request(`/import-jobs/${id}`, { method: 'DELETE' }),
  abandon: (id) => request(`/import-jobs/${id}/abandon`, { method: 'POST', body: '{}' }),
};

// Staged Transactions
export const stagedTransactionsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/staged-transactions${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/staged-transactions/${id}`),
  create: (data) => request('/staged-transactions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/staged-transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/staged-transactions/${id}`, { method: 'DELETE' }),
  submit: (importJobId, fieldMapping) => request('/staged-transactions/submit', { method: 'POST', body: JSON.stringify({ importJobId, fieldMapping }) }),
  checkDuplicates: (importJobId) => request('/staged-transactions/check-duplicates', { method: 'POST', body: JSON.stringify({ importJobId }) }),
};

// AI Config
export const aiConfigApi = {
  getConfig: () => request('/ai-config'),
  updateConfig: (data) => request('/ai-config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/ai-config/test-connection', { method: 'POST', body: JSON.stringify(data) }),
};

// Backup
export const backupApi = {
  getConfig: () => request('/backup/config'),
  updateConfig: (data) => request('/backup/config', { method: 'PUT', body: JSON.stringify(data) }),
  testConnection: (data) => request('/backup/test-connection', { method: 'POST', body: JSON.stringify(data) }),
  create: () => request('/backup/create', { method: 'POST', body: JSON.stringify({}) }),
  list: () => request('/backup/list'),
  restore: (backupKey) => request('/backup/restore', { method: 'POST', body: JSON.stringify({ backupKey }) }),
  delete: (key) => request(`/backup/${encodeURIComponent(key)}`, { method: 'DELETE' }),
};
