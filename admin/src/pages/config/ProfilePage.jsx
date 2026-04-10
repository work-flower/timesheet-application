import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Select,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { settingsApi } from '../../api/index.js';
import { FormSection, FormField } from '../../components/FormSection.jsx';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import { TIMEZONES, DEFAULT_TIMEZONE } from '../../../../shared/timezones.js';

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

export default function ProfilePage() {
  const styles = useStyles();
  const { registerGuard } = useUnsavedChanges();
  const { navigateUnguarded, goBack } = useAppNavigate();
  const { form, setForm, setBase, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    settingsApi.get()
      .then((data) => resetBase(data || {}))
      .catch((err) => setError(err.message))
      .finally(() => setInitialized(true));
  }, [resetBase]);

  const handleChange = (field) => (e, data) => {
    setForm((prev) => ({ ...prev, [field]: data?.value ?? e.target.value }));
  };

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await settingsApi.update(form);
      const data = await settingsApi.get();
      resetBase(data || {});
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form, resetBase]);

  const handleSave = async () => {
    const { ok } = await saveForm();
    if (ok) {
      notifyParent(handleSave.name, base, form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleSaveAndClose = async () => {
    const { ok } = await saveForm();
    if (ok) {
      notifyParent(handleSaveAndClose.name, base, form);
      navigateUnguarded('/config/profile');
    }
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
        <FormCommandBar
          onBack={() => goBack('/config/profile')}
          onSave={handleSave}
          onSaveAndClose={handleSaveAndClose}
          saving={saving}
        />
        <div className={styles.pageBody}>
          <div className={styles.header}>
            <Text className={styles.title}>Profile</Text>
          </div>

          {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {success && <MessageBar intent="success" className={styles.message}><MessageBarBody>Settings saved successfully.</MessageBarBody></MessageBar>}

          <FormSection title="Personal Details">
            <FormField changed={changedFields.has('name')}>
              <Field label="Full Name"><Input name="name" value={form.name ?? ''} onChange={handleChange('name')} /></Field>
            </FormField>
            <FormField changed={changedFields.has('email')}>
              <Field label="Email"><Input name="email" type="email" value={form.email ?? ''} onChange={handleChange('email')} /></Field>
            </FormField>
            <FormField changed={changedFields.has('phone')}>
              <Field label="Phone"><Input name="phone" value={form.phone ?? ''} onChange={handleChange('phone')} /></Field>
            </FormField>
            <FormField fullWidth changed={changedFields.has('address')}>
              <Field label="Address"><Textarea name="address" value={form.address ?? ''} onChange={handleChange('address')} resize="vertical" /></Field>
            </FormField>
          </FormSection>

          <FormSection title="Locale">
            <FormField changed={changedFields.has('timezone')}>
              <Field label="Timezone" hint="Used by AI briefing/recap for time formatting">
                <Select name="timezone" value={form.timezone ?? DEFAULT_TIMEZONE} onChange={handleChange('timezone')}>
                  {TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </Select>
              </Field>
            </FormField>
          </FormSection>

          <FormSection title="Business Details">
            <FormField changed={changedFields.has('businessName')}>
              <Field label="Business Name"><Input name="businessName" value={form.businessName ?? ''} onChange={handleChange('businessName')} /></Field>
            </FormField>
            <FormField changed={changedFields.has('utrNumber')}>
              <Field label="UTR Number"><Input name="utrNumber" value={form.utrNumber ?? ''} onChange={handleChange('utrNumber')} /></Field>
            </FormField>
            <FormField changed={changedFields.has('vatNumber')}>
              <Field label="VAT Number"><Input name="vatNumber" value={form.vatNumber ?? ''} onChange={handleChange('vatNumber')} /></Field>
            </FormField>
            <FormField changed={changedFields.has('companyRegistration')}>
              <Field label="Company Registration"><Input name="companyRegistration" value={form.companyRegistration ?? ''} onChange={handleChange('companyRegistration')} /></Field>
            </FormField>
          </FormSection>
        </div>
      </div>
    </>
  );
}
