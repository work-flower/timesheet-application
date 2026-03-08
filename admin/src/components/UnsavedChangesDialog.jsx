import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';

export default function UnsavedChangesDialog({ open, onSave, onDiscard, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogContent>You have unsaved changes. What would you like to do?</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>Cancel</Button>
            <Button appearance="subtle" onClick={onDiscard}>Discard</Button>
            <Button appearance="primary" onClick={onSave}>Save</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
