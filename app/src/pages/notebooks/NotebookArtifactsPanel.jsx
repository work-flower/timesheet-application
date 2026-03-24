import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  makeStyles, tokens, Text, Button, Tooltip, Spinner,
  MessageBar, MessageBarBody, Input, SearchBox,
  InlineDrawer, DrawerBody, DrawerHeader, DrawerHeaderTitle,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular, DeleteRegular, DismissRegular,
  RenameRegular, EyeRegular, ArrowUploadRegular,
  DocumentRegular, ImageRegular, DocumentPdfRegular,
  LinkRegular, ImageAddRegular, CodeRegular,
  PanelRightExpandRegular,
} from '@fluentui/react-icons';
import { notebooksApi } from '../../api/index.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const useStyles = makeStyles({
  drawer: {
    width: '280px',
  },
  search: {
    marginBottom: '8px',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  fileRow: {
    padding: '6px 0',
    borderRadius: '4px',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  fileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 4px',
  },
  fileIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase200,
  },
  fileMeta: {
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase100,
  },
  fileActions: {
    display: 'flex',
    paddingLeft: '26px',
    marginTop: '2px',
  },
  empty: {
    padding: '16px 0',
    textAlign: 'center',
    color: tokens.colorNeutralForeground4,
    fontSize: tokens.fontSizeBase200,
  },
  message: {
    marginBottom: '8px',
  },
  expandBar: {
    borderLeft: `1px solid ${tokens.colorNeutralStroke3}`,
    display: 'flex',
    alignItems: 'flex-start',
    padding: '8px 2px',
    flexShrink: 0,
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
  },
  previewIframe: {
    width: '100%',
    height: '70vh',
    border: 'none',
    borderRadius: '4px',
  },
});

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType) {
  if (mimeType?.startsWith('image/')) return <ImageRegular />;
  if (mimeType === 'application/pdf') return <DocumentPdfRegular />;
  return <DocumentRegular />;
}

function isImage(mimeType) {
  return mimeType?.startsWith('image/');
}

function isPreviewable(mimeType) {
  return mimeType?.startsWith('image/') || mimeType === 'application/pdf';
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'wma',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'sqlite', 'db',
]);

function isBinary(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

function guessLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    kt: 'kotlin', scala: 'scala', groovy: 'groovy', gradle: 'groovy',
    cs: 'csharp', fs: 'fsharp', vb: 'vb',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', cc: 'cpp',
    swift: 'swift', m: 'objective-c', mm: 'objective-c',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish', ps1: 'powershell',
    sql: 'sql', graphql: 'graphql', gql: 'graphql',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', sass: 'sass',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    md: 'markdown', mdx: 'markdown', rst: 'text',
    tf: 'hcl', hcl: 'hcl', bicep: 'bicep',
    dockerfile: 'dockerfile', makefile: 'makefile',
    r: 'r', lua: 'lua', perl: 'perl', pl: 'perl', php: 'php',
    dart: 'dart', elixir: 'elixir', ex: 'elixir', erl: 'erlang',
    zig: 'zig', nim: 'nim', v: 'v', d: 'd',
    proto: 'protobuf', thrift: 'thrift',
    ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'properties',
    tex: 'latex', cls: 'latex', sty: 'latex',
    diff: 'diff', patch: 'diff',
  };
  return map[ext] ?? 'txt';
}

export default function NotebookArtifactsPanel({ notebookId, open, onToggle, onInsertImage, onInsertLink, onInsertCodeBlock, onChanged }) {
  const styles = useStyles();
  const fileInputRef = useRef(null);

  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [previewTarget, setPreviewTarget] = useState(null);

  const loadArtifacts = useCallback(async () => {
    if (!notebookId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await notebooksApi.listArtifacts(notebookId);
      setArtifacts(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    if (open) loadArtifacts();
  }, [open, loadArtifacts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return artifacts;
    const q = search.toLowerCase();
    return artifacts.filter((a) => a.filename.toLowerCase().includes(q));
  }, [artifacts, search]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await notebooksApi.uploadArtifact(notebookId, file);
      await loadArtifacts();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await notebooksApi.deleteArtifact(notebookId, deleteTarget);
      setDeleteTarget(null);
      await loadArtifacts();
      onChanged?.();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      await notebooksApi.renameArtifact(notebookId, renameTarget, renameValue.trim());
      setRenameTarget(null);
      setRenameValue('');
      await loadArtifacts();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRenaming(false);
    }
  };

  const CODE_BLOCK_CHAR_LIMIT = 3000;

  const handleInsertCodeBlock = async (artifact) => {
    try {
      const content = await notebooksApi.readArtifact(notebookId, artifact.filename);
      if (content.length > CODE_BLOCK_CHAR_LIMIT) {
        const lines = content.split('\n').length;
        setError(`File too large for code block (~${lines} lines). Limit is ~60 lines. Use "Insert as link" instead.`);
        return;
      }
      const language = guessLanguage(artifact.filename);
      onInsertCodeBlock?.(content, language, artifact.filename);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = (filename) => {
    const url = `/notebooks/${notebookId}/${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleInsertImage = (filename) => {
    onInsertImage?.(filename, filename);
  };

  const handleInsertLink = (filename) => {
    onInsertLink?.(filename, filename);
  };

  const handlePreview = (artifact) => {
    if (isPreviewable(artifact.mimeType)) {
      setPreviewTarget(artifact);
    } else {
      handleDownload(artifact.filename);
    }
  };

  const previewUrl = previewTarget
    ? `/notebooks/${notebookId}/${encodeURIComponent(previewTarget.filename)}`
    : null;

  return (
    <>
      <InlineDrawer
        open={open}
        position="end"
        separator
        className={styles.drawer}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <div style={{ display: 'flex', gap: 2 }}>
                <Tooltip content="Upload file" relationship="label">
                  <Button appearance="subtle" size="small"
                    icon={<ArrowUploadRegular />}
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()} />
                </Tooltip>
                <Button appearance="subtle" size="small"
                  icon={<DismissRegular />}
                  onClick={onToggle} />
              </div>
            }
          >
            Artifacts
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />

          {error && (
            <MessageBar intent="error" className={styles.message}>
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          <SearchBox
            className={styles.search}
            placeholder="Filter artifacts..."
            size="small"
            value={search}
            onChange={(e, data) => setSearch(data.value)}
          />

          {loading ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Spinner size="tiny" label="Loading..." />
            </div>
          ) : filtered.length === 0 ? (
            <Text className={styles.empty}>
              {artifacts.length === 0
                ? 'No artifacts yet. Upload files to store them alongside this notebook.'
                : 'No artifacts match your search.'}
            </Text>
          ) : (
            <div className={styles.fileList}>
              {filtered.map((artifact) => (
                <div key={artifact.filename} className={styles.fileRow}>
                  <div className={styles.fileHeader}>
                    <span className={styles.fileIcon}>
                      {getFileIcon(artifact.mimeType)}
                    </span>
                    <div className={styles.fileInfo}>
                      <Text className={styles.fileName} title={artifact.filename}>
                        {artifact.filename}
                      </Text>
                      <Text className={styles.fileMeta}>
                        {formatFileSize(artifact.size)}
                      </Text>
                    </div>
                  </div>
                  <div className={styles.fileActions}>
                    {isImage(artifact.mimeType) ? (
                      <Tooltip content="Insert as image" relationship="label">
                        <Button appearance="subtle" size="small"
                          icon={<ImageAddRegular />}
                          onClick={() => handleInsertImage(artifact.filename)} />
                      </Tooltip>
                    ) : (
                      <Tooltip content="Insert as link" relationship="label">
                        <Button appearance="subtle" size="small"
                          icon={<LinkRegular />}
                          onClick={() => handleInsertLink(artifact.filename)} />
                      </Tooltip>
                    )}
                    <Tooltip content="Preview" relationship="label">
                      <Button appearance="subtle" size="small"
                        icon={<EyeRegular />}
                        onClick={() => handlePreview(artifact)} />
                    </Tooltip>
                    {!isBinary(artifact.filename) && (
                      <Tooltip content="Insert as code block" relationship="label">
                        <Button appearance="subtle" size="small"
                          icon={<CodeRegular />}
                          onClick={() => handleInsertCodeBlock(artifact)} />
                      </Tooltip>
                    )}
                    <Tooltip content="Download" relationship="label">
                      <Button appearance="subtle" size="small"
                        icon={<ArrowDownloadRegular />}
                        onClick={() => handleDownload(artifact.filename)} />
                    </Tooltip>
                    <Tooltip content="Rename" relationship="label">
                      <Button appearance="subtle" size="small"
                        icon={<RenameRegular />}
                        onClick={() => { setRenameTarget(artifact.filename); setRenameValue(artifact.filename); }} />
                    </Tooltip>
                    <Tooltip content="Delete" relationship="label">
                      <Button appearance="subtle" size="small"
                        icon={<DeleteRegular />}
                        onClick={() => setDeleteTarget(artifact.filename)} />
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DrawerBody>
      </InlineDrawer>

      {!open && (
        <div className={styles.expandBar}>
          <Tooltip content="Show artifacts" relationship="label" positioning="before">
            <Button appearance="subtle" size="small"
              icon={<PanelRightExpandRegular />}
              onClick={onToggle} />
          </Tooltip>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Artifact"
        message={`Are you sure you want to delete "${deleteTarget}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Dialog open={!!renameTarget} onOpenChange={(e, data) => { if (!data.open) { setRenameTarget(null); setRenameValue(''); } }}>
        <DialogSurface style={{ maxWidth: '400px' }}>
          <DialogBody>
            <DialogTitle>Rename Artifact</DialogTitle>
            <DialogContent>
              <Input
                value={renameValue}
                onChange={(e, data) => setRenameValue(data.value)}
                style={{ width: '100%' }}
                autoFocus
              />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setRenameTarget(null); setRenameValue(''); }}>Cancel</Button>
              <Button appearance="primary" disabled={!renameValue.trim() || renaming}
                onClick={handleRename}>
                {renaming ? 'Renaming...' : 'Rename'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!previewTarget} onOpenChange={(e, data) => { if (!data.open) setPreviewTarget(null); }}>
        <DialogSurface style={{ maxWidth: '900px', width: '90vw', maxHeight: '90vh' }}>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
            <DialogTitle>{previewTarget?.filename}</DialogTitle>
            <DialogContent style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              {previewTarget?.mimeType?.startsWith('image/') && (
                <img src={previewUrl} alt={previewTarget?.filename} className={styles.previewImage} />
              )}
              {previewTarget?.mimeType === 'application/pdf' && (
                <iframe src={previewUrl} title={previewTarget?.filename} className={styles.previewIframe} />
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPreviewTarget(null)}>Close</Button>
              <Button appearance="primary" icon={<ArrowDownloadRegular />}
                onClick={() => handleDownload(previewTarget?.filename)}>
                Download
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
