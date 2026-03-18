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
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowSyncRegular,
  DeleteRegular,
  EditRegular,
  CalendarMonthRegular,
} from '@fluentui/react-icons';
import { calendarSourcesApi } from '../../api/index.js';
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
  // Card layout
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

function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname}/...${url.slice(-12)}`;
  } catch {
    return url.length > 40 ? `${url.slice(0, 20)}...${url.slice(-12)}` : url;
  }
}

export default function CalendarSourcesPage() {
  const styles = useStyles();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [formData, setFormData] = useState({ name: '', icsUrl: '', colour: '#0078D4', enabled: true, refreshIntervalMinutes: '' });
  const [saving, setSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadSources = useCallback(async () => {
    try {
      const data = await calendarSourcesApi.getAll();
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

  const openAdd = () => {
    setEditingSource(null);
    setFormData({ name: '', icsUrl: '', colour: '#0078D4', enabled: true, refreshIntervalMinutes: '' });
    setDialogOpen(true);
  };

  const openEdit = (source) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      icsUrl: source.icsUrl,
      colour: source.colour || '#0078D4',
      enabled: source.enabled !== false,
      refreshIntervalMinutes: source.refreshIntervalMinutes || '',
    });
    setDialogOpen(true);
  };

  const handleSaveSource = async () => {
    if (!formData.name || !formData.icsUrl) {
      showMessage('error', 'Name and ICS URL are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        refreshIntervalMinutes: formData.refreshIntervalMinutes ? Number(formData.refreshIntervalMinutes) : null,
      };
      if (editingSource) {
        await calendarSourcesApi.update(editingSource._id, payload);
        showMessage('success', 'Calendar source updated.');
      } else {
        await calendarSourcesApi.create(payload);
        showMessage('success', 'Calendar source added.');
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
      const result = await calendarSourcesApi.refresh(id);
      showMessage('success', `Refreshed: ${result.count} events cached.`);
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
      const results = await calendarSourcesApi.refreshAll();
      const total = results.reduce((s, r) => s + (r.count || 0), 0);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        showMessage('warning', `Refreshed ${total} events. ${errors.length} source(s) failed.`);
      } else {
        showMessage('success', `Refreshed all: ${total} events cached.`);
      }
      await loadSources();
    } catch (err) {
      showMessage('error', `Refresh all failed: ${err.message}`);
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await calendarSourcesApi.delete(deleteTarget._id);
      showMessage('success', `"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await loadSources();
    } catch (err) {
      showMessage('error', `Delete failed: ${err.message}`);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <div className={styles.header}>
          <Text className={styles.title}>Calendar Sources</Text>
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

        {sources.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: tokens.colorNeutralForeground3 }}>
            <CalendarMonthRegular style={{ fontSize: '48px', display: 'block', margin: '0 auto 12px' }} />
            <Text>No calendar sources configured. Add an ICS feed to get started.</Text>
          </div>
        ) : (
          <div className={styles.cardList}>
            {sources.map((item) => (
              <div key={item._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardColourSwatch} style={{ backgroundColor: item.colour || '#0078D4' }} />
                  <Text className={styles.cardName}>{item.name}</Text>
                  <Badge appearance="filled" color={item.enabled ? 'success' : 'warning'} size="small">
                    {item.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <div className={styles.cardHeaderActions}>
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
                {(item.lastError || item.icsUrl) && (
                  <div className={styles.cardFooter}>
                    {item.lastError && (
                      <Text className={styles.error}>{item.lastError}</Text>
                    )}
                    <Tooltip content={item.icsUrl} relationship="description" positioning="above">
                      <span className={styles.urlText}>{truncateUrl(item.icsUrl)}</span>
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
            <DialogTitle>{editingSource ? 'Edit Calendar Source' : 'Add Calendar Source'}</DialogTitle>
            <DialogContent>
              <div className={styles.formGrid}>
                <div className={styles.fullWidth}>
                  <Field label="Name" required>
                    <Input
                      value={formData.name}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, name: d.value }))}
                      placeholder="e.g. Work Calendar"
                    />
                  </Field>
                </div>
                <div className={styles.fullWidth}>
                  <Field label="ICS URL" required>
                    <Input
                      value={formData.icsUrl}
                      onChange={(e, d) => setFormData((prev) => ({ ...prev, icsUrl: d.value }))}
                      placeholder="https://outlook.office365.com/owa/calendar/..."
                      type="url"
                    />
                  </Field>
                  <div className={styles.hint}>
                    The published ICS subscription URL from your calendar provider.
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
        title="Delete Calendar Source"
        message={`Delete "${deleteTarget?.name}"? This will also remove all cached events for this source.`}
      />
    </div>
  );
}
