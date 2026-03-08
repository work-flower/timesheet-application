import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  Select,
} from '@fluentui/react-components';
import { settingsApi, clientsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';

const useStyles = makeStyles({
  page: {
    maxWidth: '900px',
  },
  pageBody: {
    padding: '16px 24px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: {
    marginBottom: '16px',
  },
});

const INITIAL_STATE = {
  businessClientId: '',
  invoiceNumberSeed: 0,
  defaultPaymentTermDays: 10,
  defaultVatRate: 20,
  invoiceFooterText: '',
  bankName: '',
  bankSortCode: '',
  bankAccountNumber: '',
  bankAccountOwner: '',
  accountingReferenceDate: '',
  vatStaggerGroup: '',
};

export default function InvoicingPage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateRaw, goBack } = useAppNavigate();
  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker(INITIAL_STATE);
  const [clientsList, setClientsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      settingsApi.get(),
      clientsApi.getAll(),
    ]).then(([data, clients]) => {
      if (data) {
        setBase({
          businessClientId: data.businessClientId || '',
          invoiceNumberSeed: data.invoiceNumberSeed ?? 0,
          defaultPaymentTermDays: data.defaultPaymentTermDays ?? 10,
          defaultVatRate: data.defaultVatRate ?? 20,
          invoiceFooterText: data.invoiceFooterText || '',
          bankName: data.bankName || '',
          bankSortCode: data.bankSortCode || '',
          bankAccountNumber: data.bankAccountNumber || '',
          bankAccountOwner: data.bankAccountOwner || '',
          accountingReferenceDate: data.accountingReferenceDate || '',
          vatStaggerGroup: data.vatStaggerGroup || '',
        });
      }
      setClientsList(clients);
      setLoading(false);
    });
  }, [setBase]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload = {};
      for (const field of changedFields) {
        payload[field] = form[field];
      }
      await settingsApi.update(payload);
      setBase(form);
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, changedFields, setBase]);

  const handleSave = async () => {
    const { ok } = await saveForm();
    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleSaveAndClose = async () => {
    const { ok } = await saveForm();
    if (ok) navigateRaw('/config/invoicing');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <FormCommandBar
        onBack={() => goBack('/config/invoicing')}
        onSave={handleSave}
        onSaveAndClose={handleSaveAndClose}
        saving={saving}
      />
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Invoicing</Text>
        </div>

        {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
        {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Invoicing settings saved.</MessageBarBody></MessageBar>}

        <FormSection title="Financial Periods">
          <FormField changed={changedFields.has('accountingReferenceDate')}>
            <Field label="Accounting Reference Date" hint="Company year-end date (e.g. 03-31 for 31 March). Drives company year boundaries for financial reports.">
              <Select
                value={form.accountingReferenceDate}
                onChange={(e, data) => setForm((prev) => ({ ...prev, accountingReferenceDate: data.value }))}
              >
                <option value="">Not set</option>
                <option value="01-31">31 January</option>
                <option value="02-28">28 February</option>
                <option value="03-31">31 March</option>
                <option value="04-30">30 April</option>
                <option value="05-31">31 May</option>
                <option value="06-30">30 June</option>
                <option value="07-31">31 July</option>
                <option value="08-31">31 August</option>
                <option value="09-30">30 September</option>
                <option value="10-31">31 October</option>
                <option value="11-30">30 November</option>
                <option value="12-31">31 December</option>
              </Select>
            </Field>
          </FormField>
          <FormField changed={changedFields.has('vatStaggerGroup')}>
            <Field label="VAT Stagger Group" hint="Determines VAT quarter boundaries. Group 1: Mar/Jun/Sep/Dec. Group 2: Jan/Apr/Jul/Oct. Group 3: Feb/May/Aug/Nov.">
              <Select
                value={form.vatStaggerGroup}
                onChange={(e, data) => setForm((prev) => ({ ...prev, vatStaggerGroup: data.value }))}
              >
                <option value="">Not set</option>
                <option value="1">Group 1 (Mar, Jun, Sep, Dec)</option>
                <option value="2">Group 2 (Jan, Apr, Jul, Oct)</option>
                <option value="3">Group 3 (Feb, May, Aug, Nov)</option>
              </Select>
            </Field>
          </FormField>
        </FormSection>

        <FormSection title="Business Client">
          <FormField changed={changedFields.has('businessClientId')}>
            <Field label="Business Client" hint="Designate a client to track business-level expenses (rent, software, tax, etc.)">
              <Select
                value={form.businessClientId}
                onChange={(e, data) => setForm((prev) => ({ ...prev, businessClientId: data.value }))}
              >
                <option value="">None</option>
                {clientsList.map((c) => (
                  <option key={c._id} value={c._id}>{c.companyName}</option>
                ))}
              </Select>
            </Field>
          </FormField>
        </FormSection>

        <FormSection title="Invoice Numbering">
          <FormField changed={changedFields.has('invoiceNumberSeed')}>
            <Field label="Invoice Number Seed" hint="Last used invoice number. Next invoice will be this + 1.">
              <Input
                type="number"
                value={String(form.invoiceNumberSeed ?? '')}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setForm((prev) => ({ ...prev, invoiceNumberSeed: val }));
                }}
                min={0}
                step={1}
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('defaultPaymentTermDays')}>
            <Field label="Default Payment Terms (days)">
              <Input
                type="number"
                value={String(form.defaultPaymentTermDays ?? '')}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setForm((prev) => ({ ...prev, defaultPaymentTermDays: val }));
                }}
                min={0}
                step={1}
              />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('defaultVatRate')}>
            <Field label="Default VAT Rate (%)" hint="Default VAT rate for new projects.">
              <Input
                type="number"
                value={String(form.defaultVatRate ?? '')}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setForm((prev) => ({ ...prev, defaultVatRate: val }));
                }}
                min={0}
                max={100}
                step={0.5}
              />
            </Field>
          </FormField>
        </FormSection>

        <FormSection title="Bank Details">
          <FormField changed={changedFields.has('bankName')}>
            <Field label="Bank Name">
              <Input value={form.bankName} onChange={handleChange('bankName')} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('bankSortCode')}>
            <Field label="Sort Code">
              <Input value={form.bankSortCode} onChange={handleChange('bankSortCode')} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('bankAccountNumber')}>
            <Field label="Account Number">
              <Input value={form.bankAccountNumber} onChange={handleChange('bankAccountNumber')} />
            </Field>
          </FormField>
          <FormField changed={changedFields.has('bankAccountOwner')}>
            <Field label="Account Holder Name">
              <Input value={form.bankAccountOwner} onChange={handleChange('bankAccountOwner')} />
            </Field>
          </FormField>
        </FormSection>

        <FormSection title="Invoice Footer">
          <FormField fullWidth changed={changedFields.has('invoiceFooterText')}>
            <Field label="Footer Text" hint="Text displayed at the bottom of every invoice.">
              <Textarea
                value={form.invoiceFooterText}
                onChange={handleChange('invoiceFooterText')}
                resize="vertical"
                rows={3}
              />
            </Field>
          </FormField>
        </FormSection>

      </div>
    </div>
  );
}
