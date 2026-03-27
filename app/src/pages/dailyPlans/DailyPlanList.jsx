import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  makeStyles, tokens, Text, Badge, Spinner,
  DataGrid, DataGridHeader, DataGridHeaderCell, DataGridBody,
  DataGridRow, DataGridCell, TableCellLayout, createTableColumn,
} from '@fluentui/react-components';
import { CheckmarkCircleRegular, CircleRegular } from '@fluentui/react-icons';
import CommandBar from '../../components/CommandBar.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PaginationControls from '../../components/PaginationControls.jsx';
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
  row: {
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
});

const columns = [
  createTableColumn({
    columnId: 'date',
    compare: (a, b) => (a._id || '').localeCompare(b._id || ''),
    renderHeaderCell: () => 'Date',
    renderCell: (item) => {
      const d = new Date(item._id + 'T00:00:00');
      const formatted = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return <TableCellLayout><Text weight="semibold">{formatted}</Text></TableCellLayout>;
    },
  }),
  createTableColumn({
    columnId: 'status',
    compare: (a, b) => (a.status || '').localeCompare(b.status || ''),
    renderHeaderCell: () => 'Status',
    renderCell: (item) => (
      <TableCellLayout>
        <Badge
          appearance="filled"
          color={item.status === 'complete' ? 'success' : 'informative'}
          size="small"
        >
          {item.status}
        </Badge>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'todos',
    compare: (a, b) => (a.todoCount || 0) - (b.todoCount || 0),
    renderHeaderCell: () => 'Tasks',
    renderCell: (item) => (
      <TableCellLayout>
        <Text>{item.todoCompletedCount || 0}/{item.todoCount || 0}</Text>
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'timesheet',
    renderHeaderCell: () => 'Timesheet',
    renderCell: (item) => (
      <TableCellLayout>
        {item.hasTimesheet
          ? <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1, fontSize: '16px' }} />
          : <CircleRegular style={{ color: tokens.colorNeutralForeground3, fontSize: '16px' }} />
        }
      </TableCellLayout>
    ),
  }),
  createTableColumn({
    columnId: 'meetingNotes',
    compare: (a, b) => (a.meetingNotes?.length || 0) - (b.meetingNotes?.length || 0),
    renderHeaderCell: () => 'Meetings',
    renderCell: (item) => (
      <TableCellLayout>
        <Text>{item.meetingNotes?.length || 0}</Text>
      </TableCellLayout>
    ),
  }),
];

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
      // If already exists for today, navigate to it
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

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        {loading ? (
          <div className={styles.loading}><Spinner label="Loading..." /></div>
        ) : items.length === 0 ? (
          <div className={styles.empty}><Text>No daily plans yet. Click "New Daily Plan" to create one for today.</Text></div>
        ) : (
          <DataGrid
            items={items}
            columns={columns}
            sortable
            getRowId={(item) => item._id}
            selectionMode="multiselect"
            selectedItems={selected}
            onSelectionChange={(e, data) => setSelected(data.selectedItems)}
            style={{ width: '100%' }}
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody>
              {({ item, rowId }) => (
                <DataGridRow
                  key={rowId}
                  className={styles.row}
                  onClick={() => navigate(`/daily-plans/${item._id}`)}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
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
