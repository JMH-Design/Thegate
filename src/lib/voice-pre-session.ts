let preAcquiredStream: MediaStream | null = null;
let preAcquiredAudioContext: AudioContext | null = null;

export function setPreAcquiredStream(s: MediaStream) {
  preAcquiredStream = s;
}

export function takePreAcquiredStream(): MediaStream | null {
  const s = preAcquiredStream;
  preAcquiredStream = null;
  return s;
}

export function setPreAcquiredAudioContext(ctx: AudioContext) {
  preAcquiredAudioContext = ctx;
}

export function takePreAcquiredAudioContext(): AudioContext | null {
  const ctx = preAcquiredAudioContext;
  preAcquiredAudioContext = null;
  return ctx;
}
