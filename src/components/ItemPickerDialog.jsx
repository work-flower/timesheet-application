import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Switch,
  makeStyles,
  tokens,
  Text,
  Tooltip,
} from '@fluentui/react-components';
import { LockClosedRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  content: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    borderBottom: `2px solid ${tokens.colorNeutralStroke1}`,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  td: {
    padding: '6px 8px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    fontSize: tokens.fontSizeBase200,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  lockIcon: {
    color: tokens.colorNeutralForeground3,
    fontSize: '14px',
    marginLeft: '4px',
  },
  summary: {
    marginTop: '8px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

export default function ItemPickerDialog({
  open,
  onClose,
  onConfirm,
  items = [],
  columns = [],
  title = 'Select Items',
  alreadySelectedIds = [],
  invoiceId = null,
  filterToggle = null,
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState(new Set(alreadySelectedIds));
  const [toggleOn, setToggleOn] = useState(false);

  // Reset selection and toggle when dialog opens
  useMemo(() => {
    if (open) {
      setSelected(new Set(alreadySelectedIds));
      setToggleOn(false);
    }
  }, [open, alreadySelectedIds]);

  const filteredItems = useMemo(() => {
    if (!filterToggle?.filterFn || toggleOn) return items;
    return items.filter(filterToggle.filterFn);
  }, [items, toggleOn, filterToggle]);

  const toggleItem = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isLockedToOther = (item) => {
    return item.invoiceId && item.invoiceId !== invoiceId;
  };

  const handleConfirm = () => {
    onConfirm([...selected]);
    onClose();
  };

  const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '700px', width: '90vw' }}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {filterToggle && (
              <div className={styles.toolbar}>
                <Switch
                  checked={toggleOn}
                  onChange={(e, data) => setToggleOn(data.checked)}
                  label={filterToggle.label}
                />
              </div>
            )}
            <div className={styles.content}>
              {filteredItems.length === 0 ? (
                <Text style={{ padding: '16px', color: tokens.colorNeutralForeground3 }}>
                  No items available.
                </Text>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th} style={{ width: '32px' }}></th>
                      {columns.map(col => (
                        <th key={col.key} className={styles.th}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const locked = isLockedToOther(item);
                      return (
                        <tr key={item._id} className={locked ? styles.rowDisabled : undefined}>
                          <td className={styles.td}>
                            {locked ? (
                              <Tooltip content={`Locked to invoice ${item.invoiceNumber || item.invoiceId}`} relationship="label">
                                <LockClosedRegular className={styles.lockIcon} />
                              </Tooltip>
                            ) : (
                              <Checkbox
                                checked={selected.has(item._id)}
                                onChange={() => toggleItem(item._id)}
                              />
                            )}
                          </td>
                          {columns.map(col => (
                            <td key={col.key} className={styles.td}>
                              {col.render ? col.render(item) : item[col.key]}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <Text className={styles.summary}>{selected.size} item(s) selected</Text>
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={handleConfirm}>Confirm</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
