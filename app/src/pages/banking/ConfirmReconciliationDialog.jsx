import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, SubtractRegular } from '@fluentui/react-icons';

const fmtGBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export default function ConfirmReconciliationDialog({ open, onClose, onConfirm, changes, confirming }) {
  const totalChanges = changes.reduce((sum, c) => sum + c.additions.length + c.removals.length, 0);

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '600px', width: '90vw' }}>
        <DialogBody>
          <DialogTitle>Confirm Reconciliation Changes</DialogTitle>
          <DialogContent>
            <Text style={{ marginBottom: '16px', display: 'block' }}>
              {totalChanges} change{totalChanges !== 1 ? 's' : ''} across {changes.length} transaction{changes.length !== 1 ? 's' : ''}:
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflow: 'auto' }}>
              {changes.map((change) => (
                <div key={change.transaction._id} style={{ borderLeft: `3px solid ${tokens.colorNeutralStroke1}`, paddingLeft: '12px' }}>
                  <Text weight="semibold" style={{ display: 'block', marginBottom: '4px' }}>
                    {change.transaction.description || 'Transaction'} — {fmtGBP.format(Math.abs(change.transaction.amount || 0))}
                  </Text>
                  <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3, marginBottom: '8px' }}>
                    {change.transaction.date}
                  </Text>
                  {change.additions.map((a) => (
                    <div key={`add-${a.type}-${a.entity._id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', color: tokens.colorPaletteGreenForeground1 }}>
                      <AddRegular style={{ fontSize: '14px' }} />
                      <Text size={200}>
                        Link {a.type}: {a.entity.description || a.entity.invoiceNumber || '—'} ({fmtGBP.format(Math.abs(a.type === 'invoice' ? (a.entity.total || 0) : (a.entity.amount || 0)))})
                      </Text>
                    </div>
                  ))}
                  {change.removals.map((r) => (
                    <div key={`rem-${r.type}-${r.entity._id}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0', color: tokens.colorPaletteRedForeground1 }}>
                      <SubtractRegular style={{ fontSize: '14px' }} />
                      <Text size={200}>
                        Unlink {r.type}: {r.entity.description || r.entity.invoiceNumber || '—'} ({fmtGBP.format(Math.abs(r.type === 'invoice' ? (r.entity.total || 0) : (r.entity.amount || 0)))})
                      </Text>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={confirming}>Cancel</Button>
            <Button appearance="primary" onClick={onConfirm} disabled={confirming}>
              {confirming ? <Spinner size="tiny" /> : null}
              {confirming ? ' Applying...' : 'Apply'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
