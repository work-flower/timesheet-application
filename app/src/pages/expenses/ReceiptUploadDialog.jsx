import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Select,
  Spinner,
  MessageBar,
  MessageBarBody,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular, CameraRegular } from '@fluentui/react-icons';
import { expensesApi } from '../../api/index.js';
import CameraCapturePane, { isCameraSupported, CAMERA_UNSUPPORTED_MESSAGE } from './CameraCapturePane.jsx';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  sourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '140px',
    overflowY: 'auto',
    padding: '4px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '2px 6px',
  },
  spinner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
  },
  splitLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    height: '70vh',
  },
  previewPane: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    minHeight: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  previewIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  previewEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colorNeutralForeground3,
  },
  fieldsPane: {
    overflowY: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  receiptCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  receiptCardSelected: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    border: `2px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1Hover,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  failedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '12px',
    backgroundColor: tokens.colorPaletteRedBackground1,
    border: `1px solid ${tokens.colorPaletteRedBorder2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  failedItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
});

export default function ReceiptUploadDialog({ open, onClose, onCreated, projects }) {
  const styles = useStyles();
  const [phase, setPhase] = useState('upload'); // upload | parsing | preview | creating
  const [files, setFiles] = useState([]);       // File objects from the picker and/or camera
  // The camera is a sub-mode of the upload phase, not a peer of it — making it a
  // phase would displace the Parse button.
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraSupported = useMemo(() => isCameraSupported(), []);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);        // Array of { filename, file, ...parsedFields, error? }
  const [progress, setProgress] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [objectUrls, setObjectUrls] = useState({}); // index → objectURL

  const projectsByClient = useMemo(() => {
    const groups = {};
    for (const p of (projects || []).filter((p) => p.status === 'active')) {
      const key = p.clientName || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }, [projects]);

  const failedItems = useMemo(() => items.filter((item) => item.error), [items]);
  const validItems = useMemo(() => items.filter((item) => !item.error), [items]);

  // Create object URLs for file previews when items change
  useEffect(() => {
    const urls = {};
    items.forEach((item, i) => {
      if (item.file) {
        urls[i] = URL.createObjectURL(item.file);
      }
    });
    setObjectUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [items]);

  // Auto-select first valid item
  useEffect(() => {
    if (phase === 'preview' && validItems.length > 0) {
      const firstValidIndex = items.findIndex((item) => !item.error);
      if (firstValidIndex >= 0) setSelectedIndex(firstValidIndex);
    }
  }, [phase, items, validItems.length]);

  const handleClose = () => {
    setPhase('upload');
    setFiles([]);
    setCameraOpen(false);
    setProjectId('');
    setError(null);
    setItems([]);
    setProgress('');
    setSelectedIndex(0);
    onClose();
  };

  const handleCameraCapture = (file) => {
    // Append, so captures accumulate and coexist with picked files.
    setFiles((prev) => [...prev, file]);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParse = async () => {
    if (files.length === 0 || !projectId) return;
    setError(null);
    setPhase('parsing');
    try {
      const results = await expensesApi.parseReceipts(files);
      const parsed = results.map((r, i) => ({
        // Stable identity for this item. Filenames are NOT unique — the picker
        // appends, so the same file can be chosen twice — so anything keyed by
        // filename would smear one item's error across its namesakes. Survives
        // updateItem (spread) and removeItem (filter).
        uid: i,
        filename: r.filename || files[i].name,
        file: files[i],
        date: r.date || '',
        amount: r.amount != null ? String(r.amount) : '',
        vatAmount: r.vatAmount != null ? String(r.vatAmount) : '0',
        expenseType: r.expenseType || '',
        description: r.description || '',
        externalReference: r.externalReference || '',
        error: r.error || null,
      }));
      setItems(parsed);
      setPhase('preview');
    } catch (err) {
      setError(err.message);
      setPhase('upload');
    }
  };

  const updateItem = (index, field) => (e, data) => {
    const value = data?.value ?? e.target.value;
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex((prev) => prev >= index && prev > 0 ? prev - 1 : prev);
  };

  const handleCreate = async () => {
    if (validItems.length === 0) return;
    setError(null);
    setPhase('creating');
    const createdIds = [];
    const createFailures = [];
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      setProgress(`Creating expense ${i + 1} of ${validItems.length}...`);
      const amount = parseFloat(item.amount);
      const vatAmount = parseFloat(item.vatAmount) || 0;
      if (isNaN(amount) || amount === 0) {
        createFailures.push({ uid: item.uid, error: 'Amount must be a non-zero number.' });
        continue;
      }
      try {
        const expense = await expensesApi.create({
          projectId,
          date: item.date || new Date().toISOString().split('T')[0],
          amount,
          vatAmount,
          expenseType: item.expenseType || '',
          description: item.description || '',
          externalReference: item.externalReference || '',
          billable: true,
        });
        createdIds.push(expense._id);
        try {
          await expensesApi.uploadAttachments(expense._id, [item.file]);
        } catch {
          // Non-fatal — expense created, attachment failed
        }
      } catch (err) {
        createFailures.push({ uid: item.uid, error: err.message });
      }
    }
    if (createFailures.length > 0) {
      setItems((prev) => prev.map((item) => {
        const failure = createFailures.find((f) => f.uid === item.uid);
        return failure ? { ...item, error: `Create failed: ${failure.error}` } : item;
      }));
      setPhase('preview');
    }
    if (createdIds.length > 0) {
      if (createFailures.length === 0) {
        handleClose();
      }
      onCreated(createdIds);
    }
  };

  const selectedItem = items[selectedIndex];
  const selectedUrl = objectUrls[selectedIndex];
  const selectedIsPdf = selectedItem?.file?.type === 'application/pdf';

  const renderPreviewPane = () => {
    if (!selectedItem || !selectedUrl) {
      return <div className={styles.previewEmpty}><Text>Select a receipt to preview</Text></div>;
    }
    if (selectedIsPdf) {
      return <iframe className={styles.previewIframe} src={selectedUrl} title={selectedItem.filename} />;
    }
    return <img className={styles.previewImage} src={selectedUrl} alt={selectedItem.filename} />;
  };

  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) handleClose(); }}>
      <DialogSurface style={{ maxWidth: phase === 'preview' ? 960 : 600 }}>
        <DialogBody>
          <DialogTitle>Scan Receipts</DialogTitle>
          <DialogContent>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: 12 }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {phase === 'parsing' && (
              <div className={styles.spinner}>
                <Spinner size="medium" />
                <span>Parsing {files.length} receipt{files.length !== 1 ? 's' : ''}...</span>
              </div>
            )}

            {phase === 'creating' && (
              <div className={styles.spinner}>
                <Spinner size="medium" />
                <span>{progress}</span>
              </div>
            )}

            {phase === 'upload' && (
              <div className={styles.form}>
                <Field label="Receipt files" required hint="Choose one or more receipt images or PDFs, and/or take photos.">
                  <div className={styles.sourceRow}>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      multiple
                      onChange={(e) => {
                        // Append, not replace: replacing would silently discard
                        // any photos already captured in this session.
                        setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
                        // Clear so the same file can be re-picked after removal,
                        // and so the native "N files selected" label stops
                        // contradicting the list below.
                        e.target.value = '';
                      }}
                      style={{ fontSize: tokens.fontSizeBase300 }}
                    />
                    {!cameraOpen && (
                      <Tooltip
                        content={cameraSupported ? 'Take a photo of a receipt' : CAMERA_UNSUPPORTED_MESSAGE}
                        // "description", not "label": a label relationship
                        // overwrites the button's visible accessible name.
                        relationship="description"
                        withArrow
                      >
                        <Button
                          appearance="outline"
                          icon={<CameraRegular />}
                          size="small"
                          disabledFocusable={!cameraSupported}
                          onClick={() => { if (cameraSupported) setCameraOpen(true); }}
                        >
                          Use camera
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                </Field>

                {cameraOpen && (
                  <CameraCapturePane
                    onCapture={handleCameraCapture}
                    onCancel={() => setCameraOpen(false)}
                    captureLabel="Use photo"
                    height={300}
                    hint={`${files.length} file${files.length === 1 ? '' : 's'} ready — keep capturing, or press Done.`}
                  />
                )}

                {files.length > 0 && (
                  <div className={styles.fileList}>
                    {files.map((f, i) => (
                      <div key={`${f.name}-${i}`} className={styles.fileRow}>
                        <Text size={200} truncate wrap={false}>{f.name}</Text>
                        <Button
                          appearance="subtle"
                          icon={<DismissRegular />}
                          size="small"
                          onClick={() => removeFile(i)}
                          title={`Remove ${f.name}`}
                          aria-label={`Remove ${f.name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <Field label="Project" required>
                  <Select value={projectId} onChange={(e, data) => setProjectId(data.value)}>
                    <option value="">Select project...</option>
                    {Object.entries(projectsByClient).map(([clientName, projs]) => (
                      <optgroup key={clientName} label={clientName}>
                        {projs.map((p) => (
                          <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {phase === 'preview' && (
              <>
                {failedItems.length > 0 && (
                  <div className={styles.failedList} style={{ marginBottom: 12 }}>
                    <Text weight="semibold" size={300}>
                      Failed ({failedItems.length})
                    </Text>
                    {failedItems.map((item, i) => (
                      <div key={i} className={styles.failedItem}>
                        <Text size={200} weight="semibold">{item.filename}</Text>
                        <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                          {item.error}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.splitLayout}>
                  <div className={styles.previewPane}>
                    {renderPreviewPane()}
                  </div>
                  <div className={styles.fieldsPane}>
                    {validItems.length > 0 && failedItems.length > 0 && (
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
                        Parsed successfully ({validItems.length})
                      </Text>
                    )}
                    {validItems.map((item) => {
                      const index = items.indexOf(item);
                      const isSelected = index === selectedIndex;
                      return (
                        <div
                          key={item.uid}
                          className={isSelected ? styles.receiptCardSelected : styles.receiptCard}
                          onClick={() => setSelectedIndex(index)}
                        >
                          <div className={styles.cardHeader}>
                            <Text weight="semibold" size={300}>{item.filename}</Text>
                            {validItems.length > 1 && (
                              <Button
                                appearance="subtle"
                                icon={<DismissRegular />}
                                size="small"
                                onClick={(e) => { e.stopPropagation(); removeItem(index); }}
                                title="Remove"
                              />
                            )}
                          </div>
                          <div className={styles.row}>
                            <Field label="Date" size="small">
                              <Input type="date" value={item.date} onChange={updateItem(index, 'date')} size="small" />
                            </Field>
                            <Field label="Type" size="small">
                              <Input value={item.expenseType} onChange={updateItem(index, 'expenseType')} size="small" />
                            </Field>
                          </div>
                          <div className={styles.row}>
                            <Field label="Amount (gross)" size="small">
                              <Input value={item.amount} onChange={updateItem(index, 'amount')} type="number" step="0.01" size="small" />
                            </Field>
                            <Field label="VAT Amount" size="small">
                              <Input value={item.vatAmount} onChange={updateItem(index, 'vatAmount')} type="number" step="0.01" size="small" />
                            </Field>
                          </div>
                          <Field label="Description" size="small">
                            <Input value={item.description} onChange={updateItem(index, 'description')} size="small" />
                          </Field>
                          <Field label="External Reference" size="small">
                            <Input value={item.externalReference} onChange={updateItem(index, 'externalReference')} size="small" placeholder="e.g. INV-12345" />
                          </Field>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={handleClose} disabled={phase === 'parsing' || phase === 'creating'}>
              Cancel
            </Button>
            {phase === 'upload' && (
              <Button appearance="primary" onClick={handleParse} disabled={files.length === 0 || !projectId}>
                Parse
              </Button>
            )}
            {phase === 'preview' && (
              <Button appearance="primary" onClick={handleCreate} disabled={validItems.length === 0}>
                Create {validItems.length} Expense{validItems.length !== 1 ? 's' : ''}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
