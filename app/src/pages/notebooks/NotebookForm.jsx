import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import {
  makeStyles, tokens, Text, Spinner, MessageBar, MessageBarBody,
  Badge, Button, Tooltip, Textarea, Input, Field,
  Accordion, AccordionItem, AccordionHeader, AccordionPanel,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular, DeleteRegular, ArchiveRegular,
  ArrowUndoRegular, ArrowRedoRegular, PrintRegular,
  ArrowResetRegular, SendRegular, HistoryRegular,
  InfoRegular, LockClosedRegular, LockOpenRegular, KeyRegular,
} from '@fluentui/react-icons';
import { notebooksApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import { useNotifyParent } from '../../hooks/useNotifyParent.js';
import NotebookEditor from '../../components/editors/NotebookEditor.jsx';
import EntitySearchDialog from '../../components/editors/EntitySearchDialog.jsx';
import DiffViewer from '../../components/DiffViewer.jsx';
import NotebookArtifactsPanel from './NotebookArtifactsPanel.jsx';
import TextToSpeechButton from '../../components/TextToSpeechButton.jsx';
import { encrypt, decrypt, WrongPasswordError } from '../../utils/notebookCrypto.js';
import {
  parseContentMeta,
  extractEntityReferences,
  extractFirstImageRef,
} from '../../../../shared/notebookContentParse.js';

const AUTO_SAVE_DELAY = 1500; // ms after last change

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
  },
  toolbarDivider: {
    width: '1px',
    height: '20px',
    backgroundColor: tokens.colorNeutralStroke3,
    marginLeft: '4px',
    marginRight: '4px',
  },
  statusText: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginLeft: '8px',
    whiteSpace: 'nowrap',
  },
  body: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
  },
  editorPane: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  contentArea: {
    maxWidth: '1100px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 48px 80px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  message: { marginBottom: '16px' },
  hint: { marginBottom: '12px' },
  editorWrap: {
    flex: 1,
    width: '100%',
  },
});

const ragScoreColors = {
  low: 'danger',
  'low-moderate': 'warning',
  moderate: 'warning',
  'moderate-high': 'success',
  high: 'success',
};

export default function NotebookForm() {
  const styles = useStyles();
  const { id } = useParams();
  const location = useLocation();
  const { navigate, goBack } = useAppNavigate();
  const notifyParent = useNotifyParent();

  // Trailing slash ensures relative image refs resolve to /notebooks/:id/filename
  if (!location.pathname.endsWith('/')) {
    return <Navigate to={`${location.pathname}/`} replace />;
  }

  const [initialized, setInitialized] = useState(false);
  const [hintOpen, setHintOpen] = useState(() => localStorage.getItem('notebook-hint-collapsed') !== 'true');
  const [loadedData, setLoadedData] = useState(null);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Save status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle');

  // TTS audio
  const [audioUrl, setAudioUrl] = useState(null);

  // Content
  const [initialContent, setInitialContent] = useState('');
  const contentRef = useRef('');

  // Auto-save timer
  const saveTimerRef = useRef(null);
  const editorRef = useRef(null);

  // Snapshot of last saved content
  const lastSavedRef = useRef('');

  // --- Encryption state ---
  // sessionPassword: held in state so re-renders unlock the editor view.
  // Lost on unmount / page refresh — user has to re-enter it next visit.
  const [sessionPassword, setSessionPassword] = useState(null);
  const [encryptedBytes, setEncryptedBytes] = useState(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(null);
  const [unlocking, setUnlocking] = useState(false);

  // Encrypt-action dialog
  const [encryptOpen, setEncryptOpen] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptConfirm, setEncryptConfirm] = useState('');
  const [encryptError, setEncryptError] = useState(null);
  const [encrypting, setEncrypting] = useState(false);

  // Decrypt-action confirm
  const [decryptOpen, setDecryptOpen] = useState(false);

  // Change-password dialog
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [changePwError, setChangePwError] = useState(null);
  const [changingPw, setChangingPw] = useState(false);

  const isEncrypted = !!loadedData?.isEncrypted;
  const isLocked = isEncrypted && !sessionPassword;

  // Derive metadata from plaintext + encrypt + send. Used by autosave (encrypted
  // path), the Encrypt action, and the Change-password action.
  const sendEncryptedSave = useCallback(async (password, content) => {
    const meta = parseContentMeta(content);
    const refs = extractEntityReferences(content);
    const firstImage = extractFirstImageRef(content);
    const ciphertext = await encrypt(content, password);
    await notebooksApi.updateEncryptedContent(id, {
      ciphertext,
      title: meta.title,
      summary: meta.summary,
      tags: meta.tags,
      relatedProjects: refs.relatedProjects,
      relatedClients: refs.relatedClients,
      relatedTimesheets: refs.relatedTimesheets,
      relatedTickets: refs.relatedTickets,
      thumbnailSourceFilename: firstImage,
    });
  }, [id]);

  // Load data
  useEffect(() => {
    if (!id) return;
    const init = async () => {
      try {
        const data = await notebooksApi.getById(id);
        setLoadedData(data);

        const contentResult = await notebooksApi.getContent(id);
        if (contentResult.encrypted) {
          setEncryptedBytes(contentResult.bytes);
          // Editor stays empty until user unlocks
        } else {
          setInitialContent(contentResult.content || '');
          contentRef.current = contentResult.content || '';
          lastSavedRef.current = contentResult.content || '';
        }
        setAudioUrl(notebooksApi.getAudioUrl(id));
      } catch (err) {
        setError(err.message);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [id]);

  const handleUnlock = async () => {
    if (!unlockPassword || !encryptedBytes) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const plaintext = await decrypt(encryptedBytes, unlockPassword);
      setSessionPassword(unlockPassword);
      setInitialContent(plaintext);
      contentRef.current = plaintext;
      lastSavedRef.current = plaintext;
      setUnlockPassword('');
    } catch (err) {
      setUnlockError(err instanceof WrongPasswordError ? 'Wrong password' : err.message);
    } finally {
      setUnlocking(false);
    }
  };

  // Auto-save function
  const doSave = useCallback(async () => {
    const currentContent = contentRef.current;

    if (currentContent === lastSavedRef.current) return;

    // Encrypted notebook with no session password — should not happen because the
    // editor isn't rendered while locked, but guard anyway.
    if (isEncrypted && !sessionPassword) return;

    setSaveStatus('saving');
    try {
      if (isEncrypted) {
        await sendEncryptedSave(sessionPassword, currentContent);
      } else {
        // Server derives title, summary, tags from content
        await notebooksApi.updateContent(id, currentContent);
      }
      lastSavedRef.current = currentContent;

      // Refresh loaded data for status badges etc.
      const data = await notebooksApi.getById(id);
      setLoadedData(data);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [id, isEncrypted, sessionPassword, sendEncryptedSave]);

  // Schedule auto-save on any change
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, AUTO_SAVE_DELAY);
  }, [doSave]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        doSave();
      }
    };
  }, [doSave]);

  const handleContentChange = useCallback((md) => {
    contentRef.current = md;
    scheduleSave();
  }, [scheduleSave]);

  // Image upload
  const handleImageUpload = useCallback(async (file) => {
    if (!id) throw new Error('Notebook must be saved first');
    const result = await notebooksApi.uploadMedia(id, file);
    return result.filename;
  }, [id]);

  // Delete
  const handleDelete = async () => {
    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await notebooksApi.delete(id);
      notifyParent('delete', {}, {});
      navigate('/notebooks');
    } catch (err) {
      setError(err.message);
    }
  };

  // Entity search dialog
  const [entitySearchOpen, setEntitySearchOpen] = useState(false);
  const [entitySearchType, setEntitySearchType] = useState('project');

  const handleEntitySearch = useCallback((entityType) => {
    setEntitySearchType(entityType);
    setEntitySearchOpen(true);
  }, []);

  const handleEntitySelect = useCallback((record) => {
    setEntitySearchOpen(false);
    const urlMap = { project: 'projects', client: 'clients', timesheet: 'timesheets', ticket: 'tickets' };
    const href = `/${urlMap[entitySearchType]}/${record._id}`;
    let displayName;
    if (entitySearchType === 'project') displayName = record.name;
    else if (entitySearchType === 'client') displayName = record.companyName;
    else if (entitySearchType === 'ticket') displayName = record.externalId ? `${record.externalId} — ${record.title}` : record.title;
    else displayName = record.projectName ? `${record.date} — ${record.projectName}` : record.date;
    editorRef.current?.insertEntityLink(href, displayName);
  }, [entitySearchType]);

  // PDF preview dialog
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const handlePrint = useCallback(async () => {
    // Flush pending save first so server has latest content
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await doSave();
    }

    setPdfLoading(true);
    setPdfError(null);
    setPdfDialogOpen(true);

    try {
      const blob = await notebooksApi.getPdf(id);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setPdfLoading(false);
    }
  }, [id, doSave]);

  const closePdfDialog = useCallback(() => {
    setPdfDialogOpen(false);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfError(null);
  }, [pdfUrl]);

  // Archive / Unarchive
  const handleArchive = async () => {
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        await doSave();
      }
      await notebooksApi.archive(id);
      const data = await notebooksApi.getById(id);
      setLoadedData(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnarchive = async () => {
    try {
      await notebooksApi.unarchive(id);
      const data = await notebooksApi.getById(id);
      setLoadedData(data);
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Publish dialog ---
  const [publishOpen, setPublishOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async () => {
    if (!commitMessage.trim()) return;
    setPublishing(true);
    try {
      // Flush pending save first
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        await doSave();
      }
      const data = await notebooksApi.publish(id, commitMessage.trim());
      setLoadedData(data);
      setPublishOpen(false);
      setCommitMessage('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  // --- Discard ---
  const [discardOpen, setDiscardOpen] = useState(false);

  const handleDiscard = async () => {
    try {
      // Cancel any pending save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const data = await notebooksApi.discard(id);
      setLoadedData(data);
      setDiscardOpen(false);

      // Reload content — restored state may be encrypted or plain depending on
      // what was last committed. Reset session password so user re-enters it
      // (or never sees the prompt at all if reverted state is plain).
      const contentResult = await notebooksApi.getContent(id);
      setSessionPassword(null);
      if (contentResult.encrypted) {
        setEncryptedBytes(contentResult.bytes);
        setInitialContent('');
        contentRef.current = '';
        lastSavedRef.current = '';
      } else {
        setEncryptedBytes(null);
        setInitialContent(contentResult.content || '');
        contentRef.current = contentResult.content || '';
        lastSavedRef.current = contentResult.content || '';
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Encrypt / Decrypt / Change password actions ---

  const handleEncrypt = async () => {
    setEncryptError(null);
    if (!encryptPassword) {
      setEncryptError('Password is required');
      return;
    }
    if (encryptPassword !== encryptConfirm) {
      setEncryptError('Passwords do not match');
      return;
    }
    setEncrypting(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const currentContent = contentRef.current;
      await sendEncryptedSave(encryptPassword, currentContent);
      lastSavedRef.current = currentContent;
      setSessionPassword(encryptPassword);
      const data = await notebooksApi.getById(id);
      setLoadedData(data);
      setEncryptOpen(false);
      setEncryptPassword('');
      setEncryptConfirm('');
    } catch (err) {
      setEncryptError(err.message);
    } finally {
      setEncrypting(false);
    }
  };

  const handleDecrypt = async () => {
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const currentContent = contentRef.current;
      await notebooksApi.updateContent(id, currentContent);
      lastSavedRef.current = currentContent;
      setSessionPassword(null);
      setEncryptedBytes(null);
      const data = await notebooksApi.getById(id);
      setLoadedData(data);
      setDecryptOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangePassword = async () => {
    setChangePwError(null);
    if (!newPassword) {
      setChangePwError('New password is required');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setChangePwError('Passwords do not match');
      return;
    }
    setChangingPw(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const currentContent = contentRef.current;
      await sendEncryptedSave(newPassword, currentContent);
      lastSavedRef.current = currentContent;
      setSessionPassword(newPassword);
      setChangePwOpen(false);
      setNewPassword('');
      setNewPasswordConfirm('');
    } catch (err) {
      setChangePwError(err.message);
    } finally {
      setChangingPw(false);
    }
  };

  // --- History dialog ---
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [diffContent, setDiffContent] = useState('');
  const [diffLoading, setDiffLoading] = useState(false);
  const [compareFrom, setCompareFrom] = useState(null);

  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setSelectedCommit(null);
    setDiffContent('');
    setCompareFrom(null);
    try {
      const list = await notebooksApi.getHistory(id);
      setHistoryList(list || []);
    } catch {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  const viewCommitDiff = useCallback(async (hash) => {
    if (compareFrom) {
      // Compare mode: show diff between compareFrom and hash
      setDiffLoading(true);
      setSelectedCommit(hash);
      try {
        const diff = await notebooksApi.getCompareDiff(id, compareFrom, hash);
        setDiffContent(diff);
      } catch {
        setDiffContent('Failed to load diff');
      } finally {
        setDiffLoading(false);
        setCompareFrom(null);
      }
    } else {
      // Single commit diff
      setDiffLoading(true);
      setSelectedCommit(hash);
      try {
        const diff = await notebooksApi.getCommitDiff(id, hash);
        setDiffContent(diff);
      } catch {
        setDiffContent('Failed to load diff');
      } finally {
        setDiffLoading(false);
      }
    }
  }, [id, compareFrom]);

  // Refresh notebook metadata (isDraft badge etc.)
  const refreshMetadata = useCallback(async () => {
    if (!id) return;
    try {
      const data = await notebooksApi.getById(id);
      setLoadedData(data);
    } catch { /* ignore */ }
  }, [id]);

  // --- Artifacts panel ---
  const [artifactsPanelOpen, setArtifactsPanelOpen] = useState(true);

  const handleInsertImage = useCallback((src, alt) => {
    editorRef.current?.insertImage(src, alt);
  }, []);

  const handleInsertLink = useCallback((href, displayName) => {
    editorRef.current?.insertEntityLink(href, displayName);
  }, []);

  const handleInsertCodeBlock = useCallback((code, language, filename) => {
    editorRef.current?.insertCodeBlock(code, language, filename);
  }, []);

  const isArchived = loadedData?.status === 'archived';
  const isDraft = loadedData?.isDraft;
  const canDiscard = loadedData?.canDiscard;

  // Status indicator text
  const statusLabel = saveStatus === 'saving' ? 'Saving...'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Save failed'
    : '';

  if (!initialized) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spinner label="Loading..." /></div>;
  }

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Tooltip content="Back" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowLeftRegular />}
              onClick={() => { notifyParent('back', {}, {}); goBack('/notebooks'); }} />
          </Tooltip>
          <div className={styles.toolbarDivider} />
          <Tooltip content="Undo (Ctrl+Z)" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowUndoRegular />}
              onClick={() => editorRef.current?.undo()} />
          </Tooltip>
          <Tooltip content="Redo (Ctrl+Y)" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowRedoRegular />}
              onClick={() => editorRef.current?.redo()} />
          </Tooltip>
          {!isEncrypted && (
            <>
              <div className={styles.toolbarDivider} />
              <Tooltip content="Export as PDF" relationship="label">
                <Button appearance="subtle" size="small" icon={<PrintRegular />}
                  onClick={handlePrint} />
              </Tooltip>
              <Tooltip content="Version history" relationship="label">
                <Button appearance="subtle" size="small" icon={<HistoryRegular />}
                  onClick={openHistory} />
              </Tooltip>
              <div className={styles.toolbarDivider} />
              <TextToSpeechButton
                text={contentRef.current}
                backgroundMusic
                audioUrl={audioUrl}
                persistKey={`notebook-${id}`}
                onAudioGenerated={(blob) => {
                  notebooksApi.saveAudio(id, blob).then(() => {
                    setAudioUrl(notebooksApi.getAudioUrl(id));
                  }).catch(() => {});
                }}
              />
            </>
          )}
          {statusLabel && (
            <Text className={styles.statusText} style={saveStatus === 'error' ? { color: tokens.colorPaletteRedForeground1 } : undefined}>
              {statusLabel}
            </Text>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {isEncrypted && (
            <Badge appearance="tint" color="important" size="small" icon={<LockClosedRegular />}>
              Encrypted
            </Badge>
          )}
          {isDraft && <Badge appearance="tint" color="warning" size="small">Draft</Badge>}
          {!isDraft && <Badge appearance="tint" color="success" size="small">Published</Badge>}
          {loadedData?.ragScore && (
            <Badge appearance="filled" color={ragScoreColors[loadedData.ragScore] || 'informative'} size="small">
              RAG: {loadedData.ragScore}
            </Badge>
          )}
          {isArchived && <Badge appearance="filled" color="subtle" size="small">Archived</Badge>}
          <div className={styles.toolbarDivider} />
          {!isEncrypted && (
            <Tooltip content="Encrypt with password" relationship="label">
              <Button appearance="subtle" size="small" icon={<LockClosedRegular />}
                onClick={() => { setEncryptError(null); setEncryptPassword(''); setEncryptConfirm(''); setEncryptOpen(true); }} />
            </Tooltip>
          )}
          {isEncrypted && !isLocked && (
            <>
              <Tooltip content="Change password" relationship="label">
                <Button appearance="subtle" size="small" icon={<KeyRegular />}
                  onClick={() => { setChangePwError(null); setNewPassword(''); setNewPasswordConfirm(''); setChangePwOpen(true); }} />
              </Tooltip>
              <Tooltip content="Decrypt notebook" relationship="label">
                <Button appearance="subtle" size="small" icon={<LockOpenRegular />}
                  onClick={() => setDecryptOpen(true)} />
              </Tooltip>
            </>
          )}
          {isDraft && (
            <Tooltip content="Publish (commit changes)" relationship="label">
              <Button appearance="subtle" size="small" icon={<SendRegular />}
                onClick={() => setPublishOpen(true)}>
                <Text size={200}>Publish</Text>
              </Button>
            </Tooltip>
          )}
          {canDiscard && (
            <Tooltip content="Discard changes (revert to last published)" relationship="label">
              <Button appearance="subtle" size="small" icon={<ArrowResetRegular />}
                onClick={() => setDiscardOpen(true)}>
                <Text size={200}>Discard</Text>
              </Button>
            </Tooltip>
          )}
          {!isArchived && (
            <Tooltip content="Archive" relationship="label">
              <Button appearance="subtle" size="small" icon={<ArchiveRegular />}
                onClick={handleArchive} />
            </Tooltip>
          )}
          {isArchived && (
            <Tooltip content="Unarchive" relationship="label">
              <Button appearance="subtle" size="small" icon={<ArrowUndoRegular />}
                onClick={handleUnarchive} />
            </Tooltip>
          )}
          <Tooltip content="Delete" relationship="label">
            <Button appearance="subtle" size="small" icon={<DeleteRegular />}
              onClick={() => setDeleteOpen(true)} />
          </Tooltip>
        </div>
      </div>

      {/* Content + Artifacts */}
      <div className={styles.body}>
        <div className={styles.editorPane}>
          <div className={styles.contentArea}>
            {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}

            <Accordion
              className={styles.hint}
              collapsible
              openItems={hintOpen ? ['hint'] : []}
              onToggle={(e, data) => {
                const isOpen = data.openItems.includes('hint');
                setHintOpen(isOpen);
                localStorage.setItem('notebook-hint-collapsed', isOpen ? '' : 'true');
              }}
            >
              <AccordionItem value="hint">
                <AccordionHeader icon={<InfoRegular />} size="small">
                  Content structure guide
                </AccordionHeader>
                <AccordionPanel>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Title, summary, and tags are derived from content. Use a heading for the title, then a summary paragraph, then hashtags like #azure #migration.
                  </Text>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            <div className={styles.editorWrap}>
              {isLocked ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: '300px', gap: '16px', padding: '48px 24px',
                  border: `1px solid ${tokens.colorNeutralStroke3}`, borderRadius: '8px',
                  backgroundColor: tokens.colorNeutralBackground2,
                }}>
                  <LockClosedRegular style={{ fontSize: 48, color: tokens.colorNeutralForeground3 }} />
                  <Text weight="semibold" size={400}>This notebook is encrypted</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: 'center', maxWidth: '400px' }}>
                    Enter the password to unlock the content. The password is not stored — you'll need to re-enter it next time.
                  </Text>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', width: '100%', maxWidth: '400px', marginTop: '8px' }}>
                    <Field style={{ flex: 1 }}>
                      <Input
                        type="password"
                        value={unlockPassword}
                        onChange={(e, data) => setUnlockPassword(data.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                        autoFocus
                        placeholder="Password"
                      />
                    </Field>
                    <Button appearance="primary" onClick={handleUnlock}
                      disabled={!unlockPassword || unlocking}>
                      {unlocking ? 'Unlocking...' : 'Unlock'}
                    </Button>
                  </div>
                  {unlockError && (
                    <MessageBar intent="error" style={{ width: '100%', maxWidth: '400px' }}>
                      <MessageBarBody>{unlockError}</MessageBarBody>
                    </MessageBar>
                  )}
                </div>
              ) : (
                <NotebookEditor
                  ref={editorRef}
                  defaultValue={initialContent}
                  onChange={handleContentChange}
                  readOnly={false}
                  onImageUpload={handleImageUpload}
                  onEntitySearch={handleEntitySearch}
                />
              )}
            </div>
          </div>
        </div>

        <NotebookArtifactsPanel
          notebookId={id}
          open={artifactsPanelOpen}
          onToggle={() => setArtifactsPanelOpen((v) => !v)}
          onInsertImage={handleInsertImage}
          onInsertLink={handleInsertLink}
          onInsertCodeBlock={handleInsertCodeBlock}
          onChanged={refreshMetadata}
        />
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Notebook"
        message="This notebook will be moved to the recycle bin. You can restore it later."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Discard Changes"
        message="This will discard all changes since the last publish and restore the notebook to its previously published state. This cannot be undone."
        onConfirm={handleDiscard}
        onCancel={() => setDiscardOpen(false)}
      />

      <EntitySearchDialog
        open={entitySearchOpen}
        entityType={entitySearchType}
        onSelect={handleEntitySelect}
        onClose={() => setEntitySearchOpen(false)}
      />

      {/* Publish Dialog */}
      <Dialog open={publishOpen} onOpenChange={(e, data) => { if (!data.open) { setPublishOpen(false); setCommitMessage(''); } }}>
        <DialogSurface style={{ maxWidth: '500px' }}>
          <DialogBody>
            <DialogTitle>Publish Notebook</DialogTitle>
            <DialogContent>
              <Text block style={{ marginBottom: 12 }}>
                Describe the changes you made. This message will be saved as the commit message.
              </Text>
              <Textarea
                placeholder="What changed?"
                value={commitMessage}
                onChange={(e, data) => setCommitMessage(data.value)}
                resize="vertical"
                style={{ width: '100%', minHeight: '80px' }}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setPublishOpen(false); setCommitMessage(''); }}>Cancel</Button>
              <Button appearance="primary" icon={<SendRegular />}
                disabled={!commitMessage.trim() || publishing}
                onClick={handlePublish}>
                {publishing ? 'Publishing...' : 'Publish'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={(e, data) => { if (!data.open) closePdfDialog(); }}>
        <DialogSurface style={{ maxWidth: '900px', width: '90vw', maxHeight: '90vh' }}>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
            <DialogTitle>PDF Preview</DialogTitle>
            <DialogContent style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {pdfError && (
                <MessageBar intent="error" style={{ marginBottom: 12, flexShrink: 0 }}>
                  <MessageBarBody>{pdfError}</MessageBarBody>
                </MessageBar>
              )}
              {pdfLoading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner label="Generating PDF..." />
                </div>
              )}
              {pdfUrl && !pdfLoading && (
                <iframe
                  src={pdfUrl}
                  title="Notebook PDF"
                  style={{ flex: 1, width: '100%', border: 'none', borderRadius: 4 }}
                />
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={closePdfDialog}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={(e, data) => { if (!data.open) setHistoryOpen(false); }}>
        <DialogSurface style={{ maxWidth: '900px', width: '90vw', maxHeight: '90vh' }}>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
            <DialogTitle>Version History</DialogTitle>
            <DialogContent style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 16 }}>
              {/* Commit list */}
              <div style={{ width: 300, flexShrink: 0, overflow: 'auto', borderRight: `1px solid ${tokens.colorNeutralStroke3}`, paddingRight: 12 }}>
                {historyLoading ? (
                  <Spinner label="Loading history..." />
                ) : historyList.length === 0 ? (
                  <Text style={{ color: tokens.colorNeutralForeground3 }}>No commits yet — publish to create the first version.</Text>
                ) : (
                  <>
                    {compareFrom && (
                      <MessageBar intent="info" style={{ marginBottom: 8 }}>
                        <MessageBarBody>
                          Select a second commit to compare.
                          <Button appearance="transparent" size="small" onClick={() => setCompareFrom(null)}>Cancel</Button>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {historyList.map((commit) => (
                      <div
                        key={commit.hash}
                        onClick={() => viewCommitDiff(commit.hash)}
                        style={{
                          padding: '8px',
                          cursor: 'pointer',
                          borderRadius: 4,
                          marginBottom: 4,
                          backgroundColor: selectedCommit === commit.hash ? tokens.colorBrandBackground2 : undefined,
                          borderLeft: compareFrom === commit.hash ? `3px solid ${tokens.colorBrandForeground1}` : '3px solid transparent',
                        }}
                      >
                        <Text block size={200} weight="semibold">{commit.message}</Text>
                        <Text block size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                          {new Date(commit.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Button
                          appearance="transparent"
                          size="small"
                          style={{ marginTop: 2, padding: 0 }}
                          onClick={(e) => { e.stopPropagation(); setCompareFrom(commit.hash); }}
                        >
                          Compare from here
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
              {/* Diff viewer */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {diffLoading ? (
                  <Spinner label="Loading diff..." />
                ) : selectedCommit ? (
                  <DiffViewer diff={diffContent} />
                ) : (
                  <Text style={{ color: tokens.colorNeutralForeground3, padding: 24 }}>
                    Select a commit to view its changes.
                  </Text>
                )}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setHistoryOpen(false)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Encrypt Dialog */}
      <Dialog open={encryptOpen} onOpenChange={(e, data) => { if (!data.open) setEncryptOpen(false); }}>
        <DialogSurface style={{ maxWidth: '480px' }}>
          <DialogBody>
            <DialogTitle>Encrypt Notebook</DialogTitle>
            <DialogContent>
              <MessageBar intent="warning" style={{ marginBottom: 16 }}>
                <MessageBarBody>
                  If you lose this password, the notebook content cannot be recovered.
                </MessageBarBody>
              </MessageBar>
              <Field label="Password" required style={{ marginBottom: 12 }}>
                <Input type="password" value={encryptPassword}
                  onChange={(e, data) => setEncryptPassword(data.value)} autoFocus />
              </Field>
              <Field label="Confirm password" required>
                <Input type="password" value={encryptConfirm}
                  onChange={(e, data) => setEncryptConfirm(data.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEncrypt(); }} />
              </Field>
              {encryptError && (
                <MessageBar intent="error" style={{ marginTop: 12 }}>
                  <MessageBarBody>{encryptError}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setEncryptOpen(false)}>Cancel</Button>
              <Button appearance="primary" icon={<LockClosedRegular />}
                disabled={!encryptPassword || encrypting}
                onClick={handleEncrypt}>
                {encrypting ? 'Encrypting...' : 'Encrypt'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Decrypt confirm */}
      <ConfirmDialog
        open={decryptOpen}
        title="Decrypt Notebook"
        message="Notebook content will be saved as plain text. Anyone with access to this app will be able to read it without a password."
        onConfirm={handleDecrypt}
        onClose={() => setDecryptOpen(false)}
      />

      {/* Change Password Dialog */}
      <Dialog open={changePwOpen} onOpenChange={(e, data) => { if (!data.open) setChangePwOpen(false); }}>
        <DialogSurface style={{ maxWidth: '480px' }}>
          <DialogBody>
            <DialogTitle>Change Password</DialogTitle>
            <DialogContent>
              <MessageBar intent="warning" style={{ marginBottom: 16 }}>
                <MessageBarBody>
                  Content will be re-encrypted with the new password. The old password will no longer work.
                </MessageBarBody>
              </MessageBar>
              <Field label="New password" required style={{ marginBottom: 12 }}>
                <Input type="password" value={newPassword}
                  onChange={(e, data) => setNewPassword(data.value)} autoFocus />
              </Field>
              <Field label="Confirm new password" required>
                <Input type="password" value={newPasswordConfirm}
                  onChange={(e, data) => setNewPasswordConfirm(data.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }} />
              </Field>
              {changePwError && (
                <MessageBar intent="error" style={{ marginTop: 12 }}>
                  <MessageBarBody>{changePwError}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setChangePwOpen(false)}>Cancel</Button>
              <Button appearance="primary" icon={<KeyRegular />}
                disabled={!newPassword || changingPw}
                onClick={handleChangePassword}>
                {changingPw ? 'Updating...' : 'Update'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
