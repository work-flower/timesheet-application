import { useState, useMemo } from 'react';
import {
  makeStyles, tokens, Text, Card, Badge, Button, Spinner,
  Breadcrumb, BreadcrumbItem, BreadcrumbButton, BreadcrumbDivider,
} from '@fluentui/react-components';
import { ArrowUndoRegular, DeleteRegular, DocumentTextRegular } from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { notebooksApi } from '../../api/index.js';
import useAppNavigate from '../../hooks/useAppNavigate.js';

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
    overflow: 'hidden',
    opacity: 0.8,
  },
  cardAccent: {
    height: '4px',
    backgroundColor: tokens.colorNeutralStroke2,
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
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
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
    color: tokens.colorNeutralForeground2,
  },
  cardSummary: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: tokens.lineHeightBase200,
    marginBottom: '10px',
    minHeight: '32px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  dateText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  loading: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
  },
  empty: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  breadcrumb: {
    marginBottom: '8px',
    padding: '8px 16px 0 16px',
  },
});

export default function NotebookBin() {
  const styles = useStyles();
  const { navigate, goBack } = useAppNavigate();
  const [purgeTarget, setPurgeTarget] = useState(null);

  const {
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
  } = useODataList({
    key: 'notebooks-bin',
    apiFn: notebooksApi.getAll,
    filters: [
      { id: 'status', field: 'status', operator: 'eq', defaultValue: 'deleted', type: 'string' },
    ],
    defaultOrderBy: 'deletedAt desc',
    defaultPageSize: 20,
  });

  // Client-side search
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((n) =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.summary || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleRestore = async (id, e) => {
    e.stopPropagation();
    try {
      await notebooksApi.restore(id);
      refresh();
    } catch (err) {
      console.error('Restore failed:', err);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    try {
      await notebooksApi.purge(purgeTarget);
      setPurgeTarget(null);
      refresh();
    } catch (err) {
      console.error('Purge failed:', err);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className={styles.page}>
      <Breadcrumb className={styles.breadcrumb}>
        <BreadcrumbItem>
          <BreadcrumbButton onClick={() => goBack('/notebooks')}>Notebook</BreadcrumbButton>
        </BreadcrumbItem>
        <BreadcrumbDivider />
        <BreadcrumbItem>
          <BreadcrumbButton current>Recycle Bin</BreadcrumbButton>
        </BreadcrumbItem>
      </Breadcrumb>

      <div className={styles.header}>
        <Text className={styles.title}>Recycle Bin</Text>
      </div>

      <CommandBar
        searchValue={search}
        onSearchChange={setSearch}
      />

      <div className={styles.grid}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <Text>Recycle bin is empty.</Text>
          </div>
        ) : (
          <div className={styles.cards}>
            {filtered.map((notebook) => (
              <Card key={notebook._id} className={styles.card}>
                <div className={styles.cardAccent} />
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
                  <Text className={styles.dateText}>
                    Deleted {formatDate(notebook.deletedAt)}
                  </Text>
                  <div className={styles.cardActions}>
                    <Button
                      appearance="primary"
                      size="small"
                      icon={<ArrowUndoRegular />}
                      onClick={(e) => handleRestore(notebook._id, e)}
                    >
                      Restore
                    </Button>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DeleteRegular />}
                      onClick={(e) => { e.stopPropagation(); setPurgeTarget(notebook._id); }}
                    >
                      Purge
                    </Button>
                  </div>
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

      <ConfirmDialog
        open={!!purgeTarget}
        title="Permanently Delete"
        message="This will permanently delete this notebook and all its content. This action cannot be undone."
        onConfirm={handlePurge}
        onCancel={() => setPurgeTarget(null)}
      />
    </div>
  );
}
