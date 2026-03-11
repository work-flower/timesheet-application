import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  Button,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

export default function EntityPopupDialog({ open, onClose, onMessage, entityUrl }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.command) {
        onMessage?.(e.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, onMessage]);

  return (
    <Dialog open={open} onOpenChange={(e, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: '95vw', width: '95vw', maxHeight: '90vh', height: '90vh' }}>
        <DialogBody style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <DialogTitle
            action={
              <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} />
            }
          >
            Edit Record
          </DialogTitle>
          <DialogContent style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
            {entityUrl && (
              <iframe
                ref={iframeRef}
                src={entityUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Entity form"
              />
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
