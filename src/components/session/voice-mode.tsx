"use client";

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
  voiceError: string | null;
  activeTranscriber?: "realtime" | "fallback" | null;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onEnd: () => void;
  onSwitchToText: () => void;
  onReconnect?: () => void;
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
  voiceError,
  activeTranscriber,
  onToggleMute,
  onTogglePause,
  onEnd,
  onSwitchToText,
  onReconnect,
}: VoiceModeProps) {
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

      {/* Center: Visualizer or Connecting */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-xl flex flex-col items-center gap-4">
          <AudioVisualizer analyser={analyser} state={state} />
          {state === "idle" && !voiceError && (
            <p className="text-sm text-text-dim animate-pulse">
              Connecting...
            </p>
          )}
          {voiceError && (
            <div className="flex flex-col items-center gap-2 max-w-xs">
              <p className="text-xs text-danger text-center">{voiceError}</p>
              {onReconnect && (
                <button
                  onClick={onReconnect}
                  disabled={ending}
                  className="text-xs font-medium text-gold hover:text-gold/80 transition-colors disabled:opacity-40"
                >
                  Reconnect
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Transcript + Controls */}
      <div className="pb-6 space-y-5">
        <VoiceTranscript
          state={state}
          text={currentTranscript}
          isFallbackMode={activeTranscriber === "fallback"}
        />

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
