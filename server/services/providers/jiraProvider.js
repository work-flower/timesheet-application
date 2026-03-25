const MAX_RESULTS_PER_PAGE = 50;

function authHeader(source) {
  const token = Buffer.from(`${source.email}:${source.apiToken}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

export async function testConnection(source) {
  const url = `${source.baseUrl.replace(/\/+$/, '')}/rest/api/3/myself`;
  const res = await fetch(url, { headers: authHeader(source) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira connection failed (${res.status}): ${body}`);
  }
  return { ok: true };
}

export async function fetchTickets(source) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const jql = source.preQuery || 'updated >= -30d ORDER BY updated DESC';
  const fields = 'summary,description,status,issuetype,assignee,priority,project,sprint,updated,created,comment';

  let allIssues = [];
  let nextPageToken = null;

  while (true) {
    const body = {
      jql,
      fields: fields.split(','),
      expand: ['renderedFields'],
      maxResults: MAX_RESULTS_PER_PAGE,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: authHeader(source),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira search failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    allIssues = allIssues.concat(data.issues || []);

    if (!data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }

  return allIssues.map((issue) => mapToCanonical(issue, source));
}

function mapToCanonical(issue, source) {
  const fields = issue.fields || {};
  const rendered = issue.renderedFields || {};
  const sprint = fields.sprint;
  const sprintName = sprint?.name || null;

  // Extract inline comments — prefer rendered HTML from renderedFields
  const commentField = fields.comment || {};
  const renderedCommentField = rendered.comment || {};
  const renderedComments = renderedCommentField.comments || [];
  const rawComments = commentField.comments || [];
  const inlineComments = rawComments.map((c, i) => ({
    id: c.id,
    author: c.author?.displayName || c.updateAuthor?.displayName || '',
    body: renderedComments[i]?.body || extractText(c.body),
    format: renderedComments[i]?.body ? 'html' : 'text',
    created: c.created || '',
  }));
  const hasMoreComments = (commentField.total || 0) > inlineComments.length;

  return {
    externalId: issue.key,
    title: fields.summary || '',
    description: truncate(extractText(fields.description), 500),
    state: fields.status?.name || '',
    type: fields.issuetype?.name || '',
    assignedTo: fields.assignee?.displayName || '',
    sprint: sprintName,
    areaPath: fields.project?.key || '',
    priority: fields.priority?.name || '',
    project: fields.project?.name || '',
    url: `${source.baseUrl.replace(/\/+$/, '')}/browse/${issue.key}`,
    created: fields.created || '',
    updated: fields.updated || '',
    _comments: inlineComments,
    _hasMoreComments: hasMoreComments,
  };
}

export async function fetchTicketById(source, externalId) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const fields = 'summary,description,status,issuetype,assignee,priority,project,sprint,updated,created';
  const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(externalId)}?fields=${fields}`;
  const res = await fetch(url, { headers: authHeader(source) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira issue fetch failed (${res.status}): ${body}`);
  }
  const issue = await res.json();
  return mapToCanonical(issue, source);
}

export async function fetchComments(source, externalId) {
  const baseUrl = source.baseUrl.replace(/\/+$/, '');
  const allComments = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const url = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(externalId)}/comment?startAt=${startAt}&maxResults=${maxResults}&expand=renderedBody`;
    const res = await fetch(url, { headers: authHeader(source) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jira comments fetch failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    const comments = data.comments || [];
    allComments.push(...comments);
    if (startAt + comments.length >= (data.total || 0)) break;
    startAt += comments.length;
  }

  return allComments.map((c) => ({
    id: c.id,
    author: c.author?.displayName || c.updateAuthor?.displayName || '',
    body: c.renderedBody || extractText(c.body),
    format: c.renderedBody ? 'html' : 'text',
    created: c.created || '',
  }));
}

function extractText(description) {
  if (!description) return '';
  if (typeof description === 'string') return description;
  // Atlassian Document Format — extract text from content nodes
  try {
    const texts = [];
    const walk = (node) => {
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach(walk);
    };
    walk(description);
    return texts.join(' ');
  } catch {
    return '';
  }
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '...';
}
