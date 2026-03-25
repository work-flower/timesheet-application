import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Text,
  Spinner,
  MessageBar,
  MessageBarBody,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbDivider,
  BreadcrumbButton,
  Badge,
  Link,
  Card,
  Button,
  Tooltip,
  TabList,
  Tab,
} from '@fluentui/react-components';
import { OpenRegular, CopyRegular, CommentRegular } from '@fluentui/react-icons';
import { ticketsApi } from '../../api/index.js';
import FormCommandBar from '../../components/FormCommandBar.jsx';
import MarkdownEditor from '../../components/MarkdownEditor.jsx';
import { useFormTracker } from '../../hooks/useFormTracker.js';
import { useUnsavedChanges } from '../../contexts/UnsavedChangesContext.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';

const useStyles = makeStyles({
  page: {},
  pageBody: { padding: '16px 24px' },
  header: { marginBottom: '16px' },
  title: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase500,
    display: 'block',
    marginBottom: '4px',
  },
  message: { marginBottom: '16px' },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '360px 1fr',
    gap: '24px',
    alignItems: 'start',
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    padding: '12px',
    borderLeft: '4px solid transparent',
  },
  cardTitle: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    display: 'block',
    marginBottom: '4px',
    lineHeight: '1.3',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0',
    lineHeight: '1',
  },
  label: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    flexShrink: 0,
  },
  value: {
    fontSize: tokens.fontSizeBase200,
    textAlign: 'right',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginLeft: '12px',
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    margin: '2px 0',
  },
  description: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    whiteSpace: 'pre-wrap',
    maxHeight: '120px',
    overflow: 'auto',
    lineHeight: '1.4',
  },
  actions: {
    marginTop: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tabs: { marginBottom: '16px' },
  commentList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  commentCard: {
    padding: '12px 16px',
    borderLeft: '3px solid ' + tokens.colorBrandStroke1,
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  commentAuthor: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase200,
  },
  commentDate: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  commentBody: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    '& p': { margin: '0 0 4px 0' },
  },
  htmlBody: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    '& p': { margin: '0 0 4px 0' },
    '& img': { maxWidth: '100%' },
  },
  emptyComments: {
    textAlign: 'center',
    padding: '48px 24px',
    color: tokens.colorNeutralForeground3,
  },
});

function stateBadgeColour(state) {
  const s = (state || '').toLowerCase();
  if (s.includes('done') || s.includes('closed') || s.includes('resolved') || s.includes('completed'))
    return { bg: '#E6F4EA', color: '#1B7D3A' };
  if (s.includes('active') || s.includes('in progress') || s.includes('doing') || s.includes('review'))
    return { bg: '#E0F0FF', color: '#0059B2' };
  if (s.includes('new') || s.includes('to do') || s.includes('open') || s.includes('backlog'))
    return { bg: '#FFF4E0', color: '#B25E00' };
  if (s.includes('blocked') || s.includes('impediment'))
    return { bg: '#FDE7E7', color: '#C41E3A' };
  return { bg: '#F0EEFE', color: '#5B3EC4' };
}

function hexToPastel(hex) {
  if (!hex || hex.length < 7) return { bg: '#F8F8F8' };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { bg: `rgb(${Math.round(r + (255 - r) * 0.85)}, ${Math.round(g + (255 - g) * 0.85)}, ${Math.round(b + (255 - b) * 0.85)})` };
}

export default function TicketForm() {
  const styles = useStyles();
  const { id } = useParams();
  const { registerGuard } = useUnsavedChanges();
  const { navigate, goBack } = useAppNavigate();

  const { form, setForm, resetBase, formRef, isDirty, changedFields, base, baseReady } = useFormTracker();
  const notifyParent = useNotifyParent();
  const [initialized, setInitialized] = useState(false);

  const [loadedData, setLoadedData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const cardRef = useRef(null);
  const [editorHeight, setEditorHeight] = useState(400);

  useEffect(() => {
    const init = async () => {
      try {
        if (!id) {
          setError('Ticket ID is required');
          setInitialized(true);
          return;
        }
        const data = await ticketsApi.getById(id);
        setLoadedData(data);
        resetBase({
          ...data,
          comments: data.extension?.comments || '',
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [id, resetBase]);

  const saveForm = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await ticketsApi.patch(id, {
        extension: { comments: form.comments || '' },
      });
      setLoadedData(result);
      resetBase({
        ...result,
        comments: result.extension?.comments || '',
      });
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, [form.comments, id, resetBase]);

  const handleSave = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('save', base, form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleSaveAndClose = async () => {
    const result = await saveForm();
    if (result.ok) {
      notifyParent('saveAndClose', base, form);
      navigate('/tickets');
    }
  };

  const handleBack = () => {
    notifyParent('back', base, form);
    goBack('/tickets');
  };

  useEffect(() => {
    return registerGuard({ isDirty, onSave: saveForm });
  }, [isDirty, saveForm, registerGuard]);

  useEffect(() => {
    if (initialized && cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h > 100) setEditorHeight(h);
    }
  }, [initialized, loadedData]);

  const handleChange = (field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const d = loadedData || {};
  const colour = d.sourceColour || '#0078D4';
  const pastel = hexToPastel(colour);
  const badge = stateBadgeColour(d.state);

  return (
    <>
      {!initialized && <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>}
      <div className={styles.page} ref={formRef} style={{ display: initialized ? undefined : 'none' }}>
        <FormCommandBar
          onBack={handleBack}
          onSave={handleSave}
          onSaveAndClose={handleSaveAndClose}
          saving={saving}
        />
        <div className={styles.pageBody}>
          <div className={styles.header}>
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbButton onClick={handleBack}>Tickets</BreadcrumbButton>
              </BreadcrumbItem>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton current>
                  {d.externalId || 'Ticket'}
                </BreadcrumbButton>
              </BreadcrumbItem>
            </Breadcrumb>
          </div>

          {error && (
            <MessageBar intent="error" className={styles.message}>
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          {success && (
            <MessageBar intent="success" className={styles.message}>
              <MessageBarBody>Ticket saved successfully.</MessageBarBody>
            </MessageBar>
          )}

          <TabList
            className={styles.tabs}
            selectedValue={activeTab}
            onTabSelect={(_, data) => setActiveTab(data.value)}
          >
            <Tab value="details">Details</Tab>
            <Tab value="comments" icon={<CommentRegular />}>
              Ticket Comments{(d.comments?.length > 0) ? ` (${d.comments.length})` : ''}
            </Tab>
          </TabList>

          {activeTab === 'details' && (
            <div className={styles.twoCol}>
              {/* Left — ticket summary card */}
              <Card
                ref={cardRef}
                className={styles.card}
                style={{ backgroundColor: pastel.bg, borderLeftColor: colour }}
              >
                <Text className={styles.cardTitle}>{d.title || 'Ticket Details'}</Text>

                {d.url && (
                  <div className={styles.actions}>
                    <Link href={d.url} target="_blank" inline style={{ fontSize: tokens.fontSizeBase200 }}>
                      <OpenRegular style={{ marginRight: '3px', fontSize: '13px' }} />
                      Open in {d.sourceType === 'jira' ? 'Jira' : 'Azure DevOps'}
                    </Link>
                    <Tooltip content="Copy link" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<CopyRegular style={{ fontSize: '14px' }} />}
                        style={{ minWidth: 'auto', padding: '2px 4px' }}
                        onClick={() => navigator.clipboard.writeText(d.url).catch(() => {})}
                      />
                    </Tooltip>
                  </div>
                )}

                <div className={styles.row}>
                  <Text className={styles.label}>ID</Text>
                  <Text className={styles.value} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {d.externalId || '\u2014'}
                  </Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>State</Text>
                  <Badge appearance="filled" size="small" style={{ backgroundColor: badge.bg, color: badge.color }}>
                    {d.state || '\u2014'}
                  </Badge>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Type</Text>
                  <Text className={styles.value}>{d.type || '\u2014'}</Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Priority</Text>
                  <Text className={styles.value}>{d.priority || '\u2014'}</Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Assigned To</Text>
                  <Text className={styles.value}>{d.assignedTo || '\u2014'}</Text>
                </div>
                <div className={styles.divider} />
                <div className={styles.row}>
                  <Text className={styles.label}>Sprint</Text>
                  <Text className={styles.value}>{d.sprint || '\u2014'}</Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Project</Text>
                  <Text className={styles.value}>{d.project || '\u2014'}</Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Area Path</Text>
                  <Text className={styles.value}>{d.areaPath || '\u2014'}</Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Source</Text>
                  <Text className={styles.value}>{d.sourceName || '\u2014'}</Text>
                </div>
                <div className={styles.divider} />
                <div className={styles.row}>
                  <Text className={styles.label}>Created</Text>
                  <Text className={styles.value}>
                    {d.created ? new Date(d.created).toLocaleDateString() : '\u2014'}
                  </Text>
                </div>
                <div className={styles.row}>
                  <Text className={styles.label}>Updated</Text>
                  <Text className={styles.value}>
                    {d.updated ? new Date(d.updated).toLocaleDateString() : '\u2014'}
                  </Text>
                </div>

                {d.description && (
                  <div className={styles.description}>{d.description}</div>
                )}

              </Card>

              {/* Right — editable comments, height matched to card */}
              <div>
                <MarkdownEditor
                  name="comments"
                  value={form.comments ?? ''}
                  onChange={(val) => setForm((prev) => ({ ...prev, comments: val }))}
                  height={editorHeight}
                />
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <TicketComments comments={d.comments || []} styles={styles} />
          )}
        </div>
      </div>
    </>
  );
}

function TicketComments({ comments, styles }) {
  if (!comments.length) {
    return (
      <div className={styles.emptyComments}>
        <CommentRegular style={{ fontSize: '32px', display: 'block', margin: '0 auto 8px' }} />
        <Text>No comments on this ticket.</Text>
      </div>
    );
  }

  return (
    <div className={styles.commentList}>
      {comments.map((c) => (
        <Card key={c.id} className={styles.commentCard}>
          <div className={styles.commentHeader}>
            <Text className={styles.commentAuthor}>{c.author || 'Unknown'}</Text>
            <Text className={styles.commentDate}>
              {c.created ? new Date(c.created).toLocaleString() : ''}
            </Text>
          </div>
          <CommentBody body={c.body} format={c.format} styles={styles} />
        </Card>
      ))}
    </div>
  );
}

function CommentBody({ body, format, styles }) {
  if (!body) return null;

  if (format === 'html') {
    return <div className={styles.htmlBody} dangerouslySetInnerHTML={{ __html: body }} />;
  }

  if (format === 'markdown') {
    return (
      <div className={styles.commentBody}>
        <MarkdownEditor value={body} preview />
      </div>
    );
  }

  // Plain text
  return (
    <Text className={styles.commentBody} style={{ whiteSpace: 'pre-wrap' }}>{body}</Text>
  );
}
