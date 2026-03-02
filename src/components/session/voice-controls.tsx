"use client";

import { Mic, MicOff, Pause, Play, X } from "lucide-react";

interface VoiceControlsProps {
  isMuted: boolean;
  isPaused: boolean;
  ending: boolean;
  canEnd: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onEnd: () => void;
}

export function VoiceControls({
  isMuted,
  isPaused,
  ending,
  canEnd,
  onToggleMute,
  onTogglePause,
  onEnd,
}: VoiceControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        onClick={onToggleMute}
        disabled={ending}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-fast ${
          isMuted
            ? "bg-danger/20 text-danger border border-danger/40"
            : "bg-surface hover:bg-surface-hover text-text-secondary border border-border-subtle"
        } disabled:opacity-40`}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
      >
        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
      </button>

      <button
        onClick={onTogglePause}
        disabled={ending}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-fast ${
          isPaused
            ? "bg-gold/20 text-gold border border-gold/40"
            : "bg-surface hover:bg-surface-hover text-text-secondary border border-border-subtle"
        } disabled:opacity-40`}
        aria-label={isPaused ? "Resume session" : "Pause session"}
      >
        {isPaused ? <Play size={22} /> : <Pause size={22} />}
      </button>

      <button
        onClick={onEnd}
        disabled={!canEnd || ending}
        className="w-12 h-12 rounded-full flex items-center justify-center bg-surface hover:bg-surface-hover text-text-muted hover:text-danger border border-border-subtle transition-all duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="End session"
      >
        <X size={20} />
      </button>
    </div>
  );
}
