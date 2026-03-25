const BATCH_SIZE = 200;

const FIELDS = [
  'System.Title', 'System.Description', 'System.State', 'System.WorkItemType',
  'System.AssignedTo', 'Microsoft.VSTS.Common.Priority', 'System.AreaPath',
  'System.IterationPath', 'System.CreatedDate', 'System.ChangedDate',
  'System.TeamProject', 'System.Rev',
];

function authHeader(source) {
  const token = Buffer.from(`:${source.pat}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

function orgAndProject(baseUrl) {
  // baseUrl can be:
  //   https://dev.azure.com/{org}
  //   https://dev.azure.com/{org}/{project}
  const url = new URL(baseUrl.replace(/\/+$/, ''));
  const parts = url.pathname.split('/').filter(Boolean);
  return { org: parts[0] || '', project: parts[1] || '' };
}

export async function testConnection(source) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const apiVer = source.apiVersion || '7.1';
  const res = await fetch(`${baseUrl}/_apis/projects?$top=1&api-version=${apiVer}`, { headers: authHeader(source) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure DevOps connection failed (${res.status}): ${body}`);
  }
  return { ok: true };
}

export async function fetchTickets(source) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const apiVer = source.apiVersion || '7.1';
  const headers = authHeader(source);

  // Step 1: Run WIQL query to get work item IDs
  const wiql = source.preQuery || `SELECT [System.Id] FROM WorkItems WHERE [System.ChangedDate] >= @Today - 30 ORDER BY [System.ChangedDate] DESC`;

  const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=${apiVer}`;
  const wiqlRes = await fetch(wiqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: wiql }),
  });
  if (!wiqlRes.ok) {
    const body = await wiqlRes.text();
    throw new Error(`Azure DevOps WIQL query failed (${wiqlRes.status}): ${body}`);
  }
  const wiqlData = await wiqlRes.json();
  const ids = (wiqlData.workItems || []).map((wi) => wi.id);

  if (ids.length === 0) return [];

  // Step 2: Fetch work item details in batches
  const allItems = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    const idsParam = batchIds.join(',');
    const fields = FIELDS.join(',');
    const detailUrl = `${baseUrl}/_apis/wit/workitems?ids=${idsParam}&fields=${fields}&api-version=${apiVer}`;
    const detailRes = await fetch(detailUrl, { headers });
    if (!detailRes.ok) {
      const body = await detailRes.text();
      throw new Error(`Azure DevOps work items fetch failed (${detailRes.status}): ${body}`);
    }
    const detailData = await detailRes.json();
    allItems.push(...(detailData.value || []));
  }

  return allItems.map((wi) => mapToCanonical(wi, source));
}

function mapToCanonical(wi, source) {
  const f = wi.fields || {};
  const iterationPath = f['System.IterationPath'] || '';
  // Extract sprint name from iteration path (last segment)
  const sprintName = iterationPath.includes('\\')
    ? iterationPath.split('\\').pop()
    : iterationPath.includes('/')
      ? iterationPath.split('/').pop()
      : iterationPath;

  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const project = f['System.TeamProject'] || '';

  return {
    externalId: String(wi.id),
    title: f['System.Title'] || '',
    description: truncate(stripHtml(f['System.Description'] || ''), 500),
    state: f['System.State'] || '',
    type: f['System.WorkItemType'] || '',
    assignedTo: typeof f['System.AssignedTo'] === 'string'
      ? f['System.AssignedTo'].replace(/<[^>]*>/, '').trim()
      : f['System.AssignedTo']?.displayName || '',
    sprint: sprintName || null,
    areaPath: f['System.AreaPath'] || '',
    priority: priorityLabel(f['Microsoft.VSTS.Common.Priority']),
    project,
    url: `${baseUrl}/${encodeURIComponent(project)}/_workitems/edit/${wi.id}`,
    rev: f['System.Rev'] || null,
    created: f['System.CreatedDate'] || '',
    updated: f['System.ChangedDate'] || '',
  };
}

export async function fetchTicketById(source, externalId) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const apiVer = source.apiVersion || '7.1';
  const headers = authHeader(source);
  const fields = FIELDS.join(',');
  const url = `${baseUrl}/_apis/wit/workitems/${externalId}?fields=${fields}&api-version=${apiVer}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure DevOps work item fetch failed (${res.status}): ${body}`);
  }
  const wi = await res.json();
  return mapToCanonical(wi, source);
}

export async function fetchComments(source, externalId, project) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const apiVer = source.apiVersion || '7.1';
  const headers = authHeader(source);
  // Comments endpoint requires the project segment in the URL path
  // Request renderedText to resolve identity GUIDs in markdown mentions to display names
  const projectSegment = project ? `/${encodeURIComponent(project)}` : '';
  const url = `${baseUrl}${projectSegment}/_apis/wit/workitems/${externalId}/comments?$expand=renderedText&api-version=${apiVer}-preview.4`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure DevOps comments fetch failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return (data.comments || []).map((c) => ({
    id: String(c.id),
    author: c.createdBy?.displayName || '',
    // Prefer renderedText (HTML with resolved mentions) over raw text
    body: c.renderedText || c.text || '',
    format: c.renderedText ? 'html' : (c.format || 'text'),
    created: c.createdDate || '',
  }));
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '...';
}

function priorityLabel(val) {
  const map = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };
  return map[val] || (val != null ? String(val) : '');
}
