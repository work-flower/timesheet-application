let currentTraceId = crypto.randomUUID();

export function newTraceId() {
  currentTraceId = crypto.randomUUID();
  return currentTraceId;
}

export function getTraceId() {
  return currentTraceId;
}
