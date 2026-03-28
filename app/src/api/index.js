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

// Clients
export const clientsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/clients${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/clients/${id}`),
  create: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
};

// Projects
export const projectsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/projects${query ? `?${query}` : ''}`);
  },
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
    const res = await fetch(`${BASE}/reports/timesheet-pdf?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Download failed: ${res.status}`);
    }
    return res.blob();
  },
  getTimesheetPdfBlob: async (clientId, projectId, startDate, endDate) => {
    const params = new URLSearchParams({ clientId, startDate, endDate, projectId });
    const res = await fetch(`${BASE}/reports/timesheet-pdf?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getExpensePdfBlob: async (clientId, projectId, startDate, endDate) => {
    const params = new URLSearchParams({ clientId, startDate, endDate, projectId });
    const res = await fetch(`${BASE}/reports/expense-pdf?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getIncomeExpensePdfBlob: async (startDate, endDate) => {
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${BASE}/reports/income-expense-pdf?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getIncomeExpenseCsvBlob: async (startDate, endDate) => {
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${BASE}/reports/income-expense-csv?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CSV generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getVatPdfBlob: async (startDate, endDate) => {
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${BASE}/reports/vat-pdf?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getVatCsvBlob: async (startDate, endDate) => {
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${BASE}/reports/vat-csv?${params}`, { headers: { 'X-Trace-Id': getTraceId() } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `CSV generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getCombinedPdfBlob: async (reports) => {
    const res = await fetch(`${BASE}/reports/combined-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trace-Id': getTraceId() },
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
  parseReceipts: async (files) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${BASE}/expenses/parse-receipts`, {
      method: 'POST',
      headers: { 'X-Trace-Id': getTraceId() },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Parse failed: ${res.status}`);
    }
    return res.json();
  },
  uploadAttachments: async (id, files) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch(`${BASE}/expenses/${id}/attachments`, {
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
  addLine: (id, items) => request(`/invoices/${id}/add-line`, { method: 'POST', body: JSON.stringify({ items }) }),
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
  getAccounts: () => request('/transactions/accounts'),
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
    const res = await fetch(`${BASE}/import-jobs`, { method: 'POST', headers: { 'X-Trace-Id': getTraceId() }, body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.json();
  },
  update: async (id, data) => {
    // Support both FormData (file re-upload) and plain object
    if (data instanceof FormData) {
      const res = await fetch(`${BASE}/import-jobs/${id}`, { method: 'PUT', headers: { 'X-Trace-Id': getTraceId() }, body: data });
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

// Calendar Events
export const calendarEventsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/calendar-events${query ? `?${query}` : ''}`);
  },
  refreshAll: () => request('/calendar-sources/refresh-all', { method: 'POST', body: '{}' }),
};

// Tickets
export const ticketsApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/tickets${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/tickets/${id}`),
  patch: (id, data) => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  bulkImport: (data) => request('/tickets', { method: 'POST', body: JSON.stringify(data) }),
  refreshAll: () => request('/ticket-sources/refresh-all', { method: 'POST', body: '{}' }),
};

// Notebooks
export const notebooksApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/notebooks${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/notebooks/${id}`),
  create: (data) => request('/notebooks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/notebooks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/notebooks/${id}`, { method: 'DELETE' }),
  restore: (id) => request(`/notebooks/${id}/restore`, { method: 'POST', body: '{}' }),
  archive: (id) => request(`/notebooks/${id}/archive`, { method: 'POST', body: '{}' }),
  unarchive: (id) => request(`/notebooks/${id}/unarchive`, { method: 'POST', body: '{}' }),
  purge: (id) => request(`/notebooks/${id}/purge`, { method: 'DELETE' }),
  publish: (id, message) => request(`/notebooks/${id}/publish`, { method: 'POST', body: JSON.stringify({ message }) }),
  discard: (id) => request(`/notebooks/${id}/discard`, { method: 'POST', body: '{}' }),
  getContent: async (id) => {
    const res = await fetch(`${BASE}/notebooks/${id}/content`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.text();
  },
  updateContent: (id, content) => request(`/notebooks/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }),
  getTags: () => request('/notebooks/tags'),
  uploadMedia: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/notebooks/${id}/media`, {
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
  getMediaUrl: (id, filename) => `${BASE}/notebooks/${id}/media/${encodeURIComponent(filename)}`,
  listArtifacts: (id) => request(`/notebooks/${id}/artifacts`),
  uploadArtifact: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/notebooks/${id}/artifacts`, {
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
  readArtifact: async (id, filename) => {
    const res = await fetch(`${BASE}/notebooks/${id}/artifacts/${encodeURIComponent(filename)}/content`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Read failed: ${res.status}`);
    }
    return res.text();
  },
  deleteArtifact: (id, filename) => request(`/notebooks/${id}/artifacts/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  renameArtifact: (id, filename, newName) => request(`/notebooks/${id}/artifacts/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    body: JSON.stringify({ newName }),
  }),
  getPdf: async (id) => {
    const res = await fetch(`${BASE}/notebooks/${id}/pdf`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PDF generation failed: ${res.status}`);
    }
    return res.blob();
  },
  getHistory: (id) => request(`/notebooks/${id}/history`),
  getCommitDiff: async (id, hash) => {
    const res = await fetch(`${BASE}/notebooks/${id}/history/${hash}`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.text();
  },
  getCompareDiff: async (id, from, to) => {
    const res = await fetch(`${BASE}/notebooks/${id}/compare/${from}/${to}`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    return res.text();
  },
  hasRemote: () => request('/notebooks/git/has-remote'),
  preparePush: () => request('/notebooks/git/push/prepare', { method: 'POST', body: '{}' }),
  executePush: (force = false) => request('/notebooks/git/push/execute', { method: 'POST', body: JSON.stringify({ force }) }),
  preparePull: () => request('/notebooks/git/pull/prepare', { method: 'POST', body: '{}' }),
  executePull: (force = false) => request('/notebooks/git/pull/execute', { method: 'POST', body: JSON.stringify({ force }) }),
  getOperation: () => request('/notebooks/git/operation'),
  clearOperation: () => request('/notebooks/git/operation/clear', { method: 'POST', body: '{}' }),
  importNotebook: async (formData) => {
    const res = await fetch(`${BASE}/notebooks/import`, {
      method: 'POST',
      headers: { 'X-Trace-Id': getTraceId() },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Import failed: ${res.status}`);
    }
    return res.json();
  },
};

// Daily Plans
export const dailyPlansApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/daily-plans${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/daily-plans/${id}`),
  create: (data) => request('/daily-plans', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/daily-plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/daily-plans/${id}`, { method: 'DELETE' }),
  getContent: async (id) => {
    const res = await fetch(`${BASE}/daily-plans/${id}/content`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const data = await res.json();
    return data.content;
  },
  updateContent: (id, content) => request(`/daily-plans/${id}/content`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  }),
  addTodo: (id, todoId) => request(`/daily-plans/${id}/todos`, { method: 'POST', body: JSON.stringify({ todoId }) }),
  removeTodo: (id, todoId) => request(`/daily-plans/${id}/todos/${todoId}`, { method: 'DELETE' }),
  addTimesheet: (id, timesheetId) => request(`/daily-plans/${id}/timesheets`, { method: 'POST', body: JSON.stringify({ timesheetId }) }),
  addMeetingNote: (id, data) => request(`/daily-plans/${id}/meeting-notes`, { method: 'POST', body: JSON.stringify(data) }),
  changeDate: (id, newDate) => request(`/daily-plans/${id}/change-date`, { method: 'PUT', body: JSON.stringify({ newDate }) }),
  generateRecap: (id) => request(`/daily-plans/${id}/recap`, { method: 'POST', body: '{}' }),
  getRecap: async (id) => {
    const res = await fetch(`${BASE}/daily-plans/${id}/recap`, {
      headers: { 'X-Trace-Id': getTraceId() },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const data = await res.json();
    return data.content;
  },
  getRecapStatus: (id) => request(`/daily-plans/${id}/recap/status`),
  generateTimesheetDescription: (id) => request(`/daily-plans/${id}/timesheet-description`, { method: 'POST', body: '{}' }),
};

// Todos
export const todosApi = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/todos${query ? `?${query}` : ''}`);
  },
  getById: (id) => request(`/todos/${id}`),
  create: (data) => request('/todos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/todos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/todos/${id}`, { method: 'DELETE' }),
  getIncomplete: () => request('/todos/incomplete'),
};

// Dashboard
export const dashboardApi = {
  getOperations: () => request('/dashboard/operations'),
  getInvoiceCoverage: (start, end) => request(`/dashboard/invoice-coverage?start=${start}&end=${end}`),
  getReconciliation: (params = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, v);
    }
    const query = qs.toString();
    return request(`/dashboard/reconciliation${query ? `?${query}` : ''}`);
  },
  getFinancial: (startDate, endDate) =>
    request(`/dashboard/financial?startDate=${startDate}&endDate=${endDate}`),
};

