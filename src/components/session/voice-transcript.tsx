"use client";

import { type VoiceState } from "@/hooks/use-voice-session";

interface VoiceTranscriptProps {
  state: VoiceState;
  text: string;
  /** When true, user must finish speaking before processing (VAD+Whisper fallback) */
  isFallbackMode?: boolean;
}

export function VoiceTranscript({
  state,
  text,
  isFallbackMode,
}: VoiceTranscriptProps) {
  const getLabel = () => {
    if (state === "transcribing") return "Processing...";
    if (state === "thinking") return "Thinking...";
    if (state === "listening") {
      return isFallbackMode ? "Speak now" : "Listening...";
    }
    return null;
  };

  const label = getLabel();
  const showText =
    state === "speaking" ||
    state === "thinking" ||
    (state === "listening" && !!text);

  return (
    <div className="w-full max-w-2xl mx-auto px-6 min-h-[4rem] flex flex-col items-center justify-center gap-1">
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
          Connecting...
        </p>
      )}
      {isFallbackMode && state === "listening" && (
        <p className="text-[11px] text-text-dim">Using backup voice</p>
      )}
    </div>
  );
}
