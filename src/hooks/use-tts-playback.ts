"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseTTSPlaybackReturn {
  isPlaying: boolean;
  isPaused: boolean;
  play: (text: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stopPlayback: () => void;
}

export function useTTSPlayback(): UseTTSPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const ensureCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    }
    queueRef.current = [];
    playingRef.current = false;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;

    const ctx = ensureCtx();

    while (queueRef.current.length > 0) {
      const data = queueRef.current.shift()!;
      if (ctx.state === "suspended") await ctx.resume();

      try {
        const buf = await ctx.decodeAudioData(data);
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          sourceRef.current = src;
          src.onended = () => {
            sourceRef.current = null;
            resolve();
          };
          src.start();
        });
      } catch {
        /* skip bad chunk */
      }
    }

    playingRef.current = false;
    setIsPlaying(false);
  }, [ensureCtx]);

  const play = useCallback(
    async (text: string) => {
      stopPlayback();
      setIsPlaying(true);

      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      for (const sentence of sentences) {
        if (ctrl.signal.aborted) break;
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        try {
          const res = await fetch("/api/voice/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: trimmed }),
            signal: ctrl.signal,
          });
          if (!res.ok) continue;
          const data = await res.arrayBuffer();
          queueRef.current.push(data);
          playQueue();
        } catch {
          break;
        }
      }
    },
    [stopPlayback, playQueue]
  );

  const pause = useCallback(() => {
    audioCtxRef.current?.suspend();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    audioCtxRef.current?.resume();
    setIsPaused(false);
  }, []);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  return { isPlaying, isPaused, play, pause, resume, stopPlayback };
}
