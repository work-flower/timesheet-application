import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Link,
  Tooltip,
  Spinner,
  MessageBar,
  MessageBarBody,
  OverlayDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
} from '@fluentui/react-components';
import { DismissRegular, OpenRegular, ReceiptRegular } from '@fluentui/react-icons';
import InvoicePickerDialog from '../../components/InvoicePickerDialog.jsx';
import { timesheetsApi, invoicesApi } from '../../api/index.js';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '12px 0',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  fieldLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    minWidth: '120px',
  },
  fieldValue: {
    fontSize: tokens.fontSizeBase300,
    textAlign: 'right',
    wordBreak: 'break-word',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '48px',
  },
  message: {
    marginBottom: '12px',
  },
});

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export default function TimesheetDrawer({ timesheetId, onClose, onMutate }) {
  const styles = useStyles();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState(null);
  const [loading, setLoading] = useState(false);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [success, setSuccess] = useState(null);

  const refreshData = useCallback(async () => {
    if (!timesheetId) return;
    try {
      const result = await timesheetsApi.getById(timesheetId);
      setData(result);
      if (result.invoiceId) {
        try {
          const inv = await invoicesApi.getById(result.invoiceId);
          setInvoiceNumber(inv.invoiceNumber || null);
        } catch {
          setInvoiceNumber(null);
        }
      } else {
        setInvoiceNumber(null);
      }
    } catch {
      setData(null);
    }
  }, [timesheetId]);

  useEffect(() => {
    if (!timesheetId) {
      setData(null);
      setInvoiceNumber(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    refreshData()
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [timesheetId, refreshData]);

  return (
    <>
      <OverlayDrawer
        position="end"
        size="medium"
        open={!!timesheetId}
        onOpenChange={(_, d) => { if (!d.open) onClose(); }}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tooltip content="Open full form" relationship="label" withArrow>
                  <Button
                    appearance="subtle"
                    icon={<OpenRegular />}
                    onClick={() => { onClose(); navigate(`/timesheets/${timesheetId}`); }}
                    size="small"
                  />
                </Tooltip>
                <Button
                  appearance="subtle"
                  icon={<DismissRegular />}
                  onClick={onClose}
                />
              </div>
            }
          >
            {data && (
              <span style={{ fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold }}>
                {data.date} — {data.projectName || 'Timesheet'}
              </span>
            )}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          {loading && (
            <div className={styles.loading}><Spinner label="Loading..." /></div>
          )}
          {!loading && !data && timesheetId && (
            <MessageBar intent="error"><MessageBarBody>Timesheet not found.</MessageBarBody></MessageBar>
          )}
          {!loading && data && (
            <>
              {/* Action Toolbar */}
              {!data.isLocked && (
                <div className={styles.toolbar}>
                  <Button
                    appearance="outline"
                    icon={<ReceiptRegular />}
                    onClick={() => setInvoicePickerOpen(true)}
                    disabled={!data.clientId}
                    size="small"
                  >
                    Link to Invoice
                  </Button>
                </div>
              )}

              {success && (
                <MessageBar intent="success" className={styles.message}>
                  <MessageBarBody>{success}</MessageBarBody>
                </MessageBar>
              )}

              {data.isLocked && (
                <MessageBar intent="warning" className={styles.message}>
                  <MessageBarBody>{data.isLockedReason || 'This record is locked.'}</MessageBarBody>
                </MessageBar>
              )}

              <div className={styles.section}>
                <Text className={styles.sectionTitle} style={{ display: 'block', marginBottom: '8px' }}>Details</Text>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Date</Text>
                  <Text className={styles.fieldValue}>{data.date}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Client</Text>
                  <Text className={styles.fieldValue}>
                    {data.clientId ? (
                      <Link onClick={() => { onClose(); navigate(`/clients/${data.clientId}`); }}>
                        {data.clientName || data.clientId}
                      </Link>
                    ) : '—'}
                  </Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Project</Text>
                  <Text className={styles.fieldValue}>
                    {data.projectId ? (
                      <Link onClick={() => { onClose(); navigate(`/projects/${data.projectId}`); }}>
                        {data.projectName || data.projectId}
                      </Link>
                    ) : '—'}
                  </Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Hours</Text>
                  <Text className={styles.fieldValue}>{data.hours}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Days</Text>
                  <Text className={styles.fieldValue}>{data.days != null ? data.days.toFixed(2) : '—'}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Amount</Text>
                  <Text className={styles.fieldValue}>{fmtGBP.format(data.amount || 0)}</Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Invoice</Text>
                  <Text className={styles.fieldValue}>
                    {data.invoiceId ? (
                      <Link onClick={() => { onClose(); navigate(`/invoices/${data.invoiceId}`); }}>
                        {invoiceNumber || data.invoiceId}
                      </Link>
                    ) : '—'}
                  </Text>
                </div>
                <div className={styles.fieldRow}>
                  <Text className={styles.fieldLabel}>Notes</Text>
                  <Text className={styles.fieldValue}>{data.notes || '—'}</Text>
                </div>
              </div>
            </>
          )}
        </DrawerBody>
      </OverlayDrawer>

      <InvoicePickerDialog
        open={invoicePickerOpen}
        onClose={() => setInvoicePickerOpen(false)}
        onLinked={() => {
          setInvoicePickerOpen(false);
          setSuccess('Linked to invoice successfully.');
          setTimeout(() => setSuccess(null), 3000);
          refreshData();
          onMutate?.();
        }}
        clientId={data?.clientId}
        sourceType="timesheet"
        sourceId={timesheetId}
      />
    </>
  );
}
