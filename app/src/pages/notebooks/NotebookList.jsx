import { useState, useCallback, useRef, useEffect } from 'react';
import {
  makeStyles, tokens, Text, Card, Badge, Input, Spinner, Button, ToggleButton, Tooltip,
  Breadcrumb, BreadcrumbItem,
} from '@fluentui/react-components';
import {
  SearchRegular, AddRegular, DocumentTextRegular, ArrowImportRegular, ArchiveRegular,
  ArrowUploadRegular, ArrowDownloadRegular, NoteRegular,
} from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { notebooksApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { PushWizard, PullWizard, useGitOperation } from './NotebookGitWizards.jsx';

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: { padding: '16px 16px 0 16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexWrap: 'wrap',
  },
  grid: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  cards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
  },
  card: {
    width: '300px',
    padding: '0',
    cursor: 'pointer',
    overflow: 'hidden',
    transitionProperty: 'box-shadow, transform',
    transitionDuration: '200ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      boxShadow: tokens.shadow16,
      transform: 'translateY(-2px)',
    },
  },
  cardThumbnail: {
    width: '100%',
    height: '140px',
    objectFit: 'cover',
    display: 'block',
  },
  cardAccent: {
    height: '4px',
    backgroundColor: tokens.colorBrandBackground,
  },
  cardBody: {
    padding: '16px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  cardIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground2,
    fontSize: '16px',
    flexShrink: 0,
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  cardSummary: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: tokens.lineHeightBase200,
    marginBottom: '10px',
    minHeight: '32px',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    flex: 1,
  },
  badges: {
    display: 'flex',
    gap: '4px',
    flexShrink: 0,
  },
  loading: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
  },
  empty: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  dateText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginTop: '6px',
    display: 'block',
  },
});

const ragScoreColors = {
  low: 'danger',
  'low-moderate': 'warning',
  moderate: 'warning',
  'moderate-high': 'success',
  high: 'success',
};

export default function NotebookList() {
  const styles = useStyles();
  const { navigate } = useAppNavigate();


  // --- Notebook-specific search & tag filters (injected into $filter via apiFn) ---

  const SEARCH_FIELDS = [
    'title', 'thumbnailFilename', 'createdAt', 'updatedAt',
    'tagsAll', 'relatedProjectNamesAll', 'relatedClientNamesAll', 'relatedTimesheetLabelsAll', 'relatedTicketLabelsAll',
  ];

  const buildSearchClause = useCallback((keyword) => {
    if (!keyword) return '';
    const escaped = keyword.replace(/'/g, "''");
    const parts = SEARCH_FIELDS.map((f) => `contains(${f},'${escaped}')`);
    return `(${parts.join(' or ')})`;
  }, []);

  // Restore search from URL $filter on mount
  const initFilter = new URLSearchParams(window.location.search).get('$filter') || '';
  const searchOrGroupRe = /\(contains\(\w+,'([^']*)'\)(?:\s+or\s+contains\(\w+,'[^']*'\))*\)/;
  const initSearchMatch = initFilter.match(searchOrGroupRe);

  const [searchInput, setSearchInput] = useState(
    initSearchMatch ? initSearchMatch[1].replace(/''/g, "'") : ''
  );
  const searchRef = useRef(initSearchMatch ? initSearchMatch[1].replace(/''/g, "'") : '');

  const [includeMeetingNotes, setIncludeMeetingNotes] = useState(false);
  const includeMeetingNotesRef = useRef(false);

  // Inject search and type filter into $filter alongside hook-managed filters
  const apiFn = useCallback((params) => {
    const clauses = [];
    const searchClause = buildSearchClause(searchRef.current);
    if (searchClause) clauses.push(searchClause);
    if (!includeMeetingNotesRef.current) clauses.push("type ne 'meeting-note'");
    if (clauses.length > 0) {
      const existing = params.$filter || '';
      const combined = clauses.join(' and ');
      params.$filter = existing ? `${combined} and ${existing}` : combined;
    }
    return notebooksApi.getAll(params);
  }, [buildSearchClause]);

  const {
    getFilterValue, setFilterValues,
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
  } = useODataList({
    key: 'notebooks',
    apiFn,
    filters: [
      { id: 'status', field: 'status', operator: 'eq', defaultValue: 'active', type: 'string' },
    ],
    defaultOrderBy: 'updatedAt desc',
    defaultPageSize: 20,
  });

  const status = getFilterValue('status');
  const includeArchived = !status;


  // --- Import ---
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset so same files can be re-selected
    if (files.length === 0) return;

    const mdExts = ['.md', '.markdown'];
    const mdFiles = files.filter((f) => mdExts.some((ext) => f.name.toLowerCase().endsWith(ext)));

    if (mdFiles.length === 0) {
      alert('No markdown file found in the selection. Import requires at least one .md file.');
      return;
    }

    // Pick the largest markdown as content
    const contentFile = mdFiles.reduce((a, b) => (b.size > a.size ? b : a));
    const resourceFiles = files.filter((f) => f !== contentFile);

    // Read content markdown
    const contentText = await contentFile.text();

    // Build FormData
    const formData = new FormData();
    formData.append('content', contentText);
    for (const file of resourceFiles) {
      formData.append('files', file);
    }

    setImporting(true);
    try {
      const result = await notebooksApi.importNotebook(formData);
      navigate(`/notebooks/${result._id}/`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }, [navigate]);

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // --- Remote status & wizards ---
  const [hasRemote, setHasRemote] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const gitOp = useGitOperation();

  useEffect(() => {
    notebooksApi.hasRemote().then((r) => setHasRemote(r.hasRemote)).catch(() => {});
  }, []);

  const isOpRunning = gitOp.op?.status === 'running';
  const opFinished = gitOp.op && gitOp.op.status !== 'running';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Notebook</Text>
      </div>

      <CommandBar
        onNew={() => navigate('/notebooks/new')}
        newLabel="New Notebook"
      >
        <Tooltip content={hasRemote ? 'Pull from remote' : 'Configure git upstream in Admin to enable'} relationship="label">
          <Button
            appearance="subtle"
            icon={<ArrowDownloadRegular />}
            size="small"
            disabled={!hasRemote}
            onClick={() => setPullOpen(true)}
            style={{ position: 'relative' }}
          >
            Pull
            {(isOpRunning && gitOp.op?.type === 'pull') && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 }} />
            )}
            {(opFinished && gitOp.op?.type === 'pull') && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', backgroundColor: gitOp.op.status === 'done' ? tokens.colorPaletteGreenBackground3 : tokens.colorPaletteRedBackground3 }} />
            )}
          </Button>
        </Tooltip>
        <Tooltip content={hasRemote ? 'Push to remote' : 'Configure git upstream in Admin to enable'} relationship="label">
          <Button
            appearance="subtle"
            icon={<ArrowUploadRegular />}
            size="small"
            disabled={!hasRemote}
            onClick={() => setPushOpen(true)}
            style={{ position: 'relative' }}
          >
            Push
            {(isOpRunning && gitOp.op?.type === 'push') && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 }} />
            )}
            {(opFinished && gitOp.op?.type === 'push') && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', backgroundColor: gitOp.op.status === 'done' ? tokens.colorPaletteGreenBackground3 : tokens.colorPaletteRedBackground3 }} />
            )}
          </Button>
        </Tooltip>
        <Button
          appearance="subtle"
          icon={<ArrowImportRegular />}
          size="small"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? 'Importing...' : 'Import'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleImportFiles}
        />
      </CommandBar>

      <div className={styles.filters}>
        <Input
          contentBefore={<SearchRegular />}
          placeholder="Search... (press Enter)"
          size="small"
          value={searchInput}
          onChange={(e, data) => setSearchInput(data.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              searchRef.current = searchInput.trim();
              refresh();
            }
          }}
          onBlur={() => {
            if (!searchInput.trim() && searchRef.current) {
              searchRef.current = '';
              refresh();
            }
          }}
          style={{ minWidth: '220px' }}
        />
        <ToggleButton
          appearance="subtle"
          size="small"
          icon={<ArchiveRegular />}
          checked={includeArchived}
          onClick={() => setFilterValues({ status: includeArchived ? 'active' : '' })}
        >
          Include Archived
        </ToggleButton>
        <ToggleButton
          appearance="subtle"
          size="small"
          icon={<NoteRegular />}
          checked={includeMeetingNotes}
          onClick={() => {
            const next = !includeMeetingNotes;
            setIncludeMeetingNotes(next);
            includeMeetingNotesRef.current = next;
            refresh();
          }}
        >
          Include Meeting Notes
        </ToggleButton>
      </div>

      <div className={styles.grid}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading notebooks..." /></div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <Text>{searchRef.current ? 'No notebooks match your search.' : 'No notebooks yet. Create your first one!'}</Text>
          </div>
        ) : (
          <div className={styles.cards}>
            {items.map((notebook) => (
              <Card
                key={notebook._id}
                className={styles.card}
                onClick={() => navigate(`/notebooks/${notebook._id}/`)}
              >
                <div className={styles.cardAccent} />
                {notebook.thumbnailUrl && (
                  <img src={notebook.thumbnailUrl} alt="" className={styles.cardThumbnail} />
                )}
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardIcon}>
                      <DocumentTextRegular />
                    </span>
                    <Text className={styles.cardTitle}>{notebook.title || 'Untitled'}</Text>
                  </div>
                  <Text className={styles.cardSummary}>
                    {notebook.summary || 'No summary'}
                  </Text>
                  <div className={styles.cardFooter}>
                    <div className={styles.tags}>
                      {(notebook.tags || []).slice(0, 3).map((tag) => (
                        <Badge key={tag} appearance="tint" size="small" color="brand">{tag}</Badge>
                      ))}
                      {(notebook.tags || []).length > 3 && (
                        <Badge appearance="tint" size="small" color="subtle">+{notebook.tags.length - 3}</Badge>
                      )}
                    </div>
                    <div className={styles.badges}>
                      {notebook.isDraft && (
                        <Badge appearance="filled" color="warning" size="small">Draft</Badge>
                      )}
                      {notebook.ragScore && (
                        <Badge appearance="filled" color={ragScoreColors[notebook.ragScore] || 'informative'} size="small">
                          {notebook.ragScore}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {((notebook.relatedProjectNames?.length > 0) || (notebook.relatedClientNames?.length > 0) || (notebook.relatedTimesheetLabels?.length > 0) || (notebook.relatedTicketLabels?.length > 0)) && (
                    <div className={styles.tags} style={{ marginTop: '6px' }}>
                      {(notebook.relatedProjectNames || []).map((name) => (
                        <Badge key={`p-${name}`} appearance="tint" size="small" color="informative">{name}</Badge>
                      ))}
                      {(notebook.relatedClientNames || []).map((name) => (
                        <Badge key={`c-${name}`} appearance="tint" size="small" color="success">{name}</Badge>
                      ))}
                      {(notebook.relatedTimesheetLabels || []).map((label) => (
                        <Badge key={`t-${label}`} appearance="tint" size="small" color="subtle">{label}</Badge>
                      ))}
                      {(notebook.relatedTicketLabels || []).map((label) => (
                        <Badge key={`tk-${label}`} appearance="tint" size="small" color="important">{label}</Badge>
                      ))}
                    </div>
                  )}
                  <Text className={styles.dateText}>
                    Updated {formatDate(notebook.updatedAt)}
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalCount}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />

      <PushWizard open={pushOpen} onClose={() => setPushOpen(false)} onDone={refresh} gitOp={gitOp} />
      <PullWizard open={pullOpen} onClose={() => setPullOpen(false)} onDone={refresh} gitOp={gitOp} />
    </div>
  );
}
