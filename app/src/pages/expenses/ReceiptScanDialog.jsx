import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Spinner,
  Text,
  Badge,
  MessageBar,
  MessageBarBody,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@fluentui/react-components';
import { ArrowRightRegular } from '@fluentui/react-icons';
import CameraCapturePane from './CameraCapturePane.jsx';
import { expensesApi } from '../../api/index.js';

/**
 * ORDER IS LOAD-BEARING — see handleChange in ExpenseForm.jsx.
 *
 * `amount` MUST precede `vatAmount`. handleChange('amount') reads prev.vatPercent
 * and re-derives vatAmount from it, so a vatAmount applied earlier gets clobbered:
 * with a form at amount 100 / vatPercent 20, applying a scanned {amount: 50,
 * vatAmount: 5} in the wrong order yields vatAmount 2.50 instead of 5.00 — wrong,
 * plausible-looking, and silent.
 *
 * This array is both the display order and the apply order. Reordering it for
 * cosmetic reasons WILL corrupt VAT.
 */
const FIELD_DEFS = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount (gross)', numeric: true },
  { key: 'vatAmount', label: 'VAT Amount', numeric: true },
  { key: 'expenseType', label: 'Expense Type' },
  { key: 'description', label: 'Description' },
  { key: 'externalReference', label: 'External Reference' },
];

const useStyles = makeStyles({
  splitLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    height: '60vh',
  },
  previewPane: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  tablePane: {
    overflowY: 'auto',
    minHeight: 0,
  },
  spinner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '24px',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  arrow: {
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
  },
  scanned: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

function hasValue(def, v) {
  if (v == null || v === '') return false;
  // The parser coerces a missing amount/vatAmount to 0, so 0 reads as "not found".
  if (def.numeric) return Number(v) !== 0;
  return true;
}

function display(def, v) {
  if (!hasValue(def, v)) return '—';
  if (def.numeric) return Number(v).toFixed(2);
  return String(v);
}

export default function ReceiptScanDialog({ open, onClose, current, onApply }) {
  const styles = useStyles();
  const [phase, setPhase] = useState('camera'); // camera | parsing | review
  const [capture, setCapture] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState(null);

  // Invalidates an in-flight parse. This component is rendered unconditionally by
  // its parent (only the Dialog *surface* unmounts on close), so its state — and
  // any pending promise — survives a close. Without this, dismissing with Esc or a
  // backdrop click while "Reading the receipt..." is showing lets the late
  // response repopulate the review of the photo the user just discarded.
  const parseTokenRef = useRef(0);

  // Object URL for the captured photo preview.
  useEffect(() => {
    if (!capture) { setPreviewUrl(null); return undefined; }
    const url = URL.createObjectURL(capture);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capture]);

  const reset = useCallback(() => {
    parseTokenRef.current += 1; // abandon any parse still in flight
    setPhase('camera');
    setCapture(null);
    setParsed(null);
    setSelected({});
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleCapture = useCallback(async (file) => {
    const token = ++parseTokenRef.current;
    setCapture(file);
    setError(null);
    setPhase('parsing');
    try {
      const results = await expensesApi.parseReceipts([file]);
      if (parseTokenRef.current !== token) return; // dialog was closed or retaken
      const result = results?.[0];
      if (!result) throw new Error('The parser returned no result for this photo.');
      if (result.error) {
        // Stay out of review — the form must not be touched on a parse failure.
        setError(result.error);
        setPhase('camera');
        setCapture(null);
        return;
      }
      setParsed(result);
      setSelected(
        Object.fromEntries(
          FIELD_DEFS
            .filter((d) => hasValue(d, result[d.key]))
            .map((d) => [d.key, true]),
        ),
      );
      setPhase('review');
    } catch (err) {
      if (parseTokenRef.current !== token) return;
      setError(err.message);
      setPhase('camera');
      setCapture(null);
    }
  }, []);

  const rows = useMemo(() => {
    if (!parsed) return [];
    const amountDef = FIELD_DEFS.find((d) => d.key === 'amount');
    const amountFound = hasValue(amountDef, parsed.amount);

    return FIELD_DEFS.map((def) => {
      const scanned = parsed[def.key];
      const currentValue = current?.[def.key];

      // vatAmount 0 is the one genuine ambiguity: the parser coerces both "no VAT
      // line on this receipt" and "couldn't read the VAT" to 0. If the amount did
      // parse, offer the row so zeroing an existing VAT is possible — but leave it
      // unticked (see the selection default in handleCapture) so it is opt-in.
      const isZeroVat = def.key === 'vatAmount' && amountFound && Number(scanned ?? 0) === 0;
      const found = hasValue(def, scanned) || isZeroVat;

      let status;
      if (!found) status = 'missing';
      else if (isZeroVat) status = 'zeroVat';
      else if (String(currentValue ?? '') === String(scanned ?? '')) status = 'same';
      else status = 'changed';

      const scannedText = isZeroVat ? '0.00' : display(def, scanned);

      return { def, scanned, scannedText, currentValue, found, status };
    });
  }, [parsed, current]);

  const selectedCount = useMemo(
    () => Object.values(selected).filter(Boolean).length,
    [selected],
  );

  const handleApply = () => {
    // FIELD_DEFS order is the dependency order the form relies on; filter/map
    // preserve it, so the entries arrive ready to apply sequentially.
    const entries = FIELD_DEFS
      .filter((d) => selected[d.key])
      .map((d) => [d.key, parsed[d.key]]);
    onApply(entries, capture);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) handleClose(); }}>
      <DialogSurface style={{ maxWidth: phase === 'review' ? 960 : 640, width: '90vw', maxHeight: '85vh' }}>
        <DialogBody>
          <DialogTitle>Scan Receipt</DialogTitle>
          <DialogContent>
            {error && (
              <MessageBar intent="error" style={{ marginBottom: '12px' }}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}

            {/* The pane mounts only in the camera phase, so leaving the phase
                releases the MediaStream automatically. */}
            {phase === 'camera' && open && (
              <CameraCapturePane
                onCapture={handleCapture}
                onCancel={handleClose}
                captureLabel="Use & parse"
                height={380}
              />
            )}

            {phase === 'parsing' && (
              <div className={styles.spinner}>
                <Spinner size="medium" />
                <span>Reading the receipt...</span>
              </div>
            )}

            {phase === 'review' && (
              <div className={styles.splitLayout}>
                <div className={styles.previewPane}>
                  {previewUrl && <img className={styles.previewImage} src={previewUrl} alt="Captured receipt" />}
                </div>
                <div className={styles.tablePane}>
                  <Table size="small">
                    <TableHeader>
                      <TableRow>
                        <TableHeaderCell style={{ width: '36px' }} />
                        <TableHeaderCell>Field</TableHeaderCell>
                        <TableHeaderCell>Current</TableHeaderCell>
                        <TableHeaderCell />
                        <TableHeaderCell>Scanned</TableHeaderCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ def, scannedText, currentValue, found, status }) => (
                        <TableRow key={def.key}>
                          <TableCell>
                            {/* A field the parser didn't find has no checkbox at
                                all — it cannot be ticked, so it cannot overwrite
                                a good value. Safer than relying on an apply-time
                                guard someone can delete. */}
                            {found && (
                              <Checkbox
                                checked={!!selected[def.key]}
                                onChange={(e, d) => setSelected((prev) => ({ ...prev, [def.key]: !!d.checked }))}
                                aria-label={`Apply ${def.label}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className={!found ? styles.muted : undefined}>{def.label}</TableCell>
                          {status === 'missing' ? (
                            <TableCell colSpan={3} className={styles.muted}>
                              <Text size={200}>Not found on receipt</Text>
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className={styles.muted}>{display(def, currentValue)}</TableCell>
                              <TableCell>
                                {status === 'same'
                                  ? <Badge size="small" appearance="outline" color="informative">No change</Badge>
                                  : <ArrowRightRegular className={styles.arrow} />}
                              </TableCell>
                              <TableCell>
                                <span className={styles.scanned}>{scannedText}</span>
                                {status === 'zeroVat' && (
                                  <Text size={200} className={styles.muted} block>No VAT found</Text>
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
          <DialogActions>
            {phase === 'review' && (
              <Button appearance="secondary" onClick={() => { setPhase('camera'); setCapture(null); setParsed(null); }}>
                Retake
              </Button>
            )}
            <Button appearance="secondary" onClick={handleClose} disabled={phase === 'parsing'}>
              Cancel
            </Button>
            {phase === 'review' && (
              <Button appearance="primary" onClick={handleApply} disabled={selectedCount === 0}>
                Apply {selectedCount} field{selectedCount === 1 ? '' : 's'}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
