import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  Button,
  Field,
  Input,
  Select,
  Spinner,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { usersApi } from '../../api/index.js';

const emptyDraft = { userId: '', dailyRate: '', engagement: 'FULL_TIME', description: '' };

// Add/Edit dialog for a project resource. Owns the users fetch (requires the
// users.read grant when authorisation is on; returns an empty list in legacy
// mode). Values are handed back via onSubmit — persistence happens on the
// parent form's normal Save.
export default function ResourceDialog({ open, onClose, onSubmit, resource, assignedUserIds, defaultDailyRate }) {
  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    if (!open) return;
    setUsersError(null);
    setUsers(null);
    usersApi.getAll()
      .then(setUsers)
      .catch((err) => setUsersError(err.message));
    setDraft(resource
      ? {
          userId: resource.userId,
          dailyRate: resource.dailyRate != null ? String(resource.dailyRate) : '',
          engagement: resource.engagement === 'PART_TIME' ? 'PART_TIME' : 'FULL_TIME',
          description: resource.description || '',
        }
      : {
          ...emptyDraft,
          // Snapshot of the project's effective rate — editable, not live-inherited
          dailyRate: defaultDailyRate != null ? String(defaultDailyRate) : '',
        });
  }, [open, resource, defaultDailyRate]);

  const setField = (field) => (e) => {
    const value = e.target.value;
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const options = (users || []).filter((u) => !assignedUserIds.includes(u._id));
  // Editing a resource whose user is missing from the fetched list (deleted
  // user, fetch failed, legacy mode) — keep it selectable via its snapshot
  const showSnapshotOption = resource && !options.some((u) => u._id === resource.userId);

  const handleSubmit = () => {
    const selected = (users || []).find((u) => u._id === draft.userId);
    const rate = draft.dailyRate === '' ? null : Number(draft.dailyRate);
    onSubmit({
      userId: draft.userId,
      userEmail: selected?.email ?? resource?.userEmail ?? '',
      dailyRate: Number.isFinite(rate) ? rate : null,
      engagement: draft.engagement,
      description: draft.description,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{resource ? 'Edit Resource' : 'Add Resource'}</DialogTitle>
          <DialogContent>
            {usersError && (
              <MessageBar intent="warning" style={{ marginBottom: 8 }}>
                <MessageBarBody>Unable to load users — you may lack permission to read users.</MessageBarBody>
              </MessageBar>
            )}
            {users === null && !usersError && <Spinner size="tiny" label="Loading users..." />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="User" required>
                <Select value={draft.userId} onChange={setField('userId')}>
                  <option value="">Select user...</option>
                  {showSnapshotOption && (
                    <option value={resource.userId}>{resource.userEmail || resource.userId}</option>
                  )}
                  {options.map((u) => (
                    <option key={u._id} value={u._id}>{u.email}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Daily Rate" hint={resource ? undefined : 'Prefilled from the project’s effective rate'}>
                <Input
                  type="number"
                  value={draft.dailyRate}
                  onChange={setField('dailyRate')}
                  min={0}
                  step={0.01}
                />
              </Field>
              <Field label="Engagement">
                <Select value={draft.engagement} onChange={setField('engagement')}>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                </Select>
              </Field>
              <Field label="Description">
                <Input value={draft.description} onChange={setField('description')} placeholder="e.g. Lead developer" />
              </Field>
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" onClick={handleSubmit} disabled={!draft.userId}>
              {resource ? 'Update' : 'Add'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
