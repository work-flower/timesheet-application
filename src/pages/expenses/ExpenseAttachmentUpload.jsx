import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner, Text, Button, MessageBar, MessageBarBody } from '@fluentui/react-components';
import { CheckmarkCircle24Filled } from '@fluentui/react-icons';

const phases = { LOADING: 'loading', CAMERA: 'camera', UPLOADING: 'uploading', DONE: 'done' };

export default function ExpenseAttachmentUpload() {
  const { id } = useParams();
  const [phase, setPhase] = useState(phases.LOADING);
  const [expense, setExpense] = useState(null);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const fileInputRef = useRef(null);

  // Load expense summary
  useEffect(() => {
    fetch(`/api/expenses/${id}`)
      .then(res => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error(`Failed to load expense (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (data) {
          setExpense(data);
          setPhase(phases.CAMERA);
        }
      })
      .catch(err => { setError(err.message); });
  }, [id]);

  // Auto-trigger camera when entering camera phase
  useEffect(() => {
    if (phase === phases.CAMERA) {
      const timer = setTimeout(() => fileInputRef.current?.click(), 100);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhase(phases.UPLOADING);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await fetch(`/api/expenses/${id}/attachments`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      setPhase(phases.DONE);
    } catch (err) {
      setError(err.message);
      setPhase(phases.CAMERA);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const containerStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100dvh', padding: '24px', boxSizing: 'border-box', textAlign: 'center',
    maxWidth: '480px', margin: '0 auto',
  };

  const summaryStyle = {
    background: '#f5f5f5', borderRadius: '8px', padding: '16px', width: '100%',
    marginBottom: '24px', textAlign: 'left',
  };

  const summaryRowStyle = { display: 'flex', justifyContent: 'space-between', padding: '4px 0' };

  if (notFound) {
    return (
      <div style={containerStyle}>
        <Text size={500} weight="semibold" style={{ marginBottom: '12px' }}>Expense Not Found</Text>
        <Text>The expense does not exist or has been deleted.</Text>
      </div>
    );
  }

  if (phase === phases.LOADING) {
    return (
      <div style={containerStyle}>
        <Spinner size="large" label="Loading expense..." />
      </div>
    );
  }

  const summary = expense && (
    <div style={summaryStyle}>
      <Text size={400} weight="semibold" block style={{ marginBottom: '8px' }}>Expense Summary</Text>
      {expense.date && <div style={summaryRowStyle}><Text size={300}>Date</Text><Text size={300} weight="semibold">{expense.date}</Text></div>}
      {expense.expenseType && <div style={summaryRowStyle}><Text size={300}>Type</Text><Text size={300} weight="semibold">{expense.expenseType}</Text></div>}
      {expense.amount != null && <div style={summaryRowStyle}><Text size={300}>Amount</Text><Text size={300} weight="semibold">{`£${expense.amount.toFixed(2)}`}</Text></div>}
      {expense.clientName && <div style={summaryRowStyle}><Text size={300}>Client</Text><Text size={300} weight="semibold">{expense.clientName}</Text></div>}
      {expense.projectName && <div style={summaryRowStyle}><Text size={300}>Project</Text><Text size={300} weight="semibold">{expense.projectName}</Text></div>}
      {expense.description && <div style={summaryRowStyle}><Text size={300}>Description</Text><Text size={300} weight="semibold">{expense.description}</Text></div>}
    </div>
  );

  if (phase === phases.CAMERA) {
    return (
      <div style={containerStyle}>
        {summary}
        {error && (
          <MessageBar intent="error" style={{ width: '100%', marginBottom: '16px' }}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <Button appearance="primary" size="large" onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', minHeight: '48px' }}>
          Open Camera
        </Button>
      </div>
    );
  }

  if (phase === phases.UPLOADING) {
    return (
      <div style={containerStyle}>
        {summary}
        <Spinner size="large" label="Uploading receipt..." />
      </div>
    );
  }

  // DONE
  return (
    <div style={containerStyle}>
      <CheckmarkCircle24Filled style={{ fontSize: '48px', color: '#107c10', marginBottom: '16px', width: '48px', height: '48px' }} />
      <Text size={600} weight="semibold" style={{ marginBottom: '8px' }}>Receipt Uploaded</Text>
      <Text size={300} style={{ color: '#616161', marginBottom: '24px' }}>The receipt has been attached to the expense.</Text>
      {summary}
      <Text size={300} style={{ color: '#616161' }}>You can close this tab.</Text>
    </div>
  );
}
