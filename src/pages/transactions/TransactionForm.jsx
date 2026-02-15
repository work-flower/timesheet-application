import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  Select,
  Textarea,
  Button,
  Badge,
  Link,
} from '@fluentui/react-components';
import { SaveRegular, AddRegular } from '@fluentui/react-icons';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import { transactionsApi } from '../../api/index.js';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {},
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '48px',
  },
  sourceSection: {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '300px',
    overflow: 'auto',
  },
});

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const statusColors = {
  matched: 'success',
  unmatched: 'warning',
  ignored: 'subtle',
};

export default function TransactionForm() {
  const styles = useStyles();
  const { id } = useParams();
  const navigate = useNavigate();
  const { registerGuard, guardedNavigate } = useUnsavedChanges();

  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    status: 'unmatched',
    ignoreReason: '',
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate('/transactions');
      return;
    }
    setLoading(true);
    transactionsApi.getById(id)
      .then((result) => {
        setData(result);
        setBase({
          status: result.status || 'unmatched',
          ignoreReason: result.ignoreReason || '',
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, navigate, setBase]);

  const handleChange = (field) => (e, d) => {
    const value = d?.value ?? e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { status: form.status };
      if (form.status === 'ignored') {
        payload.ignoreReason = form.ignoreReason;
      }
      const updated = await transactionsApi.updateMapping(id, payload);
      setData(updated);
      setBase({
        status: updated.status || 'unmatched',
        ignoreReason: updated.ignoreReason || '',
      });
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [id, form.status, form.ignoreReason, setBase]);

  const handleSaveStatus = async () => {
    const result = await saveForm();
    if (result.ok) {
      setSuccess('Status updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleCreateExpense = () => {
    if (!data) return;
    const params = new URLSearchParams();
    params.set('date', data.date);
    params.set('amount', String(Math.abs(data.amount)));
    params.set('description', data.description || '');
    guardedNavigate(`/expenses/new?${params.toString()}`);
  };

  // Navigation guard
  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  if (loading) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => guardedNavigate('/transactions')} />
        <div className={styles.loading}><Spinner label="Loading..." /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.page}>
        <FormCommandBar onBack={() => guardedNavigate('/transactions')} />
        <div className={styles.pageBody}>
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>Transaction not found.</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  const isDebit = data.amount < 0;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => guardedNavigate('/transactions')}
        locked
      >
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={handleSaveStatus}
          disabled={saving || (form.status === 'ignored' && !form.ignoreReason.trim())}
          size="small"
        >
          {saving ? 'Saving...' : 'Save Status'}
        </Button>
        {isDebit && (
          <Button
            appearance="outline"
            icon={<AddRegular />}
            onClick={handleCreateExpense}
            size="small"
          >
            Create Expense
          </Button>
        )}
      </FormCommandBar>

      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbButton onClick={() => guardedNavigate('/transactions')}>Transactions</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton current>{data.description || 'Transaction'}</BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
          <Text className={styles.title}>Transaction Details</Text>
        </div>

        {error && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {success && (
          <MessageBar intent="success" className={styles.message}>
            <MessageBarBody>{success}</MessageBarBody>
          </MessageBar>
        )}

        <MessageBar intent="warning" className={styles.message}>
          <MessageBarBody>Transactions are read-only by default. Only the status can be changed below.</MessageBarBody>
        </MessageBar>

        {/* Section 1: Read-only transaction details */}
        <fieldset disabled style={{ border: 'none', padding: 0, margin: 0, opacity: 0.6 }}>
          <FormSection title="Transaction Details">
            <FormField>
              <Field label="Date">
                <Input value={data.date || ''} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Amount">
                <Input
                  value={fmtGBP.format(data.amount)}
                  readOnly
                  style={{ color: data.amount >= 0 ? '#107C10' : '#D13438' }}
                />
              </Field>
            </FormField>
            <FormField fullWidth>
              <Field label="Description">
                <Input value={data.description || ''} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Reference">
                <Input value={data.reference || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Account Name">
                <Input value={data.accountName || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Account Number">
                <Input value={data.accountNumber || '\u2014'} readOnly />
              </Field>
            </FormField>
            <FormField>
              <Field label="Import Job">
                {data.importJobId ? (
                  <Link onClick={() => guardedNavigate(`/import-jobs/${data.importJobId}`)}>
                    {data.importJobId}
                  </Link>
                ) : (
                  <Text>{'\u2014'}</Text>
                )}
              </Field>
            </FormField>
            <FormField>
              <Field label="Current Status">
                <Badge appearance="filled" color={statusColors[data.status] || 'informative'} size="medium">
                  {data.status}
                </Badge>
              </Field>
            </FormField>
          </FormSection>

          {data.source && (
            <FormSection title="Source Details">
              <FormField fullWidth>
                <div className={styles.sourceSection}>
                  {JSON.stringify(data.source, null, 2)}
                </div>
              </FormField>
            </FormSection>
          )}
        </fieldset>

        {/* Section 2: Editable status mapping */}
        <FormSection title="Status & Mapping">
          <FormField changed={changedFields.has('status')}>
            <Field label="Status">
              <Select value={form.status} onChange={handleChange('status')}>
                <option value="unmatched">Unmatched</option>
                <option value="matched">Matched</option>
                <option value="ignored">Ignored</option>
              </Select>
            </Field>
          </FormField>
          {form.status === 'ignored' && (
            <FormField fullWidth changed={changedFields.has('ignoreReason')}>
              <Field label="Ignore Reason" required>
                <Textarea
                  value={form.ignoreReason}
                  onChange={handleChange('ignoreReason')}
                  placeholder="Why is this transaction being ignored?"
                  resize="vertical"
                  rows={3}
                />
              </Field>
            </FormField>
          )}
        </FormSection>

      </div>
    </div>
  );
}
