import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Input,
  Textarea,
  Field,
  SpinButton,
  Button,
  MessageBar,
  MessageBarBody,
  Select,
} from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { settingsApi, clientsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';

const useStyles = makeStyles({
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginTop: '16px',
  },
  message: {
    marginBottom: '16px',
  },
});

export default function InvoicingSettings() {
  const styles = useStyles();
  const [form, setForm] = useState({
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
  });
  const [clientsList, setClientsList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    settingsApi.get().then((data) => {
      if (data) {
        setForm({
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
    });
    clientsApi.getAll().then(setClientsList);
  }, []);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await settingsApi.update(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Invoicing settings saved.</MessageBarBody></MessageBar>}

      <FormSection title="Financial Periods">
        <FormField>
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
        <FormField>
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
        <FormField>
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
        <FormField>
          <Field label="Invoice Number Seed" hint="Last used invoice number. Next invoice will be this + 1.">
            <SpinButton
              defaultValue={form.invoiceNumberSeed}
              onChange={(e, data) => {
                const val = data.value ?? parseFloat(data.displayValue);
                if (val != null && !isNaN(val)) setForm((prev) => ({ ...prev, invoiceNumberSeed: val }));
              }}
              min={0}
              step={1}
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Default Payment Terms (days)">
            <SpinButton
              defaultValue={form.defaultPaymentTermDays}
              onChange={(e, data) => {
                const val = data.value ?? parseFloat(data.displayValue);
                if (val != null && !isNaN(val)) setForm((prev) => ({ ...prev, defaultPaymentTermDays: val }));
              }}
              min={0}
              step={1}
            />
          </Field>
        </FormField>
        <FormField>
          <Field label="Default VAT Rate (%)" hint="Default VAT rate for new projects.">
            <SpinButton
              defaultValue={form.defaultVatRate}
              onChange={(e, data) => {
                const val = data.value ?? parseFloat(data.displayValue);
                if (val != null && !isNaN(val)) setForm((prev) => ({ ...prev, defaultVatRate: val }));
              }}
              min={0}
              max={100}
              step={0.5}
            />
          </Field>
        </FormField>
      </FormSection>

      <FormSection title="Bank Details">
        <FormField>
          <Field label="Bank Name">
            <Input value={form.bankName} onChange={handleChange('bankName')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Sort Code">
            <Input value={form.bankSortCode} onChange={handleChange('bankSortCode')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Account Number">
            <Input value={form.bankAccountNumber} onChange={handleChange('bankAccountNumber')} />
          </Field>
        </FormField>
        <FormField>
          <Field label="Account Holder Name">
            <Input value={form.bankAccountOwner} onChange={handleChange('bankAccountOwner')} />
          </Field>
        </FormField>
      </FormSection>

      <FormSection title="Invoice Footer">
        <FormField fullWidth>
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

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={handleSave}
          disabled={saving}
          size="small"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </>
  );
}
