import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message }) {
  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title || 'Confirm'}</DialogTitle>
          <DialogContent>{message || 'Are you sure?'}</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={onClose}>Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={onConfirm}>Confirm</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
