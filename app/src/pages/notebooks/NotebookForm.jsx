import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import {
  makeStyles, tokens, Text, Spinner, MessageBar, MessageBarBody,
  Badge, Button, Tooltip,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components';
import {
  ArrowLeftRegular, DeleteRegular, ArchiveRegular,
  ArrowUndoRegular, ArrowRedoRegular, PrintRegular,
} from '@fluentui/react-icons';
import { notebooksApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import useAppNavigate from '../../hooks/useAppNavigate.js';
import NotebookEditor from '../../components/editors/NotebookEditor.jsx';
import EntitySearchDialog from '../../components/editors/EntitySearchDialog.jsx';

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
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
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
  hint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground4,
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
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

  // Trailing slash ensures relative image refs resolve to /notebooks/:id/filename
  if (!location.pathname.endsWith('/')) {
    return <Navigate to={`${location.pathname}/`} replace />;
  }

  const [initialized, setInitialized] = useState(false);
  const [loadedData, setLoadedData] = useState(null);
  const [error, setError] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Save status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle');

  // Metadata fields
  const [isDraft, setIsDraft] = useState(true);

  // Content
  const [initialContent, setInitialContent] = useState('');
  const contentRef = useRef('');

  // Auto-save timer
  const saveTimerRef = useRef(null);
  const editorRef = useRef(null);

  // Snapshot of last saved state
  const lastSavedRef = useRef({ isDraft: true, content: '' });

  // Load data
  useEffect(() => {
    if (!id) return;
    const init = async () => {
      try {
        const [data, md] = await Promise.all([
          notebooksApi.getById(id),
          notebooksApi.getContent(id),
        ]);
        setLoadedData(data);
        setIsDraft(data.isDraft ?? true);
        setInitialContent(md || '');
        contentRef.current = md || '';
        lastSavedRef.current = {
          isDraft: data.isDraft ?? true,
          content: md || '',
        };
      } catch (err) {
        setError(err.message);
      } finally {
        setInitialized(true);
      }
    };
    init();
  }, [id]);

  // Auto-save function
  const doSave = useCallback(async (currentIsDraft) => {
    const currentContent = contentRef.current;
    const last = lastSavedRef.current;

    const draftChanged = currentIsDraft !== last.isDraft;
    const contentChanged = currentContent !== last.content;

    if (!draftChanged && !contentChanged) return;

    setSaveStatus('saving');
    try {
      const promises = [];
      if (draftChanged) {
        promises.push(notebooksApi.update(id, { isDraft: currentIsDraft }));
      }
      if (contentChanged) {
        // Server derives title, summary, tags from content
        promises.push(notebooksApi.updateContent(id, currentContent));
      }
      await Promise.all(promises);

      lastSavedRef.current = {
        isDraft: currentIsDraft,
        content: currentContent,
      };

      // Refresh loaded data for status badges etc.
      const data = await notebooksApi.getById(id);
      setLoadedData(data);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [id]);

  // Schedule auto-save on any change
  const scheduleSave = useCallback((currentIsDraft) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave(currentIsDraft);
    }, AUTO_SAVE_DELAY);
  }, [doSave]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        doSave(isDraft);
      }
    };
  }, [isDraft, doSave]);

  const handleContentChange = useCallback((md) => {
    contentRef.current = md;
    scheduleSave(isDraft);
  }, [isDraft, scheduleSave]);

  const handleDraftToggle = () => {
    const next = !isDraft;
    setIsDraft(next);
    scheduleSave(next);
  };

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
    const urlMap = { project: 'projects', client: 'clients', timesheet: 'timesheets' };
    const href = `/${urlMap[entitySearchType]}/${record._id}`;
    let displayName;
    if (entitySearchType === 'project') displayName = record.name;
    else if (entitySearchType === 'client') displayName = record.companyName;
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
      await doSave(isDraft);
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
  }, [id, isDraft, doSave]);

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
        await doSave(isDraft);
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

  const isArchived = loadedData?.status === 'archived';

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
              onClick={() => goBack('/notebooks')} />
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
          <div className={styles.toolbarDivider} />
          <Tooltip content="Export as PDF" relationship="label">
            <Button appearance="subtle" size="small" icon={<PrintRegular />}
              onClick={handlePrint} />
          </Tooltip>
          {statusLabel && (
            <Text className={styles.statusText} style={saveStatus === 'error' ? { color: tokens.colorPaletteRedForeground1 } : undefined}>
              {statusLabel}
            </Text>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {isDraft && <Badge appearance="tint" color="warning" size="small">Draft</Badge>}
          {loadedData?.ragScore && (
            <Badge appearance="filled" color={ragScoreColors[loadedData.ragScore] || 'informative'} size="small">
              RAG: {loadedData.ragScore}
            </Badge>
          )}
          {isArchived && <Badge appearance="filled" color="subtle" size="small">Archived</Badge>}
          <div className={styles.toolbarDivider} />
          <Tooltip content={isDraft ? 'Mark as published' : 'Mark as draft'} relationship="label">
            <Button appearance="subtle" size="small" onClick={handleDraftToggle}>
              <Text size={200}>{isDraft ? 'Publish' : 'Draft'}</Text>
            </Button>
          </Tooltip>
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

      {/* Content */}
      <div className={styles.body}>
        <div className={styles.contentArea}>
          {error && <MessageBar intent="error" className={styles.message}><MessageBarBody>{error}</MessageBarBody></MessageBar>}

          <Text className={styles.hint}>
            Title, summary, and tags are derived from content. Use a heading for the title, then a summary paragraph, then hashtags like #azure #migration.
          </Text>

          <div className={styles.editorWrap}>
            <NotebookEditor
              ref={editorRef}
              defaultValue={initialContent}
              onChange={handleContentChange}
              readOnly={false}
              onImageUpload={handleImageUpload}
              onEntitySearch={handleEntitySearch}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Notebook"
        message="This notebook will be moved to the recycle bin. You can restore it later."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      <EntitySearchDialog
        open={entitySearchOpen}
        entityType={entitySearchType}
        onSelect={handleEntitySelect}
        onClose={() => setEntitySearchOpen(false)}
      />

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
    </div>
  );
}
