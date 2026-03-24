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
  Checkbox,
  Textarea,
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
  TabList,
  Tab,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowSyncRegular,
  DeleteRegular,
  EditRegular,
  PlugConnectedRegular,
  TicketDiagonalRegular,
} from '@fluentui/react-icons';
import { ticketSourcesApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const useStyles = makeStyles({
  page: {
    maxWidth: '1000px',
  },
  pageBody: {
    padding: '16px 24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  tabs: {
    marginBottom: '16px',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '12px 16px',
    backgroundColor: tokens.colorNeutralBackground1,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      borderColor: tokens.colorNeutralStroke1Hover,
    },
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  cardHeaderActions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: '4px',
  },
  cardColourSwatch: {
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    flexShrink: 0,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  cardName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '4px',
    paddingBottom: '4px',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  metaLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  metaValue: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  cardFooter: {
    marginTop: '8px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: '8px',
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
    maxWidth: '500px',
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
  },
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: '4px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  fullWidth: {
    gridColumn: 'span 2',
  },
  colourField: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

const JIRA_DEFAULTS = { name: '', baseUrl: '', email: '', apiToken: '', preQuery: '', colour: '#0078D4', enabled: true, refreshIntervalMinutes: '' };
const ADO_DEFAULTS = { name: '', baseUrl: '', pat: '', apiVersion: '7.1', preQuery: '', colour: '#0078D4', enabled: true, refreshIntervalMinutes: '' };

function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.length > 1 ? u.pathname : ''}`;
  } catch {
    return url.length > 50 ? `${url.slice(0, 30)}...${url.slice(-12)}` : url;
  }
}

export default function TicketSourcesPage() {
  const styles = useStyles();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('jira');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [formData, setFormData] = useState(JIRA_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadSources = useCallback(async () => {
    try {
      const data = await ticketSourcesApi.getAll();
      setSources(data);
    } catch (err) {
      showMessage('error', `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const showMessage = (intent, text) => {
    setMessage({ intent, text });
    if (intent === 'success') setTimeout(() => setMessage(null), 4000);
  };

  const tabSources = sources.filter((s) => s.type === activeTab);

  // ── Dialog open/close ──

  const openAdd = () => {
    setEditingSource(null);
    setFormData(activeTab === 'jira' ? { ...JIRA_DEFAULTS } : { ...ADO_DEFAULTS });
    setDialogOpen(true);
  };

  const openEdit = (source) => {
    setEditingSource(source);
    if (source.type === 'jira') {
      setFormData({
        name: source.name,
        baseUrl: source.baseUrl,
        email: source.email || '',
        apiToken: source.apiToken || '',
        preQuery: source.preQuery || '',
        colour: source.colour || '#0078D4',
        enabled: source.enabled !== false,
        refreshIntervalMinutes: source.refreshIntervalMinutes || '',
      });
    } else {
      setFormData({
        name: source.name,
        baseUrl: source.baseUrl,
        pat: source.pat || '',
        apiVersion: source.apiVersion || '7.1',
        preQuery: source.preQuery || '',
        colour: source.colour || '#0078D4',
        enabled: source.enabled !== false,
        refreshIntervalMinutes: source.refreshIntervalMinutes || '',
      });
    }
    setDialogOpen(true);
  };

  // ── Handlers ──

  const handleSaveSource = async () => {
    if (!formData.name || !formData.baseUrl) {
      showMessage('error', 'Name and Base URL are required.');
      return;
    }
    setSaving(true);
    try {
      const type = editingSource ? editingSource.type : activeTab;
      const payload = {
        ...formData,
        type,
        refreshIntervalMinutes: formData.refreshIntervalMinutes ? Number(formData.refreshIntervalMinutes) : null,
      };
      if (editingSource) {
        await ticketSourcesApi.update(editingSource._id, payload);
        showMessage('success', 'Ticket source updated.');
      } else {
        await ticketSourcesApi.create(payload);
        showMessage('success', 'Ticket source added.');
      }
      setDialogOpen(false);
      await loadSources();
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      const result = await ticketSourcesApi.refresh(id);
      showMessage('success', `Refreshed: ${result.count} tickets cached.`);
      await loadSources();
    } catch (err) {
      showMessage('error', `Refresh failed: ${err.message}`);
      await loadSources();
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      const results = await ticketSourcesApi.refreshAll();
      const total = results.reduce((s, r) => s + (r.count || 0), 0);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        showMessage('warning', `Refreshed ${total} tickets. ${errors.length} source(s) failed.`);
      } else {
        showMessage('success', `Refreshed all: ${total} tickets cached.`);
      }
      await loadSources();
    } catch (err) {
      showMessage('error', `Refresh all failed: ${err.message}`);
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleTestConnection = async (id) => {
    setTestingId(id);
    try {
      await ticketSourcesApi.test(id);
      showMessage('success', 'Connection successful.');
    } catch (err) {
      showMessage('error', `Connection failed: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await ticketSourcesApi.delete(deleteTarget._id);
      showMessage('success', `"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await loadSources();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  const dialogType = editingSource ? editingSource.type : activeTab;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Ticket Sources</Text>
          <div className={styles.actions}>
            <Button
              appearance="outline"
              icon={<ArrowSyncRegular />}
              onClick={handleRefreshAll}
              disabled={refreshingAll || sources.length === 0}
              size="small"
            >
              {refreshingAll ? 'Refreshing...' : 'Refresh All'}
            </Button>
            <Button
              appearance="primary"
              icon={<AddRegular />}
              onClick={openAdd}
              size="small"
            >
              Add Source
            </Button>
          </div>
        </div>

        {message && (
          <MessageBar intent={message.intent} style={{ marginBottom: 16 }}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        <TabList
          selectedValue={activeTab}
          onTabSelect={(e, data) => setActiveTab(data.value)}
          className={styles.tabs}
        >
          <Tab value="jira">Jira</Tab>
          <Tab value="azure-devops">Azure DevOps</Tab>
        </TabList>

        {tabSources.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <TicketDiagonalRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No {activeTab === 'jira' ? 'Jira' : 'Azure DevOps'} sources configured. Add one to get started.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {tabSources.map((item) => (
              <div key={item._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardColourSwatch} style={{ backgroundColor: item.colour || '#0078D4' }} />
                  <Text className={styles.cardName}>{item.name}</Text>
                  <Badge appearance="filled" color={item.enabled ? 'success' : 'warning'} size="small">
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <div className={styles.cardHeaderActions}>
                    <Tooltip content="Test Connection" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<PlugConnectedRegular />}
                        size="small"
                        disabled={testingId === item._id}
                        onClick={() => handleTestConnection(item._id)}
                      />
                    </Tooltip>
                    <Tooltip content="Refresh" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<ArrowSyncRegular />}
                        size="small"
                        disabled={refreshingId === item._id}
                        onClick={() => handleRefresh(item._id)}
                      />
                    </Tooltip>
                    <Tooltip content="Edit" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<EditRegular />}
                        size="small"
                        onClick={() => openEdit(item)}
                      />
                    </Tooltip>
                    <Tooltip content="Delete" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<DeleteRegular />}
                        size="small"
                        onClick={() => setDeleteTarget(item)}
                      />
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <Text className={styles.metaLabel}>Last Fetched</Text>
                    <Text className={styles.metaValue}>
                      {item.lastFetchedAt ? new Date(item.lastFetchedAt).toLocaleString('en-GB') : 'Never'}
                    </Text>
                  </div>
                  {item.refreshIntervalMinutes && (
                    <div className={styles.metaItem}>
                      <Text className={styles.metaLabel}>Auto-refresh</Text>
                      <Text className={styles.metaValue}>{item.refreshIntervalMinutes}m</Text>
                    </div>
                  )}
                </div>
                {(item.lastError || item.baseUrl) && (
                  <div className={styles.cardFooter}>
                    {item.lastError && (
                      <Text className={styles.error}>{item.lastError}</Text>
                    )}
                    <Tooltip content={item.baseUrl} relationship="description" positioning="above">
                      <span className={styles.urlText}>{truncateUrl(item.baseUrl)}</span>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(e, data) => { if (!data.open) setDialogOpen(false); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {editingSource ? 'Edit' : 'Add'} {dialogType === 'jira' ? 'Jira' : 'Azure DevOps'} Source
            </DialogTitle>
            <DialogContent>
              <div className={styles.formGrid}>
                <div className={styles.fullWidth}>
                  <Field label="Name" required>
                    <Input
                      value={formData.name}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, name: d.value }))}
                      placeholder={dialogType === 'jira' ? 'e.g. Jira Cloud - My Org' : 'e.g. Azure DevOps - My Org'}
                    />
                  </Field>
                </div>
                <div className={styles.fullWidth}>
                  <Field label="Base URL" required>
                    <Input
                      value={formData.baseUrl}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, baseUrl: d.value }))}
                      placeholder={dialogType === 'jira' ? 'https://your-org.atlassian.net' : 'https://dev.azure.com/your-org'}
                      type="url"
                    />
                  </Field>
                  <div className={styles.hint}>
                    {dialogType === 'jira'
                      ? 'Your Jira Cloud instance URL.'
                      : 'Your Azure DevOps organisation URL. Optionally include a project (e.g. https://dev.azure.com/org/project).'}
                  </div>
                </div>

                {/* Type-specific credential fields */}
                {dialogType === 'jira' ? (
                  <>
                    <div>
                      <Field label="Email" required>
                        <Input
                          value={formData.email}
                          onChange={(e, d) => setFormData((prev) => ({ ...prev, email: d.value }))}
                          placeholder="user@example.com"
                          type="email"
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="API Token" required>
                        <Input
                          value={formData.apiToken}
                          onChange={(e, d) => setFormData((prev) => ({ ...prev, apiToken: d.value }))}
                          placeholder="Jira API token"
                          type="password"
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Field label="Personal Access Token" required>
                        <Input
                          value={formData.pat}
                          onChange={(e, d) => setFormData((prev) => ({ ...prev, pat: d.value }))}
                          placeholder="Azure DevOps PAT"
                          type="password"
                        />
                      </Field>
                    </div>
                    <div>
                      <Field label="API Version">
                        <Input
                          value={formData.apiVersion}
                          onChange={(e, d) => setFormData((prev) => ({ ...prev, apiVersion: d.value }))}
                          placeholder="7.1"
                        />
                      </Field>
                      <div className={styles.hint}>
                        Use 2.0 for on-prem TFS, 7.1 for Azure DevOps cloud.
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.fullWidth}>
                  <Field label={dialogType === 'jira' ? 'JQL Pre-query' : 'WIQL Pre-query'}>
                    <Textarea
                      value={formData.preQuery}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, preQuery: d.value }))}
                      placeholder={dialogType === 'jira'
                        ? 'e.g. project = PAY AND assignee = currentUser() ORDER BY updated DESC'
                        : 'e.g. SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = \'MyProject\' ORDER BY [System.ChangedDate] DESC'}
                      rows={3}
                    />
                  </Field>
                  <div className={styles.hint}>
                    Optional. When empty, fetches items updated in the last 30 days.
                  </div>
                </div>

                <div>
                  <Field label="Colour">
                    <div className={styles.colourField}>
                      <input
                        type="color"
                        value={formData.colour}
                        onChange={(e) => setFormData((prev) => ({ ...prev, colour: e.target.value }))}
                        style={{ width: '40px', height: '32px', border: 'none', padding: 0, cursor: 'pointer' }}
                      />
                      <Input
                        value={formData.colour}
                        onChange={(e, d) => setFormData((prev) => ({ ...prev, colour: d.value }))}
                        style={{ width: '100px' }}
                      />
                    </div>
                  </Field>
                </div>
                <div>
                  <Field label="Auto-refresh Interval (minutes)">
                    <Input
                      value={formData.refreshIntervalMinutes}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, refreshIntervalMinutes: d.value }))}
                      placeholder="Leave empty for manual"
                      type="number"
                      min={1}
                    />
                  </Field>
                </div>
                <div className={styles.fullWidth}>
                  <Checkbox
                    label="Enabled"
                    checked={formData.enabled}
                    onChange={(e, d) => setFormData((prev) => ({ ...prev, enabled: d.checked }))}
                  />
                </div>
              </div>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary">Cancel</Button>
              </DialogTrigger>
              <Button appearance="primary" onClick={handleSaveSource} disabled={saving}>
                {saving ? 'Saving...' : (editingSource ? 'Update' : 'Add')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Ticket Source"
        message={`Delete "${deleteTarget?.name}"? This will also remove all cached tickets for this source.`}
      />
    </div>
  );
}
