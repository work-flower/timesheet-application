// Pure functions for deriving notebook metadata from markdown content.
// Imported by both the server (plain saves) and the client (encrypted saves —
// client must derive metadata before encryption since the server can't read ciphertext).

export function extractEntityReferences(markdown) {
  const relatedProjects = new Set();
  const relatedClients = new Set();
  const relatedTimesheets = new Set();
  const relatedTickets = new Set();

  const regex = /\[([^\]]*)\]\(\/(projects|clients|timesheets|tickets)\/([a-zA-Z0-9_-]+)\)/g;
  let match;
  while ((match = regex.exec(markdown || '')) !== null) {
    const [, , entityType, entityId] = match;
    if (entityType === 'projects') relatedProjects.add(entityId);
    else if (entityType === 'clients') relatedClients.add(entityId);
    else if (entityType === 'timesheets') relatedTimesheets.add(entityId);
    else if (entityType === 'tickets') relatedTickets.add(entityId);
  }

  return {
    relatedProjects: [...relatedProjects],
    relatedClients: [...relatedClients],
    relatedTimesheets: [...relatedTimesheets],
    relatedTickets: [...relatedTickets],
  };
}

export function parseContentMeta(markdown) {
  const lines = (markdown || '').split('\n');
  let title = '';
  let summary = '';
  let tags = [];

  let titleLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      titleLineIdx = i;
      break;
    }
  }
  if (titleLineIdx === -1) return { title, summary, tags };

  const titleLine = lines[titleLineIdx].trim();
  if (/^#{1,6}\s+/.test(titleLine)) {
    title = titleLine.replace(/^#{1,6}\s+/, '');
  } else {
    const dotIdx = titleLine.indexOf('.');
    if (dotIdx >= 0) {
      title = titleLine.slice(0, dotIdx + 1);
    } else {
      title = titleLine;
    }
  }
  if (title.length > 200) {
    const cut = title.lastIndexOf(' ', 200);
    title = cut > 0 ? title.slice(0, cut) : title.slice(0, 200);
  }

  let summaryStart = -1;
  for (let i = titleLineIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      summaryStart = i;
      break;
    }
  }
  if (summaryStart >= 0) {
    const paraLines = [];
    for (let i = summaryStart; i < lines.length; i++) {
      if (lines[i].trim().length === 0) break;
      paraLines.push(lines[i].trim());
    }
    summary = paraLines.join(' ');

    if (summary.length > 500) {
      const cut = summary.lastIndexOf(' ', 500);
      summary = cut > 0 ? summary.slice(0, cut) : summary.slice(0, 500);
    }

    const afterSummaryIdx = summaryStart + paraLines.length;
    for (let i = afterSummaryIdx; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        const candidate = lines[i].trim();
        const found = candidate.match(/#[a-zA-Z0-9_-]+/g);
        if (found) {
          tags = found.map((t) => t.slice(1));
        }
        break;
      }
    }
  }

  return { title, summary, tags };
}

// Returns the raw image reference string from the first ![alt](ref) in markdown,
// or null if no image. The reference may be a relative filename, absolute URL,
// or data: URI — caller decides how to handle each.
export function extractFirstImageRef(markdown) {
  const match = (markdown || '').match(/!\[.*?\]\(([^)]+)\)/);
  return match ? match[1] : null;
}
