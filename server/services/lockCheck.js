export function assertNotLocked(record) {
  if (record?.isLocked) {
    throw new Error(record.isLockedReason || 'Record is locked');
  }
}
