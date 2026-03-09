"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRealtimeTranscription } from "./use-realtime-transcription";
import { normalizeVoiceError } from "@/lib/voice-errors";
import { useVadWhisperTranscription } from "./use-vad-whisper-transcription";

export type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

interface UseVoiceSessionOptions {
  sendMessage: (
    message: { text: string },
    options?: { body?: Record<string, unknown> }
  ) => void;
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }>;
  status: string;
  stop: () => void;
  chatBody: Record<string, unknown>;
  /** Pre-created AudioContext from user gesture (required for autoplay policy) */
  audioContextRef?: { current: AudioContext | null };
  /** Pre-acquired mic stream (e.g. from new-topic form submit); consumed on first start */
  preAcquiredStreamRef?: React.MutableRefObject<MediaStream | null | undefined>;
}

export function useVoiceSession(options: UseVoiceSessionOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [activeTranscriber, setActiveTranscriber] = useState<
    "realtime" | "fallback" | null
  >(null);

  const stateRef = useRef<VoiceState>("idle");
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Array<() => Promise<void>>>([]);
  const playingRef = useRef(false);
  const abortCtrlsRef = useRef<AbortController[]>([]);
  const sentLenRef = useRef(0);
  const bufRef = useRef("");
  const startedRef = useRef(false);
  const activeTranscriberRef = useRef<"realtime" | "fallback" | null>(null);

  const setStateSync = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setVoiceState(s);
  }, []);

  const ensureAudioCtx = useCallback(() => {
    const externalCtx = optionsRef.current.audioContextRef?.current;
    let ctx = externalCtx ?? audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = externalCtx || new AudioContext();
      if (!externalCtx) audioCtxRef.current = ctx;
    }
    if (!analyserRef.current || analyserRef.current.context !== ctx) {
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      node.connect(ctx.destination);
      analyserRef.current = node;
      setAnalyserNode(node);
    }
    return { ctx, analyser: analyserRef.current! };
  }, []);

  const interrupt = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
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
    abortCtrlsRef.current.forEach((c) => c.abort());
    abortCtrlsRef.current = [];
    sentLenRef.current = 0;
    bufRef.current = "";
    optionsRef.current.stop();
  }, []);

  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;

    while (queueRef.current.length > 0) {
      if (pausedRef.current) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }

      const playTask = queueRef.current.shift()!;
      try {
        await playTask();
      } catch {
        /* playback error — skip chunk */
      }
    }

    playingRef.current = false;
  }, []);

  const createStreamingPlayTask = useCallback(
    (res: Response, ctrl: AbortController) => async () => {
      const { ctx, analyser } = ensureAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();

      if (
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported("audio/mpeg") &&
        res.body
      ) {
        const mediaSource = new MediaSource();
        const url = URL.createObjectURL(mediaSource);
        const audio = new Audio(url);
        audioElementRef.current = audio;
        const mediaElementSource = ctx.createMediaElementSource(audio);
        mediaElementSource.connect(analyser);

        await new Promise<void>((resolve, reject) => {
          mediaSource.addEventListener(
            "sourceopen",
            async () => {
              try {
                const sb = mediaSource.addSourceBuffer("audio/mpeg");
                const reader = res.body!.getReader();
                let appendQueue: Uint8Array[] = [];
                let appending = false;
                let doneReading = false;

                const tryEndOfStream = () => {
                  if (doneReading && appendQueue.length === 0 && !appending) {
                    mediaSource.endOfStream();
                  }
                };

                const doAppend = () => {
                  if (appending || appendQueue.length === 0) return;
                  appending = true;
                  const chunks = appendQueue.splice(0);
                  const totalLen = chunks.reduce((a, c) => a + c.length, 0);
                  const combined = new Uint8Array(totalLen);
                  let offset = 0;
                  for (const c of chunks) {
                    combined.set(c, offset);
                    offset += c.length;
                  }
                  sb.appendBuffer(combined);
                };

                sb.addEventListener("updateend", () => {
                  appending = false;
                  if (appendQueue.length > 0) doAppend();
                  tryEndOfStream();
                });

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    doneReading = true;
                    break;
                  }
                  if (ctrl.signal.aborted) {
                    reader.cancel();
                    reject(new DOMException("Aborted", "AbortError"));
                    return;
                  }
                  appendQueue.push(value);
                  doAppend();
                }
                tryEndOfStream();
              } catch (e) {
                reject(e);
              }
            },
            { once: true }
          );

          audio.onended = () => {
            audioElementRef.current = null;
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            audioElementRef.current = null;
            URL.revokeObjectURL(url);
            reject();
          };
          audio.play().catch(reject);
        });
      } else {
        const data = await res.arrayBuffer();
        const blob = new Blob([data], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElementRef.current = audio;
        const mediaElementSource = ctx.createMediaElementSource(audio);
        mediaElementSource.connect(analyser);

        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            audioElementRef.current = null;
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => {
            audioElementRef.current = null;
            URL.revokeObjectURL(url);
            reject();
          };
          audio.play().catch(reject);
        });
      }
    },
    [ensureAudioCtx]
  );

  const queueTTS = useCallback(
    async (text: string) => {
      const ctrl = new AbortController();
      abortCtrlsRef.current.push(ctrl);
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const playTask = createStreamingPlayTask(res, ctrl);
        queueRef.current.push(playTask);
        playQueue();
      } catch {
        /* aborted or network error */
      }
    },
    [playQueue, createStreamingPlayTask]
  );

  const realtime = useRealtimeTranscription({
    onTranscriptComplete: (transcript) => {
      setCurrentTranscript(transcript);
      setStateSync("thinking");
      sentLenRef.current = 0;
      bufRef.current = "";
      optionsRef.current.sendMessage(
        { text: transcript },
        { body: optionsRef.current.chatBody }
      );
    },
    onSpeechStart: () => {
      if (
        stateRef.current === "speaking" ||
        stateRef.current === "thinking"
      ) {
        interrupt();
      }
    },
    onError: (err) => {
      const info = normalizeVoiceError(err);
      setRealtimeError(`${info.message} ${info.action}`);
    },
  });

  const fallback = useVadWhisperTranscription({
    onTranscriptComplete: (transcript) => {
      setCurrentTranscript(transcript);
      setStateSync("thinking");
      sentLenRef.current = 0;
      bufRef.current = "";
      optionsRef.current.sendMessage(
        { text: transcript },
        { body: optionsRef.current.chatBody }
      );
    },
    onSpeechStart: () => {
      if (
        stateRef.current === "speaking" ||
        stateRef.current === "thinking"
      ) {
        interrupt();
      }
    },
    onError: (err) => {
      const info = normalizeVoiceError(err);
      setRealtimeError(`${info.message} ${info.action}`);
    },
  });

  const activePartial = realtime.isConnected
    ? realtime.partialTranscript
    : fallback.isConnected
      ? fallback.partialTranscript
      : "";
  const displayTranscript =
    voiceState === "listening" && activePartial ? activePartial : currentTranscript;

  // Watch streaming text from the assistant and pipe to TTS
  useEffect(() => {
    const s = stateRef.current;
    if (s === "transcribing") return;

    const msgs = optionsRef.current.messages;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") return;

    const full =
      last.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("") || "";

    if (full.length <= sentLenRef.current) return;

    bufRef.current += full.slice(sentLenRef.current);
    sentLenRef.current = full.length;
    setCurrentTranscript(full);

    if (s !== "speaking") setStateSync("speaking");

    const re = /([.!?])\s+|,\s+|;\s+|\s+—\s+/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = re.exec(bufRef.current)) !== null) {
      const phrase = bufRef.current.slice(idx, match.index + match[0].length);
      if (phrase.trim()) queueTTS(phrase.trim());
      idx = match.index + match[0].length;
    }
    bufRef.current = bufRef.current.slice(idx);
  }, [options.messages, queueTTS, setStateSync]);

  // When the Claude stream finishes, flush remaining buffer and transition
  useEffect(() => {
    if (options.status !== "ready") return;
    const s = stateRef.current;
    if (s === "transcribing") return;
    if (!bufRef.current.trim() && !playingRef.current && queueRef.current.length === 0) return;

    if (bufRef.current.trim()) {
      queueTTS(bufRef.current.trim());
      bufRef.current = "";
    }

    const id = setInterval(() => {
      if (!playingRef.current && queueRef.current.length === 0) {
        clearInterval(id);
        setStateSync(mutedRef.current ? "idle" : "listening");
      }
    }, 200);

    return () => clearInterval(id);
  }, [options.status, queueTTS, setStateSync]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    ensureAudioCtx();
    setRealtimeError(null);

    const preStream =
      optionsRef.current.preAcquiredStreamRef?.current ?? undefined;
    if (preStream) {
      optionsRef.current.preAcquiredStreamRef!.current = null;
    }

    try {
      await realtime.connect(preStream ?? undefined);
      activeTranscriberRef.current = "realtime";
      setActiveTranscriber("realtime");
      setStateSync("listening");
    } catch (err) {
      console.warn("Realtime failed, trying VAD+Whisper fallback:", err);
      const realtimeInfo = normalizeVoiceError(
        err instanceof Error ? err : "Realtime failed"
      );
      setRealtimeError(`${realtimeInfo.message} ${realtimeInfo.action}`);
      try {
        await fallback.connect(preStream ?? undefined);
        activeTranscriberRef.current = "fallback";
        setActiveTranscriber("fallback");
        setRealtimeError(null);
        setStateSync("listening");
      } catch (fallbackErr) {
        console.error("Fallback transcription failed:", fallbackErr);
        const fallbackInfo = normalizeVoiceError(
          fallbackErr instanceof Error ? fallbackErr : "Voice failed"
        );
        setRealtimeError(`${fallbackInfo.message} ${fallbackInfo.action}`);
        startedRef.current = false;
        setStateSync("idle");
        throw fallbackErr;
      }
    }
  }, [ensureAudioCtx, realtime, fallback, setStateSync]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    if (next) {
      realtime.disconnect();
      fallback.disconnect();
    } else if (startedRef.current) {
      const active = activeTranscriberRef.current;
      setStateSync("listening");
      if (active === "fallback") {
        fallback.connect(undefined);
      } else {
        realtime.connect(undefined);
      }
    }
  }, [realtime, fallback, setStateSync]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setIsPaused(next);

    if (next) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* already stopped */
        }
        sourceRef.current = null;
      }
      audioCtxRef.current?.suspend();
    } else {
      audioCtxRef.current?.resume();
      playQueue();
    }
  }, [playQueue]);

  const reconnect = useCallback(async () => {
    setRealtimeError(null);
    ensureAudioCtx();

    const tryConnect = async () => {
      const active = activeTranscriberRef.current;
      if (active === "realtime") {
        try {
          await realtime.connect(undefined);
          setActiveTranscriber("realtime");
          setStateSync("listening");
          return;
        } catch (err) {
          console.warn("Realtime reconnect failed, trying fallback:", err);
          try {
            await fallback.connect(undefined);
            activeTranscriberRef.current = "fallback";
            setActiveTranscriber("fallback");
            setStateSync("listening");
            return;
          } catch (fallbackErr) {
            const info = normalizeVoiceError(
              fallbackErr instanceof Error ? fallbackErr : "Voice failed"
            );
            setRealtimeError(`${info.message} ${info.action}`);
          }
        }
      } else if (active === "fallback") {
        try {
          await fallback.connect(undefined);
          setStateSync("listening");
          return;
        } catch (err) {
          console.warn("Fallback reconnect failed, trying realtime:", err);
          try {
            await realtime.connect(undefined);
            activeTranscriberRef.current = "realtime";
            setActiveTranscriber("realtime");
            setStateSync("listening");
            return;
          } catch (realtimeErr) {
            const info = normalizeVoiceError(
              realtimeErr instanceof Error ? realtimeErr : "Voice failed"
            );
            setRealtimeError(`${info.message} ${info.action}`);
          }
        }
      } else {
        startedRef.current = false;
        await start();
      }
    };

    await tryConnect();
  }, [ensureAudioCtx, realtime, fallback, start, setStateSync]);

  const cleanup = useCallback(() => {
    interrupt();
    realtime.disconnect();
    fallback.disconnect();
    activeTranscriberRef.current = null;
    setActiveTranscriber(null);
    const externalCtx = optionsRef.current.audioContextRef?.current;
    if (audioCtxRef.current && audioCtxRef.current !== externalCtx) {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAnalyserNode(null);
    startedRef.current = false;
    setStateSync("idle");
  }, [interrupt, realtime, fallback, setStateSync]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    state: voiceState,
    analyser: analyserNode,
    currentTranscript: displayTranscript,
    isMuted,
    isPaused,
    toggleMute,
    togglePause,
    start,
    reconnect,
    cleanup,
    realtimeError,
    activeTranscriber,
  };
}
