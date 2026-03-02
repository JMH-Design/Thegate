"use client";

import { useEffect } from "react";
import { type VoiceState } from "@/hooks/use-voice-session";
import { AudioVisualizer } from "@/components/session/audio-visualizer";
import { VoiceTranscript } from "@/components/session/voice-transcript";
import { VoiceControls } from "@/components/session/voice-controls";
import { Keyboard } from "lucide-react";

interface VoiceModeProps {
  state: VoiceState;
  analyser: AnalyserNode | null;
  currentTranscript: string;
  isMuted: boolean;
  isPaused: boolean;
  ending: boolean;
  canEnd: boolean;
  topicName: string;
  sessionNumber: number;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onEnd: () => void;
  onSwitchToText: () => void;
  onStart: () => Promise<void>;
}

export function VoiceMode({
  state,
  analyser,
  currentTranscript,
  isMuted,
  isPaused,
  ending,
  canEnd,
  topicName,
  sessionNumber,
  onToggleMute,
  onTogglePause,
  onEnd,
  onSwitchToText,
  onStart,
}: VoiceModeProps) {
  useEffect(() => {
    if (state === "idle") {
      onStart();
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex flex-col">
      {/* Switch to text toggle */}
      <div className="flex justify-end px-6 pt-3">
        <button
          onClick={onSwitchToText}
          className="flex items-center gap-1.5 text-xs text-text-dim hover:text-text-muted transition-colors duration-fast"
        >
          <Keyboard size={14} />
          <span>Text mode</span>
        </button>
      </div>

      {/* Center: Visualizer */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-xl">
          <AudioVisualizer analyser={analyser} state={state} />
        </div>
      </div>

      {/* Bottom: Transcript + Controls */}
      <div className="pb-6 space-y-5">
        <VoiceTranscript state={state} text={currentTranscript} />

        <VoiceControls
          isMuted={isMuted}
          isPaused={isPaused}
          ending={ending}
          canEnd={canEnd}
          onToggleMute={onToggleMute}
          onTogglePause={onTogglePause}
          onEnd={onEnd}
        />

        {ending && (
          <p className="text-center text-xs text-gold animate-pulse">
            Analyzing session...
          </p>
        )}

        <div className="text-center">
          <span className="text-[11px] text-text-dim">
            {topicName} · Session {sessionNumber}
          </span>
        </div>
      </div>
    </div>
  );
}
