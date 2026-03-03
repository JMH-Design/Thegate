"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface RealtimeTranscriptEvent {
  type: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
}

interface UseRealtimeTranscriptionOptions {
  onTranscriptComplete: (transcript: string) => void;
  onError?: (err: Error) => void;
  /** Called when user starts speaking (for interrupt/barge-in) */
  onSpeechStart?: () => void;
  /** Called when connection state changes */
  onConnectionStateChange?: (state: "connecting" | "connected" | "disconnected" | "failed") => void;
}

const TOKEN_REFRESH_MS = 45_000;

export function useRealtimeTranscription(
  options: UseRealtimeTranscriptionOptions
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [partialTranscript, setPartialTranscript] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialBufferRef = useRef("");

  const connect = useCallback(async (preAcquiredStream?: MediaStream | null) => {
    try {
      optionsRef.current.onConnectionStateChange?.("connecting");
      setError(null);

      const tokenRes = await fetch("/api/voice/realtime-token", {
        method: "POST",
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token failed: ${errText}`);
      }
      const { token } = (await tokenRes.json()) as { token: string };

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const stream = preAcquiredStream ?? await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      pc.addTrack(stream.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data) as RealtimeTranscriptEvent;
          if (
            event.type === "conversation.item.input_audio_transcription.delta"
          ) {
            const delta = event.delta ?? "";
            partialBufferRef.current += delta;
            setPartialTranscript(partialBufferRef.current);
          } else if (
            event.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const transcript = event.transcript ?? partialBufferRef.current;
            partialBufferRef.current = "";
            setPartialTranscript("");
            if (transcript.trim()) {
              optionsRef.current.onTranscriptComplete(transcript.trim());
            }
          } else if (event.type === "input_audio_buffer.speech_started") {
            optionsRef.current.onSpeechStart?.();
          }
        } catch {
          /* ignore parse errors */
        }
      });

      dc.addEventListener("open", () => {
        setIsConnected(true);
        optionsRef.current.onConnectionStateChange?.("connected");
      });

      dc.addEventListener("close", () => {
        setIsConnected(false);
        optionsRef.current.onConnectionStateChange?.("disconnected");
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });

      if (!sdpRes.ok) {
        const errText = await sdpRes.text();
        throw new Error(`OpenAI Realtime call failed: ${errText}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      tokenRefreshTimerRef.current = setTimeout(() => {
        disconnect();
        connect(undefined);
      }, TOKEN_REFRESH_MS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setIsConnected(false);
      optionsRef.current.onConnectionStateChange?.("failed");
      optionsRef.current.onError?.(err instanceof Error ? err : new Error(message));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    partialBufferRef.current = "";
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
