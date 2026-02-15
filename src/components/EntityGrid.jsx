import {
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  makeStyles,
  tokens,
  Spinner,
  Text,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  empty: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
    color: tokens.colorNeutralForeground3,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  row: {
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
});

export default function EntityGrid({
  columns,
  items,
  loading,
  emptyMessage = 'No records found',
  onRowClick,
  selectedIds,
  onSelectionChange,
  getRowId = (item) => item._id,
  sortable = true,
  scrollable = false,
}) {
  const styles = useStyles();

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner label="Loading..." />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className={styles.empty}>
        <Text>{emptyMessage}</Text>
      </div>
    );
  }

  const gridColumns = columns.map((col) =>
    createTableColumn({
      columnId: col.key,
      compare: col.compare,
      renderHeaderCell: () => col.label,
      renderCell: (item) => (
        <TableCellLayout>{col.render ? col.render(item) : item[col.key]}</TableCellLayout>
      ),
    })
  );

  return (
    <div className={styles.container} style={scrollable ? { overflow: 'auto' } : undefined}>
      <DataGrid
        items={items}
        columns={gridColumns}
        sortable={sortable}
        getRowId={getRowId}
        selectionMode={onSelectionChange ? 'multiselect' : undefined}
        selectedItems={selectedIds}
        onSelectionChange={onSelectionChange ? (e, data) => onSelectionChange(data.selectedItems) : undefined}
        style={{ width: '100%' }}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody>
          {({ item, rowId }) => (
            <DataGridRow
              key={rowId}
              className={onRowClick ? styles.row : undefined}
              onClick={() => onRowClick?.(item)}
            >
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
}
