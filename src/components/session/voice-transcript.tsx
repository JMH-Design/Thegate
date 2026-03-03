"use client";

import { type VoiceState } from "@/hooks/use-voice-session";

interface VoiceTranscriptProps {
  state: VoiceState;
  text: string;
}

const STATUS_LABELS: Partial<Record<VoiceState, string>> = {
  listening: "Listening...",
  transcribing: "Processing...",
  thinking: "Thinking...",
};

export function VoiceTranscript({ state, text }: VoiceTranscriptProps) {
  const label = STATUS_LABELS[state];
  const showText =
    state === "speaking" ||
    state === "thinking" ||
    (state === "listening" && !!text);

  return (
    <div className="w-full max-w-2xl mx-auto px-6 min-h-[4rem] flex items-center justify-center">
      {label && !showText && (
        <p className="text-sm text-text-muted animate-pulse text-center">
          {label}
        </p>
      )}
      {showText && text && (
        <p className="text-[15px] text-text-secondary leading-relaxed text-center animate-[fade-in_200ms_ease]">
          {text}
        </p>
      )}
      {state === "idle" && (
        <p className="text-sm text-text-dim text-center">
          Voice session paused
        </p>
      )}
    </div>
  );
}
