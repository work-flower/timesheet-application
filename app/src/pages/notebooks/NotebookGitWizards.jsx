import { useState, useCallback, useEffect, useRef } from 'react';
import {
  tokens, Text, Badge, Spinner, Button,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  MessageBar, MessageBarBody,
} from '@fluentui/react-components';
import { notebooksApi } from '../../api/index.js';

function CommitList({ commits }) {
  return (
    <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12, fontSize: 13 }}>
      {commits.map((c) => (
        <div key={c.hash} style={{ padding: '4px 0', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {new Date(c.date).toLocaleDateString('en-GB')}
          </Text>{' '}
          <Text size={200}>{c.message}</Text>
        </div>
      ))}
    </div>
  );
}

function NotebookBadges({ names }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {names.map((n) => (
        <Badge key={n} appearance="tint" color="brand" size="small" style={{ marginRight: 4, marginBottom: 4 }}>{n}</Badge>
      ))}
    </div>
  );
}

/**
 * Hook to poll git operation status. Returns current op and a refresh function.
 * Polls every 2s while an operation is running.
 */
export function useGitOperation() {
  const [op, setOp] = useState(null); // { type, status, error? }
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const status = await notebooksApi.getOperation();
      setOp(status?.status === 'idle' ? null : status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(async () => {
      const status = await poll();
      if (!status || status.status !== 'running') {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 2000);
  }, [poll]);

  const clear = useCallback(async () => {
    await notebooksApi.clearOperation();
    setOp(null);
  }, []);

  // Poll on mount to catch any running ops
  useEffect(() => {
    poll().then((status) => {
      if (status?.status === 'running') startPolling();
    });
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [poll, startPolling]);

  return { op, poll, startPolling, clear };
}

// --- Push Wizard ---

export function PushWizard({ open, onClose, onDone, gitOp }) {
  const [step, setStep] = useState('loading'); // loading | review | executing | done | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const prepare = useCallback(async () => {
    setStep('loading');
    setError(null);
    try {
      const result = await notebooksApi.preparePush();
      if (!result.ok) { setError(result.error); setStep('error'); return; }
      setData(result);
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }, []);

  const execute = useCallback(async (force = false) => {
    setStep('executing');
    try {
      const result = await notebooksApi.executePush(force);
      if (!result.ok) { setError(result.error); setStep('error'); return; }
      // Operation started in background — start polling and close
      gitOp.startPolling();
      gitOp.poll();
      setStep('started');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }, [gitOp]);

  const handleClose = useCallback(() => {
    setData(null);
    setError(null);
    setStep('loading');
    onClose();
  }, [onClose]);

  // When opened, check if there's a running/completed op to show
  useEffect(() => {
    if (!open) return;
    const currentOp = gitOp.op;
    if (currentOp?.type === 'push' && currentOp.status === 'running') {
      setStep('executing');
    } else if (currentOp?.type === 'push' && currentOp.status === 'done') {
      setStep('done');
    } else if (currentOp?.type === 'push' && currentOp.status === 'error') {
      setError(currentOp.error);
      setStep('error');
    } else {
      prepare();
    }
  }, [open, gitOp.op, prepare]);

  // Watch for op completion while dialog is open
  useEffect(() => {
    if (!open) return;
    if (step !== 'executing') return;
    const currentOp = gitOp.op;
    if (currentOp?.type === 'push' && currentOp.status === 'done') {
      setStep('done');
    } else if (currentOp?.type === 'push' && currentOp.status === 'error') {
      setError(currentOp.error);
      setStep('error');
    }
  }, [open, step, gitOp.op]);

  const handleDone = useCallback(() => {
    gitOp.clear();
    handleClose();
    if (onDone) onDone();
  }, [gitOp, handleClose, onDone]);

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) handleClose(); }}>
      <DialogSurface style={{ maxWidth: '600px' }}>
        <DialogBody>
          <DialogTitle>Push to Remote</DialogTitle>
          <DialogContent>
            {step === 'loading' && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spinner label="Preparing push..." />
              </div>
            )}
            {step === 'error' && (
              <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
            )}
            {step === 'review' && data && (
              <>
                {data.commits.length === 0 ? (
                  <Text block style={{ marginBottom: 12 }}>Nothing to push — remote is up to date.</Text>
                ) : (
                  <>
                    <Text block weight="semibold" style={{ marginBottom: 8 }}>
                      {data.commits.length} commit{data.commits.length !== 1 ? 's' : ''} to push:
                    </Text>
                    <CommitList commits={data.commits} />
                    <Text block weight="semibold" style={{ marginBottom: 4 }}>Affected notebooks:</Text>
                    <NotebookBadges names={data.affectedNotebooks} />
                  </>
                )}
                {data.hasConflicts && (
                  <MessageBar intent="warning" style={{ marginBottom: 12 }}>
                    <MessageBarBody>
                      Remote has diverged. Conflicting notebooks: {data.conflictingNotebooks.join(', ')}.
                      You can force-push to overwrite the remote.
                    </MessageBarBody>
                  </MessageBar>
                )}
              </>
            )}
            {(step === 'executing' || step === 'started') && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spinner label="Pushing... You can close this dialog — the operation will continue in the background." />
              </div>
            )}
            {step === 'done' && (
              <MessageBar intent="success"><MessageBarBody>Push completed successfully.</MessageBarBody></MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {step === 'done' ? (
              <Button appearance="primary" onClick={handleDone}>Close</Button>
            ) : (
              <Button appearance="secondary" onClick={handleClose}>
                {step === 'executing' || step === 'started' ? 'Close (continues in background)' : 'Cancel'}
              </Button>
            )}
            {step === 'review' && data?.commits.length > 0 && !data.hasConflicts && (
              <Button appearance="primary" onClick={() => execute(false)}>Push</Button>
            )}
            {step === 'review' && data?.hasConflicts && (
              <Button appearance="primary" onClick={() => execute(true)}>Force Push</Button>
            )}
            {step === 'error' && (
              <Button appearance="primary" onClick={() => { gitOp.clear(); prepare(); }}>Retry</Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// --- Pull Wizard ---

export function PullWizard({ open, onClose, onDone, gitOp }) {
  const [step, setStep] = useState('loading');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const prepare = useCallback(async () => {
    setStep('loading');
    setError(null);
    try {
      const res = await notebooksApi.preparePull();
      if (!res.ok) { setError(res.error); setStep('error'); return; }
      setData(res);
      setStep('review');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }, []);

  const execute = useCallback(async (force = false) => {
    setStep('executing');
    try {
      const res = await notebooksApi.executePull(force);
      if (!res.ok && !res.started) { setError(res.error); setStep('error'); return; }
      gitOp.startPolling();
      gitOp.poll();
      setStep('started');
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }, [gitOp]);

  const handleClose = useCallback(() => {
    setData(null);
    setError(null);
    setStep('loading');
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const currentOp = gitOp.op;
    if (currentOp?.type === 'pull' && currentOp.status === 'running') {
      setStep('executing');
    } else if (currentOp?.type === 'pull' && currentOp.status === 'done') {
      setStep('done');
    } else if (currentOp?.type === 'pull' && currentOp.status === 'error') {
      setError(currentOp.error);
      setStep('error');
    } else {
      prepare();
    }
  }, [open, gitOp.op, prepare]);

  useEffect(() => {
    if (!open) return;
    if (step !== 'executing') return;
    const currentOp = gitOp.op;
    if (currentOp?.type === 'pull' && currentOp.status === 'done') {
      setStep('done');
    } else if (currentOp?.type === 'pull' && currentOp.status === 'error') {
      setError(currentOp.error);
      setStep('error');
    }
  }, [open, step, gitOp.op]);

  const handleDone = useCallback(() => {
    gitOp.clear();
    handleClose();
    if (onDone) onDone();
  }, [gitOp, handleClose, onDone]);

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) handleClose(); }}>
      <DialogSurface style={{ maxWidth: '600px' }}>
        <DialogBody>
          <DialogTitle>Pull from Remote</DialogTitle>
          <DialogContent>
            {step === 'loading' && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spinner label="Fetching remote changes..." />
              </div>
            )}
            {step === 'error' && (
              <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
            )}
            {step === 'review' && data && (
              <>
                {data.commits.length === 0 ? (
                  <Text block style={{ marginBottom: 12 }}>Already up to date — no incoming changes.</Text>
                ) : (
                  <>
                    <Text block weight="semibold" style={{ marginBottom: 8 }}>
                      {data.commits.length} incoming commit{data.commits.length !== 1 ? 's' : ''}:
                    </Text>
                    <CommitList commits={data.commits} />
                    <Text block weight="semibold" style={{ marginBottom: 4 }}>Affected notebooks:</Text>
                    <NotebookBadges names={data.affectedNotebooks} />
                  </>
                )}
                {(data.dbSync?.newFolders?.length > 0 || data.dbSync?.orphanNotebooks?.length > 0) && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: tokens.colorNeutralBackground3, borderRadius: 4 }}>
                    <Text block weight="semibold" size={200} style={{ marginBottom: 4 }}>Database sync:</Text>
                    {data.dbSync.newFolders.length > 0 && (
                      <Text block size={200}>
                        Import: {data.dbSync.newFolders.join(', ')}
                      </Text>
                    )}
                    {data.dbSync.orphanNotebooks.length > 0 && (
                      <Text block size={200}>
                        Remove orphans: {data.dbSync.orphanNotebooks.map((n) => n.title).join(', ')}
                      </Text>
                    )}
                  </div>
                )}
                {data.draftsAtRisk?.length > 0 && (
                  <MessageBar intent="warning" style={{ marginBottom: 12 }}>
                    <MessageBarBody>
                      These notebooks have unsaved draft changes that will conflict: {data.draftsAtRisk.join(', ')}.
                      Discard drafts first, or force-pull to overwrite local.
                    </MessageBarBody>
                  </MessageBar>
                )}
                {data.hasConflicts && (
                  <MessageBar intent="warning" style={{ marginBottom: 12 }}>
                    <MessageBarBody>
                      Local and remote have diverged. Conflicting notebooks: {data.conflictingNotebooks.join(', ')}.
                      Force-pull will reset local to match remote.
                    </MessageBarBody>
                  </MessageBar>
                )}
              </>
            )}
            {(step === 'executing' || step === 'started') && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Spinner label="Pulling... You can close this dialog — the operation will continue in the background." />
              </div>
            )}
            {step === 'done' && (
              <MessageBar intent="success"><MessageBarBody>Pull completed successfully.</MessageBarBody></MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {step === 'done' ? (
              <Button appearance="primary" onClick={handleDone}>Close</Button>
            ) : (
              <Button appearance="secondary" onClick={handleClose}>
                {step === 'executing' || step === 'started' ? 'Close (continues in background)' : 'Cancel'}
              </Button>
            )}
            {step === 'review' && data?.commits.length > 0 && !data.hasConflicts && !data.draftsAtRisk?.length && (
              <Button appearance="primary" onClick={() => execute(false)}>Pull</Button>
            )}
            {step === 'review' && (data?.hasConflicts || data?.draftsAtRisk?.length > 0) && (
              <Button appearance="primary" onClick={() => execute(true)}>Force Pull</Button>
            )}
            {step === 'error' && (
              <Button appearance="primary" onClick={() => { gitOp.clear(); prepare(); }}>Retry</Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
