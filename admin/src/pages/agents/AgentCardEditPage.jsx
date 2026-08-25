import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Input,
  Textarea,
  Field,
  Button,
  Spinner,
  Badge,
  Checkbox,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
  Tooltip,
  TabList,
  Tab,
  Switch,
} from '@fluentui/react-components';
import { ArrowLeftRegular, SaveRegular, InfoRegular, ArrowResetRegular } from '@fluentui/react-icons';
import { agentCardsApi, aiProvidersApi } from '../../api/index.js';

const useStyles = makeStyles({
  page: { maxWidth: '1000px' },
  pageBody: { padding: '16px 24px' },
  header: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500, flex: 1 },
  section: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '16px',
    marginBottom: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sectionTitle: { fontWeight: tokens.fontWeightSemibold, display: 'block', marginBottom: '12px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  fullWidth: { gridColumn: 'span 2' },
  mono: { fontFamily: 'monospace', fontSize: tokens.fontSizeBase200 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' },
  fileChips: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
});

const DEFAULT_PROVIDER_VALUE = '__default__';
const SAME_AS_CARD_VALUE = '__card__';
// Mirrors VERIFY_CLAIM_DEFAULTS on the server (numbers kept as strings for the inputs).
const VERIFY_FORM_DEFAULTS = { enabled: false, maxIterations: '2', similarityCheck: true, similarityThreshold: '0.98', aiProviderId: '' };

function verifyToForm(vc) {
  if (!vc) return { ...VERIFY_FORM_DEFAULTS };
  return {
    enabled: vc.enabled === true,
    maxIterations: String(vc.maxIterations ?? 2),
    similarityCheck: vc.similarityCheck !== false,
    similarityThreshold: String(vc.similarityThreshold ?? 0.98),
    aiProviderId: vc.aiProviderId || '',
  };
}

export default function AgentCardEditPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { slug } = useParams();
  const isNew = !slug;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [providers, setProviders] = useState([]);
  const [card, setCard] = useState(null);

  const [form, setForm] = useState({
    slug: '', name: '', description: '', aiProviderId: '', enabled: true, agentMd: '',
  });
  // Tool grants: registry catalogue + this card's granted names (manifest.tools).
  const [registryTools, setRegistryTools] = useState([]);
  const [grantedTools, setGrantedTools] = useState([]);
  // Copy-on-write template state: the editor ALWAYS shows the effective
  // template; it only persists to the card folder once deliberately edited.
  const [templateText, setTemplateText] = useState('');
  const [hasOverride, setHasOverride] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [originalProviderId, setOriginalProviderId] = useState('');
  // Verify/claim tab (manifest.verifyClaim + verifier.md). Never shown for master.
  const [tab, setTab] = useState('general');
  const [verify, setVerify] = useState({ ...VERIFY_FORM_DEFAULTS });
  const [verifierMd, setVerifierMd] = useState('');
  const [defaultVerifierMd, setDefaultVerifierMd] = useState('');

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  // The provider whose template the card inherits when it has no override:
  // its bound provider, else the default (first enabled by name — mirrors the server).
  const resolveProvider = useCallback((providerId, providerList) => {
    if (providerId) {
      const bound = providerList.find((p) => p._id === providerId);
      if (bound) return bound;
    }
    return providerList.filter((p) => p.enabled !== false)[0] || null;
  }, []);

  const inheritedTemplateText = useCallback((providerId, providerList) => {
    const provider = resolveProvider(providerId, providerList);
    return provider ? JSON.stringify(provider.payloadTemplate || {}, null, 2) : '{}';
  }, [resolveProvider]);

  useEffect(() => {
    (async () => {
      try {
        const [providerList, toolList] = await Promise.all([
          aiProvidersApi.getAll(),
          agentCardsApi.getTools().catch(() => []),
        ]);
        setProviders(providerList);
        setRegistryTools(toolList);
        if (!isNew) {
          const detail = await agentCardsApi.getBySlug(slug);
          setCard(detail);
          setForm({
            slug: detail.slug,
            name: detail.name || '',
            description: detail.description || '',
            aiProviderId: detail.aiProviderId || '',
            enabled: detail.enabled !== false,
            agentMd: detail.agentMd || '',
          });
          setGrantedTools(Array.isArray(detail.tools) ? detail.tools : []);
          setVerify(verifyToForm(detail.verifyClaim));
          setVerifierMd(detail.verifierMd || '');
          setDefaultVerifierMd(detail.defaultVerifierMd || '');
          setOriginalProviderId(detail.aiProviderId || '');
          setHasOverride(!!detail.hasPayloadTemplate);
          setTemplateText(
            detail.hasPayloadTemplate
              ? JSON.stringify(detail.payloadTemplate, null, 2)
              : inheritedTemplateText(detail.aiProviderId, providerList),
          );
        } else {
          setTemplateText(inheritedTemplateText('', providerList));
        }
      } catch (err) {
        showMessage('error', `Failed to load: ${err.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, isNew, inheritedTemplateText]);

  const isMaster = card?.isMaster;
  const providerSwitchedWithOverride =
    !isNew && (hasOverride || templateDirty) && (form.aiProviderId || '') !== originalProviderId;

  const onProviderChange = (providerId) => {
    setForm((f) => ({ ...f, aiProviderId: providerId }));
    // Copy-on-write: while inherited and untouched, follow the new provider's
    // template. An authored override is KEPT (warned about, never destroyed).
    if (!hasOverride && !templateDirty) {
      setTemplateText(inheritedTemplateText(providerId, providers));
    }
  };

  const onTemplateEdit = (value) => {
    setTemplateText(value);
    setTemplateDirty(true);
  };

  const resetToProviderTemplate = () => {
    setHasOverride(false);
    setTemplateDirty(false);
    setTemplateText(inheritedTemplateText(form.aiProviderId, providers));
  };

  const toggleTool = (name, checked) => {
    setGrantedTools((prev) => (checked ? [...new Set([...prev, name])] : prev.filter((t) => t !== name)));
  };

  // Granted names no longer in the registry (tool retired from the code
  // registry) — kept on the manifest, skipped at runtime; shown so they can
  // be revoked deliberately.
  const staleGrants = useMemo(
    () => grantedTools.filter((t) => !registryTools.some((rt) => rt.name === t)),
    [grantedTools, registryTools],
  );

  const handleSave = async () => {
    if (!form.name.trim()) return showMessage('error', 'Name is required.');
    if (isNew && !/^[a-z0-9][a-z0-9-]{1,48}$/.test(form.slug)) {
      return showMessage('error', 'Slug must be 2-49 chars of a-z, 0-9 and hyphens.');
    }
    const overriding = hasOverride || templateDirty;
    let payloadTemplate = null;
    if (overriding) {
      try {
        payloadTemplate = JSON.parse(templateText);
      } catch {
        return showMessage('error', 'Payload template is not valid JSON.');
      }
    }
    // Verify/claim block (non-master only) — the server validates again.
    let verifyClaim;
    if (!isMaster) {
      const maxIterations = Number(verify.maxIterations);
      const similarityThreshold = Number(verify.similarityThreshold);
      if (!Number.isInteger(maxIterations) || maxIterations < 0 || maxIterations > 5) {
        return showMessage('error', 'Max revise rounds must be a whole number between 0 and 5.');
      }
      if (!Number.isFinite(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 1) {
        return showMessage('error', 'Similarity threshold must be between 0 and 1.');
      }
      verifyClaim = {
        enabled: verify.enabled,
        maxIterations,
        similarityCheck: verify.similarityCheck,
        similarityThreshold,
        aiProviderId: verify.aiProviderId || null,
      };
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        aiProviderId: form.aiProviderId || null,
        enabled: form.enabled,
        tools: grantedTools,
        agentMd: form.agentMd,
        payloadTemplate,
        ...(isMaster ? {} : { verifyClaim, verifierMd }),
      };
      if (isNew) {
        const created = await agentCardsApi.create({ ...payload, slug: form.slug });
        showMessage('success', 'Agent created.');
        navigate(`/agents/cards/${created.slug}`, { replace: true });
      } else {
        const updated = await agentCardsApi.update(slug, payload);
        setCard(updated);
        setGrantedTools(Array.isArray(updated.tools) ? updated.tools : []);
        setVerify(verifyToForm(updated.verifyClaim));
        setVerifierMd(updated.verifierMd || '');
        setDefaultVerifierMd(updated.defaultVerifierMd || defaultVerifierMd);
        setHasOverride(!!updated.hasPayloadTemplate);
        setTemplateDirty(false);
        setOriginalProviderId(updated.aiProviderId || '');
        if (!updated.hasPayloadTemplate) {
          setTemplateText(inheritedTemplateText(updated.aiProviderId, providers));
        }
        showMessage('success', 'Agent saved.');
      }
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedProviderName = useMemo(() => {
    if (!form.aiProviderId) return 'Default provider';
    return providers.find((p) => p._id === form.aiProviderId)?.name || 'Default provider';
  }, [form.aiProviderId, providers]);

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={() => navigate('/agents/cards')} size="small" />
          <Text className={styles.title}>
            {isNew ? 'New Agent Card' : `${form.name || slug}`}{' '}
            {isMaster && <Badge appearance="filled" color="brand" size="small">Master</Badge>}
          </Text>
          <Button appearance="primary" icon={<SaveRegular />} onClick={handleSave} disabled={saving} size="small">
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {!isMaster && (
          <TabList selectedValue={tab} onTabSelect={(e, d) => setTab(d.value)} style={{ marginBottom: 16 }}>
            <Tab value="general">General</Tab>
            <Tab value="verifier">
              Verifier{' '}
              {verify.enabled && <Badge appearance="tint" color="success" size="small">on</Badge>}
            </Tab>
          </TabList>
        )}

        {tab === 'verifier' && !isMaster && (
          <div className={styles.section}>
            <Text className={styles.sectionTitle}>Verify / Claim</Text>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 12 }}>
              When enabled, every answer this agent gives during a consultation is checked by a verifier against the
              agent's own context — its instructions, the request, and the tool results it gathered. Statements that
              cannot be confirmed go back to the agent as a critique; it revises (without tools); the loop stops when
              every statement is supported, when a revision stops changing, or at the cap. The user never sees the
              loop — only the master's relay, with a marker when statements remain unconfirmed.
            </Text>
            <div className={styles.grid}>
              <Field label="Verification">
                <Switch
                  checked={verify.enabled}
                  onChange={(e, d) => {
                    setVerify((v) => ({ ...v, enabled: d.checked }));
                    // Start from the built-in rubric rather than a blank box.
                    if (d.checked && !verifierMd.trim() && defaultVerifierMd) setVerifierMd(defaultVerifierMd);
                  }}
                  label={verify.enabled ? 'Enabled' : 'Disabled'}
                />
              </Field>
              <Field label="Verifier provider" hint="Checking with a different model than the one answering catches more. 'Same as card' inherits the card's provider.">
                <Dropdown
                  disabled={!verify.enabled}
                  value={verify.aiProviderId ? (providers.find((p) => p._id === verify.aiProviderId)?.name || 'Same as card') : 'Same as card'}
                  selectedOptions={[verify.aiProviderId || SAME_AS_CARD_VALUE]}
                  onOptionSelect={(e, d) => setVerify((v) => ({ ...v, aiProviderId: d.optionValue === SAME_AS_CARD_VALUE ? '' : d.optionValue }))}
                >
                  <Option value={SAME_AS_CARD_VALUE}>Same as card</Option>
                  {providers.map((p) => <Option key={p._id} value={p._id}>{p.name}</Option>)}
                </Dropdown>
              </Field>
              <Field label="Max revise rounds" hint="How many times the agent may revise after a failed check (0–5). 0 = shadow mode: verify once, log the ledger, deliver the answer unchanged.">
                <Input
                  type="number" min={0} max={5} step={1}
                  disabled={!verify.enabled}
                  value={verify.maxIterations}
                  onChange={(e, d) => setVerify((v) => ({ ...v, maxIterations: d.value }))}
                />
              </Field>
              <Field label="Early stop on a near-identical revision" hint="Compares each revision with the previous draft. Stops the loop when they are near-identical AND no figure changed — another check would not help.">
                <Switch
                  disabled={!verify.enabled}
                  checked={verify.similarityCheck}
                  onChange={(e, d) => setVerify((v) => ({ ...v, similarityCheck: d.checked }))}
                  label={verify.similarityCheck ? 'Enabled' : 'Disabled — always run to the cap'}
                />
              </Field>
              <Field label="Similarity threshold" hint="Cosine similarity (0–1) above which two drafts count as near-identical. Rewording scores ~0.99; a changed figure ~0.97.">
                <Input
                  type="number" min={0} max={1} step={0.01}
                  disabled={!verify.enabled || !verify.similarityCheck}
                  value={verify.similarityThreshold}
                  onChange={(e, d) => setVerify((v) => ({ ...v, similarityThreshold: d.value }))}
                />
              </Field>
            </div>
            <Field
              label="Verifier instructions (verifier.md)"
              hint="The verifier's system prompt for THIS agent — what counts as a claim, how strict to be, what to recompute. It receives the agent's instructions, the agent's context and the answer, and must report through the report_claims tool. Blank = built-in rubric."
              style={{ marginTop: 16 }}
            >
              <Textarea
                className={styles.mono}
                disabled={!verify.enabled}
                value={verifierMd}
                onChange={(e, d) => setVerifierMd(d.value)}
                rows={16}
                placeholder={isNew ? 'Blank = built-in rubric (shown here once the card is created).' : 'Blank = built-in rubric.'}
              />
            </Field>
            {defaultVerifierMd && verifierMd !== defaultVerifierMd && (
              <Button
                appearance="outline" size="small" icon={<ArrowResetRegular />}
                disabled={!verify.enabled}
                onClick={() => setVerifierMd(defaultVerifierMd)}
                style={{ marginTop: 8 }}
              >
                Load built-in rubric
              </Button>
            )}
            <div className={styles.hint}>
              <InfoRegular />
              <span>Each verification round writes a VERIFY line to the log (debug level) — filter the log viewer by the conversation's trace id to read the claim ledger.</span>
            </div>
          </div>
        )}

        {tab === 'general' && (<>
        <div className={styles.section}>
          <Text className={styles.sectionTitle}>Identity</Text>
          <div className={styles.grid}>
            <Field label="Name" required>
              <Input value={form.name} onChange={(e, d) => setForm((f) => ({ ...f, name: d.value }))} placeholder="e.g. Timesheet Helper" />
            </Field>
            <Field label="Slug (@mention handle)" required hint={isNew ? 'Lowercase letters, digits, hyphens. Becomes the folder name — cannot change later.' : 'Fixed (folder name).'}>
              <Input className={styles.mono} value={form.slug} disabled={!isNew} onChange={(e, d) => setForm((f) => ({ ...f, slug: d.value.toLowerCase() }))} placeholder="timesheet-helper" />
            </Field>
            <div className={styles.fullWidth}>
              <Field label="Description" required={!isMaster} hint="Feeds the routing corpus — write what requests this agent should receive; routing matches user utterances against it.">
                <Textarea value={form.description} onChange={(e, d) => setForm((f) => ({ ...f, description: d.value }))} rows={2} placeholder="e.g. Logs and reviews timesheet hours, daily time entries and working days" />
              </Field>
            </div>
            <Field label="AI Provider">
              <Dropdown
                value={selectedProviderName}
                selectedOptions={[form.aiProviderId || DEFAULT_PROVIDER_VALUE]}
                onOptionSelect={(e, d) => onProviderChange(d.optionValue === DEFAULT_PROVIDER_VALUE ? '' : d.optionValue)}
              >
                <Option value={DEFAULT_PROVIDER_VALUE}>Default provider</Option>
                {providers.map((p) => <Option key={p._id} value={p._id}>{p.name}</Option>)}
              </Dropdown>
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Checkbox
                label="Enabled"
                checked={form.enabled}
                disabled={isMaster}
                onChange={(e, d) => setForm((f) => ({ ...f, enabled: d.checked }))}
              />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <Text className={styles.sectionTitle}>Definition (agent.md)</Text>
          <Field hint="The agent's persona and behaviour — provider-agnostic system prompt.">
            <Textarea
              className={styles.mono}
              value={form.agentMd}
              onChange={(e, d) => setForm((f) => ({ ...f, agentMd: d.value }))}
              rows={14}
              placeholder="You are the ... specialist for this application. ..."
            />
          </Field>
        </div>

        <div className={styles.section}>
          <Text className={styles.sectionTitle}>Tools</Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 12 }}>
            App tools this agent may use. Read tools run immediately during a conversation;
            write tools always propose an action card the user must confirm.
            Execution runs under the caller's identity — security roles still apply.
          </Text>
          {registryTools.length === 0 ? (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Tool registry unavailable.</Text>
          ) : (
            <div className={styles.grid}>
              {registryTools.map((t) => (
                <Checkbox
                  key={t.name}
                  checked={grantedTools.includes(t.name)}
                  onChange={(e, d) => toggleTool(t.name, d.checked)}
                  label={
                    <span>
                      <span className={styles.mono}>{t.name}</span>{' '}
                      <Badge appearance="tint" size="small" color={t.kind === 'write' ? 'warning' : 'informative'}>
                        {t.kind === 'write' ? 'write — needs confirmation' : 'read'}
                      </Badge>
                      <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>
                        {(t.description || '').split('\n')[0]}
                      </Text>
                    </span>
                  }
                />
              ))}
            </div>
          )}
          {staleGrants.length > 0 && (
            <MessageBar intent="warning" style={{ marginTop: 8 }}>
              <MessageBarBody>
                Granted tools no longer in the registry (skipped at runtime — untick to revoke):{' '}
                {staleGrants.map((t) => (
                  <Checkbox key={t} checked onChange={(e, d) => toggleTool(t, d.checked)} label={<span className={styles.mono}>{t}</span>} />
                ))}
              </MessageBarBody>
            </MessageBar>
          )}
        </div>

        <div className={styles.section}>
          <Text className={styles.sectionTitle}>Payload Template</Text>
          {providerSwitchedWithOverride && (
            <MessageBar intent="warning" style={{ marginBottom: 8 }}>
              <MessageBarBody>
                This card overrides its payload template, authored against the previous provider.
                The override is kept — review it against the new provider's schema, or reset to inherit.
              </MessageBarBody>
            </MessageBar>
          )}
          <Field>
            <Textarea className={styles.mono} value={templateText} onChange={(e, d) => onTemplateEdit(d.value)} rows={12} />
          </Field>
          <div className={styles.hint}>
            <InfoRegular />
            {hasOverride || templateDirty ? (
              <span>Card override — stored as payload_template.json in the card folder; provider template changes will NOT affect this card.</span>
            ) : (
              <Tooltip content="The template below is read from the configured AI Provider. It is not persisted on the card unless you deliberately edit it." relationship="description">
                <span>Loaded from AI Provider ({selectedProviderName}) — edit to create a card-level override.</span>
              </Tooltip>
            )}
          </div>
          {(hasOverride || templateDirty) && (
            <Button appearance="outline" size="small" icon={<ArrowResetRegular />} onClick={resetToProviderTemplate} style={{ marginTop: 8 }}>
              Reset to provider template
            </Button>
          )}
        </div>

        {!isNew && (
          <div className={styles.section}>
            <Text className={styles.sectionTitle}>Folder Contents</Text>
            <div className={styles.grid}>
              <Field label="knowledge/">
                <div className={styles.fileChips}>
                  {card?.files?.knowledge?.length
                    ? card.files.knowledge.map((f) => <Badge key={f} appearance="tint" size="small">{f}</Badge>)
                    : <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Empty — RAG source files (consumed in a later phase).</Text>}
                </div>
              </Field>
              <Field label="skills/">
                <div className={styles.fileChips}>
                  {card?.files?.skills?.length
                    ? card.files.skills.map((f) => <Badge key={f} appearance="tint" size="small">{f}</Badge>)
                    : <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Empty — on-demand instruction files (later phase).</Text>}
                </div>
              </Field>
            </div>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
