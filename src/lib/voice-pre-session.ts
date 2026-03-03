let preAcquiredStream: MediaStream | null = null;

export function setPreAcquiredStream(s: MediaStream) {
  preAcquiredStream = s;
}

export function takePreAcquiredStream(): MediaStream | null {
  const s = preAcquiredStream;
  preAcquiredStream = null;
  return s;
}
