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
  Switch,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  Tooltip,
} from '@fluentui/react-components';
import {
  SaveRegular,
  ArrowSyncRegular,
  TargetRegular,
  SettingsRegular,
  DatabaseRegular,
} from '@fluentui/react-icons';
import { routingApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500 },
  section: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '16px',
    marginBottom: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionTitle: { fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' },
  sectionHint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, display: 'block', marginBottom: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fullWidth: { gridColumn: 'span 2' },
  mono: { fontFamily: 'monospace' },
  statusRow: { display: 'flex', gap: '24px', alignItems: 'baseline', flexWrap: 'wrap' },
  statusItem: { display: 'flex', flexDirection: 'column' },
  statusLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px' },
  statusValue: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  probeRow: { display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' },
  reason: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
});

const TIER_META = {
  'auto-route': { color: 'success', label: 'auto-route (ground truth)', hint: 'Routes DIRECTLY to the specialist — no master round.' },
  evidence: { color: 'brand', label: 'evidence', hint: 'Candidates are attached to the conversation; the master decides.' },
  'below-floor': { color: 'warning', label: 'below floor', hint: 'No routing evidence attached — the master answers on its own.' },
};

export default function RoutingPage() {
  const styles = useStyles();
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState(null);
  const [probeText, setProbeText] = useState('');
  const [probeResult, setProbeResult] = useState(null);
  const [probing, setProbing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([routingApi.getConfig(), routingApi.getStatus().catch(() => null)]);
      setConfig(cfg);
      setStatus(st);
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

  const set = (field) => (value) => setConfig((c) => ({ ...c, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await routingApi.updateConfig(config);
      setConfig(updated);
      showMessage('success', 'Routing configuration saved — applies from the next message.');
      routingApi.getStatus().then(setStatus).catch(() => {});
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const st = await routingApi.rebuild();
      setStatus(st);
      showMessage('success', `Index rebuilt: ${st.entries} entries (${st.counts?.eval || 0} eval, ${st.counts?.card || 0} card).`);
    } catch (err) {
      showMessage('error', `Rebuild failed: ${err.message}`);
    } finally {
      setRebuilding(false);
    }
  };

  const runProbe = async () => {
    if (!probeText.trim()) return;
    setProbing(true);
    setProbeResult(null);
    try {
      setProbeResult(await routingApi.probe(probeText.trim()));
    } catch (err) {
      showMessage('error', `Probe failed: ${err.message}`);
    } finally {
      setProbing(false);
    }
  };

  if (loading || !config) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  const tierMeta = probeResult ? TIER_META[probeResult.tier] : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Routing</Text>
          <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving} size="small">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {/* Behaviour */}
        <div className={styles.section}>
          <Text className={styles.sectionTitle}><SettingsRegular /> Behaviour</Text>
          <Text className={styles.sectionHint}>
            Every master turn the router scores the message against the corpus (eval examples + card descriptions), then:
            score ≥ auto-route threshold → the specialist answers directly (ground truth);
            score ≥ evidence floor → candidates are attached and the master decides;
            below → the master answers on its own.
          </Text>
          <div className={styles.grid}>
            <Field label="Ground-truth auto-route">
              <Switch
                checked={config.autoRouteEnabled !== false}
                onChange={(e, d) => set('autoRouteEnabled')(d.checked)}
                label={config.autoRouteEnabled !== false ? 'Enabled' : 'Disabled — everything goes through the master'}
              />
            </Field>
            <Field label="Auto-route threshold" hint="Similarity (0-1) counting as a known utterance. Exact eval-set matches score ~1.0; paraphrases typically 0.6-0.85.">
              <Input type="number" min={0} max={1} step={0.01} value={String(config.autoRouteThreshold)} onChange={(e, d) => set('autoRouteThreshold')(d.value)} disabled={config.autoRouteEnabled === false} />
            </Field>
            <Field label="Evidence attachment">
              <Switch
                checked={config.evidenceEnabled !== false}
                onChange={(e, d) => set('evidenceEnabled')(d.checked)}
                label={config.evidenceEnabled !== false ? 'Enabled' : 'Disabled — master must call find_agent itself'}
              />
            </Field>
            <Field label="Evidence floor" hint="Matches below this attach nothing (keeps small talk clean).">
              <Input type="number" min={0} max={1} step={0.01} value={String(config.evidenceFloor)} onChange={(e, d) => set('evidenceFloor')(d.value)} disabled={config.evidenceEnabled === false} />
            </Field>
            <Field label="Max candidates shown" hint="How many candidates the master sees (evidence and find_agent results).">
              <Input type="number" min={1} max={20} value={String(config.maxCandidates)} onChange={(e, d) => set('maxCandidates')(d.value)} />
            </Field>
          </div>
        </div>

        {/* Advanced */}
        <div className={styles.section}>
          <Text className={styles.sectionTitle}><SettingsRegular /> Advanced</Text>
          <Text className={styles.sectionHint}>
            Expert knobs — changes affecting the corpus or model rebuild the index automatically on next use.
          </Text>
          <div className={styles.grid}>
            <Field label="Retrieval top-K" hint="Nearest corpus entries considered per query before per-agent aggregation.">
              <Input type="number" min={1} max={200} value={String(config.topK)} onChange={(e, d) => set('topK')(d.value)} />
            </Field>
            <Field label="Score aggregation" hint="max: an agent scores by its best match. mean: averages its retrieved matches — rewards broad support, dilutes one-off hits.">
              <Dropdown
                value={config.aggregation}
                selectedOptions={[config.aggregation]}
                onOptionSelect={(e, d) => set('aggregation')(d.optionValue)}
              >
                <Option value="max">max</Option>
                <Option value="mean">mean</Option>
              </Dropdown>
            </Field>
            <div className={styles.fullWidth}>
              <Field label="Embedding model" hint="HuggingFace model id with ONNX weights (Xenova/* exports). Changing it downloads the model on next use (size varies) and rebuilds the index; the eval harness is your regression check afterwards.">
                <Input className={styles.mono} value={config.embeddingModel} onChange={(e, d) => set('embeddingModel')(d.value)} placeholder="Xenova/all-MiniLM-L6-v2" />
              </Field>
            </div>
            <Field label="Corpus: eval examples">
              <Switch checked={config.includeEvalExamples !== false} onChange={(e, d) => set('includeEvalExamples')(d.checked)} label={config.includeEvalExamples !== false ? 'Included' : 'Excluded'} />
            </Field>
            <Field label="Corpus: card descriptions">
              <Switch checked={config.includeCardDescriptions !== false} onChange={(e, d) => set('includeCardDescriptions')(d.checked)} label={config.includeCardDescriptions !== false ? 'Included' : 'Excluded'} />
            </Field>
            <Field label="Master tool-loop rounds" hint="Tool iterations before the master is forced to produce a final answer without tools.">
              <Input type="number" min={1} max={10} value={String(config.maxToolIterations)} onChange={(e, d) => set('maxToolIterations')(d.value)} />
            </Field>
          </div>
        </div>

        {/* Index */}
        <div className={styles.section}>
          <Text className={styles.sectionTitle}><DatabaseRegular /> Vector Index</Text>
          {status ? (
            <div className={styles.statusRow}>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Entries</span>
                <span className={styles.statusValue}>{status.entries}</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Eval / Card</span>
                <span className={styles.statusValue}>{status.counts?.eval || 0} / {status.counts?.card || 0}</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Model</span>
                <span className={`${styles.statusValue} ${styles.mono}`} style={{ fontSize: 13 }}>{status.model}</span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>Built</span>
                <span className={styles.statusValue} style={{ fontSize: 13 }}>{status.builtAt ? new Date(status.builtAt).toLocaleString('en-GB') : '—'}</span>
              </div>
              <Button appearance="outline" size="small" icon={<ArrowSyncRegular />} onClick={handleRebuild} disabled={rebuilding} style={{ marginLeft: 'auto' }}>
                {rebuilding ? 'Rebuilding...' : 'Rebuild Index'}
              </Button>
            </div>
          ) : (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Index not built yet (builds on first use — first build downloads the embedding model).
            </Text>
          )}
        </div>

        {/* Probe */}
        <div className={styles.section}>
          <Text className={styles.sectionTitle}><TargetRegular /> Route Probe</Text>
          <Text className={styles.sectionHint}>Test an utterance against the CURRENT configuration and see which tier it lands in.</Text>
          <div className={styles.probeRow}>
            <Field style={{ flex: 1 }}>
              <Input value={probeText} onChange={(e, d) => setProbeText(d.value)} placeholder="e.g. calculate the VAT on £50" onKeyDown={(e) => { if (e.key === 'Enter') runProbe(); }} />
            </Field>
            <Button appearance="outline" onClick={runProbe} disabled={probing || !probeText.trim()}>{probing ? '...' : 'Probe'}</Button>
          </div>
          {probeResult && (
            probeResult.top ? (
              <div>
                <Text>
                  <Tooltip content={tierMeta?.hint || ''} relationship="description">
                    <Badge appearance="filled" color={tierMeta?.color || 'informative'}>{tierMeta?.label || probeResult.tier}</Badge>
                  </Tooltip>
                  {' '}→ <Badge appearance="tint" color="brand">{probeResult.top.agent}</Badge>{' '}
                  <span className={styles.mono} style={{ fontSize: 12 }}>score {probeResult.top.score}</span>
                </Text>
                <div className={styles.reason}>because: "{probeResult.top.reasons?.[0]?.text}"</div>
                {probeResult.candidates.length > 1 && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    others: {probeResult.candidates.slice(1).map((c) => `${c.agent} (${c.score})`).join(', ')}
                  </Text>
                )}
              </div>
            ) : <Text size={200}>No candidates — the corpus is empty (add eval examples or agent descriptions).</Text>
          )}
        </div>
      </div>
    </div>
  );
}
