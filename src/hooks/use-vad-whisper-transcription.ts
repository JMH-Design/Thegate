"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { normalizeVoiceError } from "@/lib/voice-errors";
import { float32ToWavFile } from "@/lib/audio-utils";

interface UseVadWhisperTranscriptionOptions {
  onTranscriptComplete: (transcript: string) => void;
  onError?: (err: Error) => void;
  onSpeechStart?: () => void;
  onConnectionStateChange?: (
    state: "connecting" | "connected" | "disconnected" | "failed"
  ) => void;
}

export function useVadWhisperTranscription(
  options: UseVadWhisperTranscriptionOptions
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [partialTranscript, setPartialTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vadRef = useRef<Awaited<ReturnType<typeof MicVAD.new>> | null>(null);
  const transcribingRef = useRef(false);

  const connect = useCallback(async (preAcquiredStream?: MediaStream | null) => {
    try {
      optionsRef.current.onConnectionStateChange?.("connecting");
      setError(null);

      const vadOptions: Parameters<typeof MicVAD.new>[0] = {
        onSpeechStart: () => {
          optionsRef.current.onSpeechStart?.();
        },
        onSpeechEnd: async (audio: Float32Array) => {
          if (transcribingRef.current) return;
          transcribingRef.current = true;
          setPartialTranscript("Processing your speech...");

          try {
            const file = float32ToWavFile(audio);
            const formData = new FormData();
            formData.append("audio", file);

            const res = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(errText || "Transcription failed");
            }

            const data = (await res.json()) as { text?: string };
            const text = (data.text ?? "").trim();
            if (text) {
              optionsRef.current.onTranscriptComplete(text);
            }
          } catch (err) {
            optionsRef.current.onError?.(
              err instanceof Error ? err : new Error(String(err))
            );
          } finally {
            transcribingRef.current = false;
            setPartialTranscript("");
          }
        },
      };

      if (preAcquiredStream) {
        vadOptions.getStream = () => Promise.resolve(preAcquiredStream);
      }

      const vad = await MicVAD.new(vadOptions);

      vadRef.current = vad;
      vad.start();
      setIsConnected(true);
      optionsRef.current.onConnectionStateChange?.("connected");
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : "VAD connection failed";
      const info = normalizeVoiceError(raw);
      setError(`${info.message} ${info.action}`);
      setIsConnected(false);
      optionsRef.current.onConnectionStateChange?.("failed");
      optionsRef.current.onError?.(
        err instanceof Error ? err : new Error(raw)
      );
    }
  }, []);

  const disconnect = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause();
      vadRef.current.destroy();
      vadRef.current = null;
    }
    setPartialTranscript("");
    setIsConnected(false);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    partialTranscript,
    isConnected,
    error,
    connect,
    disconnect,
  };
}
