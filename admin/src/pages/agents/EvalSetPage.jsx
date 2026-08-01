import { useState, useEffect, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Field,
  Button,
  Spinner,
  Badge,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Tooltip,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
} from '@fluentui/react-components';
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PlayRegular,
  BeakerRegular,
} from '@fluentui/react-icons';
import { evalExamplesApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500 },
  actions: { display: 'flex', gap: '8px' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '10px 14px',
    backgroundColor: tokens.colorNeutralBackground1,
    '&:hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  utterance: { flex: 1, fontSize: tokens.fontSizeBase300 },
  cardActions: { display: 'flex', gap: '4px' },
  panel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '16px',
    marginBottom: '16px',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  panelTitle: { fontWeight: tokens.fontWeightSemibold, marginBottom: '10px', display: 'block' },
  accuracyBig: { fontSize: tokens.fontSizeHero700, fontWeight: tokens.fontWeightBold },
  reason: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '16px' },
  mono: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
});

const EMPTY = { utterance: '', expectedAgent: '' };

export default function EvalSetPage() {
  const styles = useStyles();
  const [examples, setExamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setExamples(await evalExamplesApi.getAll());
    } catch (err) {
      showMessage('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const openAdd = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (ex) => { setEditing(ex); setForm({ utterance: ex.utterance, expectedAgent: ex.expectedAgent }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.utterance.trim() || !form.expectedAgent.trim()) {
      showMessage('error', 'Utterance and expected agent are required.');
      return;
    }
    setSaving(true);
    try {
      if (editing) await evalExamplesApi.update(editing._id, form);
      else await evalExamplesApi.create(form);
      setDialogOpen(false);
      setReport(null); // corpus changed — old report is stale
      await load();
      showMessage('success', editing ? 'Example updated.' : 'Example added.');
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await evalExamplesApi.delete(deleteTarget._id);
      setDeleteTarget(null);
      setReport(null);
      await load();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
      setDeleteTarget(null);
    }
  };

  const runEvals = async () => {
    setRunning(true);
    setReport(null);
    try {
      setReport(await evalExamplesApi.run());
    } catch (err) {
      showMessage('error', `Run failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  const agents = [...new Set(examples.map((e) => e.expectedAgent))].sort();

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Routing Eval-set</Text>
          <div className={styles.actions}>
            <Button appearance="outline" icon={<PlayRegular />} onClick={runEvals} disabled={running || examples.length === 0} size="small">
              {running ? 'Running...' : 'Run Evals'}
            </Button>
            <Button appearance="primary" icon={<AddRegular />} onClick={openAdd} size="small">Add Example</Button>
          </div>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 16 }}>
          Labeled examples (utterance → expected agent) train and measure routing. They serve as runtime routing signal and as the accuracy harness below. Add production misroutes here to improve routing over time.
        </Text>

        {/* Eval report */}
        {report && (
          <div className={styles.panel}>
            <Text className={styles.panelTitle}><BeakerRegular /> Eval report (leave-one-out)</Text>
            <div style={{ display: 'flex', gap: 24, alignItems: 'baseline', marginBottom: 12 }}>
              <div>
                <span className={styles.accuracyBig}>{report.accuracy != null ? `${(report.accuracy * 100).toFixed(1)}%` : '—'}</span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}> accuracy ({report.correct}/{report.total})</Text>
              </div>
            </div>
            <Table size="small" style={{ marginBottom: 12 }}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Agent</TableHeaderCell>
                  <TableHeaderCell>Accuracy</TableHeaderCell>
                  <TableHeaderCell>Confusion (predicted → count)</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((a) => {
                  const pa = report.perAgent?.[a];
                  const conf = report.confusion?.[a] || {};
                  return (
                    <TableRow key={a}>
                      <TableCell>{a}</TableCell>
                      <TableCell>{pa ? `${(pa.accuracy * 100).toFixed(0)}% (${pa.correct}/${pa.total})` : '—'}</TableCell>
                      <TableCell className={styles.mono}>
                        {Object.entries(conf).map(([p, n]) => `${p}: ${n}`).join('  ·  ')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {report.misroutes?.length > 0 && (
              <div>
                <Text size={200} weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>Misroutes ({report.misroutes.length}):</Text>
                {report.misroutes.map((m, i) => (
                  <div key={i} className={styles.reason}>
                    "{m.utterance}" — expected <b>{m.expected}</b>, got <b>{m.predicted}</b> ({m.score})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Example list */}
        {examples.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <BeakerRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No eval examples yet. Add labeled utterances to train and measure routing.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {examples.map((ex) => (
              <div key={ex._id} className={styles.card}>
                <Badge appearance="tint" color="brand">{ex.expectedAgent}</Badge>
                <span className={styles.utterance}>{ex.utterance}</span>
                <div className={styles.cardActions}>
                  <Tooltip content="Edit" relationship="label">
                    <Button appearance="subtle" size="small" icon={<EditRegular />} onClick={() => openEdit(ex)} />
                  </Tooltip>
                  <Tooltip content="Delete" relationship="label">
                    <Button appearance="subtle" size="small" icon={<DeleteRegular />} onClick={() => setDeleteTarget(ex)} />
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editing ? 'Edit Example' : 'Add Example'}</DialogTitle>
            <DialogContent>
              <div className={styles.formGrid}>
                <Field label="Utterance" required hint="A phrase a user might type that should route to the agent below.">
                  <Input value={form.utterance} onChange={(e, d) => setForm((f) => ({ ...f, utterance: d.value }))} placeholder="e.g. log 8 hours on the migration project" />
                </Field>
                <Field label="Expected agent" required hint="The agent slug this utterance should route to.">
                  <Input value={form.expectedAgent} onChange={(e, d) => setForm((f) => ({ ...f, expectedAgent: d.value }))} placeholder="e.g. timesheet-agent" list="agent-slugs" />
                </Field>
                <datalist id="agent-slugs">
                  {agents.map((a) => <option key={a} value={a} />)}
                </datalist>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : (editing ? 'Update' : 'Add')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Example"
        message={`Delete this eval example for "${deleteTarget?.expectedAgent}"?`}
      />
    </div>
  );
}
