import { useState, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Button,
  Text,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Spinner,
} from '@fluentui/react-components';
import {
  ArrowUploadRegular,
  DismissRegular,
  DocumentRegular,
} from '@fluentui/react-icons';
import ConfirmDialog from './ConfirmDialog.jsx';
import { expensesApi } from '../api/index.js';

const useStyles = makeStyles({
  container: {
    marginTop: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },
  card: {
    position: 'relative',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    '&:hover': {
      boxShadow: tokens.shadow4,
    },
  },
  thumbnail: {
    width: '100%',
    height: '140px',
    objectFit: 'cover',
    display: 'block',
  },
  fileIcon: {
    width: '100%',
    height: '140px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  fileIconSvg: {
    fontSize: '40px',
    color: tokens.colorNeutralForeground3,
  },
  fileName: {
    padding: '6px 8px',
    fontSize: tokens.fontSizeBase200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  deleteBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    minWidth: 'auto',
    width: '24px',
    height: '24px',
    padding: '0',
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: 'white',
    borderRadius: '50%',
    '&:hover': {
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
    },
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
  },
  uploadArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
});

function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

export default function AttachmentGallery({ expenseId, attachments = [], onUpload, onDelete, uploading, readOnly }) {
  const styles = useStyles();
  const fileRef = useRef(null);
  const [lightbox, setLightbox] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0 && onUpload) {
      onUpload(files);
    }
    e.target.value = '';
  };

  const handleCardClick = (att) => {
    if (isImage(att.mimeType)) {
      setLightbox(att);
    } else {
      window.open(expensesApi.getAttachmentUrl(expenseId, att.filename), '_blank');
    }
  };

  return (
    <div className={styles.container}>
      {!readOnly && (
        <div className={styles.uploadArea}>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button
            appearance="primary"
            icon={<ArrowUploadRegular />}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
          </Button>
          {uploading && <Spinner size="tiny" />}
        </div>
      )}

      {attachments.length > 0 && (
        <div className={styles.grid}>
          {attachments.map((att) => (
            <div key={att.filename} className={styles.card} onClick={() => handleCardClick(att)}>
              {isImage(att.mimeType) ? (
                <img
                  src={expensesApi.getThumbnailUrl(expenseId, att.filename)}
                  alt={att.originalName}
                  className={styles.thumbnail}
                  onError={(e) => {
                    if (!e.target.dataset.fallback) {
                      e.target.dataset.fallback = '1';
                      e.target.src = expensesApi.getAttachmentUrl(expenseId, att.filename);
                    } else {
                      e.target.style.display = 'none';
                    }
                  }}
                />
              ) : (
                <div className={styles.fileIcon}>
                  <DocumentRegular className={styles.fileIconSvg} />
                  <Text size={100}>{att.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}</Text>
                </div>
              )}
              <div className={styles.fileName}>{att.originalName}</div>
              {!readOnly && (
                <Button
                  className={styles.deleteBtn}
                  appearance="subtle"
                  size="small"
                  icon={<DismissRegular />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(att.filename);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && !uploading && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: 8, display: 'block' }}>
          No attachments yet.
        </Text>
      )}

      {/* Lightbox dialog for images */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogSurface style={{ maxWidth: '90vw', width: 'fit-content' }}>
          <DialogBody style={{ alignItems: 'center' }}>
            <DialogTitle>{lightbox?.originalName}</DialogTitle>
            <DialogContent style={{ display: 'flex', justifyContent: 'center' }}>
              {lightbox && (
                <img
                  src={expensesApi.getAttachmentUrl(expenseId, lightbox.filename)}
                  alt={lightbox.originalName}
                  className={styles.lightboxImage}
                />
              )}
            </DialogContent>
            <DialogActions style={{ justifyContent: 'center' }}>
              <Button
                appearance="secondary"
                onClick={() => window.open(expensesApi.getAttachmentUrl(expenseId, lightbox?.filename), '_blank')}
              >
                Open Original
              </Button>
              <Button appearance="primary" onClick={() => setLightbox(null)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (onDelete && deleteTarget) onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete Attachment"
        message="Are you sure you want to delete this attachment?"
      />
    </div>
  );
}
