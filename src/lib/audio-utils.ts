/**
 * Convert Float32Array audio (mono, 16kHz) to WAV File for Whisper API.
 */
export function float32ToWavFile(samples: Float32Array, sampleRate = 16000): File {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  let offset = 0;

  const write = (value: number, bytes: number) => {
    if (bytes === 4) view.setUint32(offset, value, true);
    else if (bytes === 2) view.setUint16(offset, value, true);
    else view.setUint8(offset, value);
    offset += bytes;
  };

  // RIFF header
  write(0x52494646, 4); // "RIFF"
  write(bufferSize - 8, 4); // file size - 8
  write(0x57415645, 4); // "WAVE"

  // fmt chunk
  write(0x666d7420, 4); // "fmt "
  write(16, 4); // chunk size
  write(1, 2); // PCM
  write(numChannels, 2);
  write(sampleRate, 4);
  write(byteRate, 4);
  write(blockAlign, 2);
  write(bitsPerSample, 2);

  // data chunk
  write(0x64617461, 4); // "data"
  write(dataSize, 4);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const v = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
    view.setInt16(offset, v, true);
    offset += 2;
  }

  const blob = new Blob([buffer], { type: "audio/wav" });
  return new File([blob], "speech.wav", { type: "audio/wav" });
}
