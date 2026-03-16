"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  normalizeVoiceError,
  classifyVoiceError,
} from "@/lib/voice-errors";

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

const REFRESH_BUFFER_MS = 60_000;
const FALLBACK_REFRESH_MS = 540_000;
const MIN_REFRESH_MS = 30_000;
const MAX_AUTO_RECONNECTS = 5;
const FETCH_TIMEOUT_MS = 25_000;

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
  const reconnectingRef = useRef(false);
  const autoReconnectCountRef = useRef(0);

  const connect = useCallback(async (preAcquiredStream?: MediaStream | null) => {
    let stream: MediaStream | null = null;
    try {
      optionsRef.current.onConnectionStateChange?.("connecting");
      setError(null);

      // Acquire mic FIRST, before any await — browsers (especially iOS) require
      // getUserMedia within the user gesture context. Awaiting the token fetch
      // consumes the gesture; mic acquisition would then fail or hang.
      stream =
        preAcquiredStream ??
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }));

      const tokenCtrl = new AbortController();
      const tokenTimeout = setTimeout(() => tokenCtrl.abort(), FETCH_TIMEOUT_MS);
      const tokenRes = await fetch("/api/voice/realtime-token", {
        method: "POST",
        signal: tokenCtrl.signal,
      });
      clearTimeout(tokenTimeout);
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(`Token failed: ${errText}`);
      }
      const { token, expires_at } = (await tokenRes.json()) as {
        token: string;
        expires_at?: number;
      };

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const track = stream.getTracks()[0];
      if (!track) {
        throw new Error("No audio track available");
      }
      streamRef.current = stream;
      pc.addTrack(track);

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
        if (reconnectingRef.current) return;
        setIsConnected(false);
        optionsRef.current.onConnectionStateChange?.("disconnected");
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpCtrl = new AbortController();
      const sdpTimeout = setTimeout(() => sdpCtrl.abort(), FETCH_TIMEOUT_MS);
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
        signal: sdpCtrl.signal,
      });
      clearTimeout(sdpTimeout);

      if (!sdpRes.ok) {
        const errText = await sdpRes.text();
        throw new Error(`OpenAI Realtime call failed: ${errText}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      const refreshDelay = expires_at
        ? Math.max(expires_at * 1000 - Date.now() - REFRESH_BUFFER_MS, MIN_REFRESH_MS)
        : FALLBACK_REFRESH_MS;

      tokenRefreshTimerRef.current = setTimeout(async () => {
        if (autoReconnectCountRef.current >= MAX_AUTO_RECONNECTS) {
          disconnect();
          const info = normalizeVoiceError("Session expired.");
          setError(`${info.message} ${info.action}`);
          setIsConnected(false);
          optionsRef.current.onConnectionStateChange?.("failed");
          optionsRef.current.onError?.(new Error("Session expired"));
          return;
        }

        reconnectingRef.current = true;
        const existingStream = streamRef.current;
        streamRef.current = null;
        disconnect();

        try {
          await connect(existingStream ?? undefined);
          autoReconnectCountRef.current++;
          reconnectingRef.current = false;
        } catch (err) {
          reconnectingRef.current = false;
          if (existingStream) {
            existingStream.getTracks().forEach((t) => t.stop());
          }
          const info = normalizeVoiceError("Session expired.");
          setError(`${info.message} ${info.action}`);
          setIsConnected(false);
          optionsRef.current.onConnectionStateChange?.("failed");
          optionsRef.current.onError?.(
            err instanceof Error ? err : new Error("Session expired")
          );
        }
      }, refreshDelay);
    } catch (err) {
      if (stream && !preAcquiredStream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const raw = err instanceof Error ? err.message : "Connection failed";
      const category = classifyVoiceError(raw);
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[realtime] Connection failed", {
          category,
          message: raw,
          error: err,
        });
      }
      const info = normalizeVoiceError(raw);
      setError(`${info.message} ${info.action}`);
      setIsConnected(false);
      optionsRef.current.onConnectionStateChange?.("failed");
      optionsRef.current.onError?.(err instanceof Error ? err : new Error(raw));
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
