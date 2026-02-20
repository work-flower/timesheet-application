import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  TableCellLayout,
  createTableColumn,
  tokens,
} from '@fluentui/react-components';
import { invoicesApi } from '../api/index.js';

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const columns = [
  createTableColumn({
    columnId: 'invoiceNumber',
    compare: (a, b) => (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''),
    renderHeaderCell: () => 'Invoice #',
    renderCell: (item) => <TableCellLayout>{item.invoiceNumber || 'Draft'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'invoiceDate',
    compare: (a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || ''),
    renderHeaderCell: () => 'Invoice Date',
    renderCell: (item) => <TableCellLayout>{item.invoiceDate || '\u2014'}</TableCellLayout>,
  }),
  createTableColumn({
    columnId: 'servicePeriod',
    renderHeaderCell: () => 'Service Period',
    renderCell: (item) => {
      const start = item.servicePeriodStart || '';
      const end = item.servicePeriodEnd || '';
      if (!start && !end) return <TableCellLayout>{'\u2014'}</TableCellLayout>;
      return <TableCellLayout>{start} \u2013 {end}</TableCellLayout>;
    },
  }),
  createTableColumn({
    columnId: 'total',
    compare: (a, b) => (a.total || 0) - (b.total || 0),
    renderHeaderCell: () => 'Total',
    renderCell: (item) => <TableCellLayout>{fmtGBP.format(item.total || 0)}</TableCellLayout>,
  }),
];

export default function InvoicePickerDialog({
  open,
  onClose,
  onLinked,
  clientId,
  sourceType,
  sourceId,
}) {
  const [invoiceList, setInvoiceList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!open || !clientId) return;
    setError(null);
    setSelectedId(null);
    setLoading(true);
    invoicesApi.getAll({ clientId, status: 'draft' })
      .then((result) => {
        setInvoiceList(Array.isArray(result) ? result : result.value || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const handleLink = async () => {
    if (!selectedId) return;
    setLinking(true);
    setError(null);
    try {
      await invoicesApi.addLine(selectedId, [{ type: sourceType, sourceId }]);
      onLinked(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '700px', width: '90vw', maxHeight: '85vh' }}>
        <DialogBody>
          <DialogTitle>Link to Invoice</DialogTitle>
          <DialogContent>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: '12px' }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {loading ? (
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <Spinner size="small" label="Loading draft invoices..." />
              </div>
            ) : invoiceList.length === 0 ? (
              <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                No draft invoices for this client.
              </Text>
            ) : (
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                <DataGrid
                  items={invoiceList}
                  columns={columns}
                  sortable
                  getRowId={(item) => item._id}
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
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedId === item._id ? tokens.colorBrandBackground2 : undefined,
                        }}
                        onClick={() => setSelectedId(item._id)}
                      >
                        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleLink} disabled={!selectedId || linking}>
              {linking ? 'Linking...' : 'Link'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
