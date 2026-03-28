import { useState, useCallback } from 'react';
import {
  makeStyles, tokens, Text, Badge, Spinner,
} from '@fluentui/react-components';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
import CardView, { CardMetaItem } from '../../components/CardView.jsx';
import WeekIndicator from '../../components/WeekIndicator.jsx';
import { useODataList } from '../../hooks/useODataList.js';
import { dailyPlansApi } from '../../api/index.js';
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
  loading: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
  },
  empty: {
    display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  dateBold: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  dateSubtle: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  timesheetBadge: {
    maxWidth: '130px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  },
});

function formatDate(id) {
  const d = new Date(id + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRelativeDate(id) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(id + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} days ago`;
  return null;
}

export default function DailyPlanList() {
  const styles = useStyles();
  const { navigate } = useAppNavigate();

  const {
    items, totalCount, loading, refresh,
    page, pageSize, totalPages, setPage, setPageSize,
  } = useODataList({
    key: 'dailyPlans',
    apiFn: dailyPlansApi.getAll,
    filters: [],
    defaultOrderBy: '_id desc',
    defaultPageSize: 25,
  });

  const [selected, setSelected] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const selectedId = selected.size === 1 ? [...selected][0] : null;

  const handleNew = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await dailyPlansApi.create({ date: today });
      navigate(`/daily-plans/${result._id}?wrapUp=true`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        const today = new Date().toISOString().split('T')[0];
        navigate(`/daily-plans/${today}`);
      } else {
        alert(err.message);
      }
    }
  }, [navigate]);

  const handleDelete = async () => {
    await dailyPlansApi.delete(deleteTarget);
    setDeleteTarget(null);
    setSelected(new Set());
    refresh();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Text className={styles.title}>Daily Plans</Text>
      </div>
      <CommandBar
        onNew={handleNew}
        newLabel="New Daily Plan"
        onDelete={selectedId ? () => setDeleteTarget(selectedId) : undefined}
        deleteDisabled={!selectedId}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : items.length === 0 ? (
          <div className={styles.empty}><Text>No daily plans yet. Click "New Daily Plan" to create one for today.</Text></div>
        ) : (
          <CardView
            items={items}
            getRowId={(item) => item._id}
            onItemClick={(item) => navigate(`/daily-plans/${item._id}`)}
            renderHeader={(item) => {
              const relative = formatRelativeDate(item._id);
              return (
                <>
                  <Text className={styles.dateBold}>{formatDate(item._id)}</Text>
                  {relative && <Text className={styles.dateSubtle}>{relative}</Text>}
                </>
              );
            }}
            renderActions={(item) => <WeekIndicator date={item._id} size="small" />}
            renderMeta={(item) => (
              <>
                <CardMetaItem label="Tasks" value={`${item.todoCompletedCount || 0} / ${item.todoCount || 0}`} />
                <CardMetaItem label="Meetings" value={item.meetingNotes?.length || 0} />
                <CardMetaItem
                  label="Timesheets"
                  value={
                    item.hasTimesheet
                      ? <Badge appearance="filled" color="success" size="small">Logged</Badge>
                      : <Badge appearance="tint" color="subtle" size="small">None</Badge>
                  }
                />
                <CardMetaItem
                  label="Recap"
                  value={
                    item.recapStatus === 'completed' && !item.recapIsStale
                      ? <Badge appearance="filled" color="success" size="small">Fresh</Badge>
                      : item.recapStatus === 'completed' && item.recapIsStale
                      ? <Badge appearance="tint" color="warning" size="small">Stale</Badge>
                      : item.recapStatus === 'failed'
                      ? <Badge appearance="tint" color="danger" size="small">Failed</Badge>
                      : <Badge appearance="tint" color="subtle" size="small">None</Badge>
                  }
                />
              </>
            )}
          />
        )}
      </div>

      <PaginationControls
        page={page} pageSize={pageSize} totalItems={totalCount}
        totalPages={totalPages} onPageChange={setPage} onPageSizeChange={setPageSize}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Daily Plan"
        message="Are you sure you want to delete this daily plan? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
