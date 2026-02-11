import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Button,
  Field,
  Spinner,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
} from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { settingsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';

const useStyles = makeStyles({
  page: {
    padding: '16px 24px',
    maxWidth: '900px',
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
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '24px',
  },
  message: {
    marginBottom: '16px',
  },
});

export default function Settings() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { form, setForm, setBase, isDirty, changedFields } = useFormTracker({
    name: '', email: '', phone: '', address: '',
    businessName: '', utrNumber: '', vatNumber: '', companyRegistration: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    settingsApi.get().then((data) => {
      if (data) {
        setBase({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          businessName: data.businessName || '',
          utrNumber: data.utrNumber || '',
          vatNumber: data.vatNumber || '',
          companyRegistration: data.companyRegistration || '',
        });
      }
    }).catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [setBase]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await settingsApi.update(form);
      setBase({ ...form });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, setBase]);

  const handleSave = async () => {
    const ok = await saveForm();
    if (ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Breadcrumb>
          <BreadcrumbItem><BreadcrumbButton>Settings</BreadcrumbButton></BreadcrumbItem>
        </Breadcrumb>
        <Text className={styles.title}>Contractor Profile</Text>
      </div>

      {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Settings saved successfully.</MessageBarBody></MessageBar>}

      <FormSection title="Personal Details">
        <FormField changed={changedFields.has('name')}>
          <Field label="Full Name"><Input value={form.name} onChange={handleChange('name')} /></Field>
        </FormField>
        <FormField changed={changedFields.has('email')}>
          <Field label="Email"><Input type="email" value={form.email} onChange={handleChange('email')} /></Field>
        </FormField>
        <FormField changed={changedFields.has('phone')}>
          <Field label="Phone"><Input value={form.phone} onChange={handleChange('phone')} /></Field>
        </FormField>
        <FormField fullWidth changed={changedFields.has('address')}>
          <Field label="Address"><Textarea value={form.address} onChange={handleChange('address')} resize="vertical" /></Field>
        </FormField>
      </FormSection>

      <FormSection title="Business Details">
        <FormField changed={changedFields.has('businessName')}>
          <Field label="Business Name"><Input value={form.businessName} onChange={handleChange('businessName')} /></Field>
        </FormField>
        <FormField changed={changedFields.has('utrNumber')}>
          <Field label="UTR Number"><Input value={form.utrNumber} onChange={handleChange('utrNumber')} /></Field>
        </FormField>
        <FormField changed={changedFields.has('vatNumber')}>
          <Field label="VAT Number"><Input value={form.vatNumber} onChange={handleChange('vatNumber')} /></Field>
        </FormField>
        <FormField changed={changedFields.has('companyRegistration')}>
          <Field label="Company Registration"><Input value={form.companyRegistration} onChange={handleChange('companyRegistration')} /></Field>
        </FormField>
      </FormSection>

      <div className={styles.actions}>
        <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
