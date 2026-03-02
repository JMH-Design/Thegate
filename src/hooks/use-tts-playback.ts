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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    queueRef.current = [];
    playingRef.current = false;
    pausedRef.current = false;
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

    while (queueRef.current.length > 0) {
      if (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const data = queueRef.current.shift()!;
      try {
        const blob = new Blob([data], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            audioRef.current = null;
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            audioRef.current = null;
            URL.revokeObjectURL(url);
            reject();
          };
          audio.play().catch(reject);
        });
      } catch {
        /* skip bad chunk */
      }
    }

    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (text: string) => {
      stopPlayback();
      pausedRef.current = false;
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
    pausedRef.current = true;
    if (audioRef.current) audioRef.current.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    if (audioRef.current) audioRef.current.play();
    setIsPaused(false);
  }, []);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  return { isPlaying, isPaused, play, pause, resume, stopPlayback };
}
