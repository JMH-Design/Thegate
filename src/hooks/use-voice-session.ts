"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
}

export function useVoiceSession(options: UseVoiceSessionOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");

  const stateRef = useRef<VoiceState>("idle");
  const mutedRef = useRef(false);
  const pausedRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadRef = useRef<{
    start: () => Promise<void>;
    pause: () => Promise<void>;
    destroy: () => Promise<void>;
  } | null>(null);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);
  const abortCtrlsRef = useRef<AbortController[]>([]);
  const sentLenRef = useRef(0);
  const bufRef = useRef("");
  const startedRef = useRef(false);

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

  const toWav = useCallback(
    (samples: Float32Array, sampleRate = 16000): Blob => {
      const len = samples.length;
      const buffer = new ArrayBuffer(44 + len * 2);
      const dv = new DataView(buffer);
      const ws = (off: number, s: string) => {
        for (let i = 0; i < s.length; i++)
          dv.setUint8(off + i, s.charCodeAt(i));
      };

      ws(0, "RIFF");
      dv.setUint32(4, 36 + len * 2, true);
      ws(8, "WAVE");
      ws(12, "fmt ");
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, sampleRate, true);
      dv.setUint32(28, sampleRate * 2, true);
      dv.setUint16(32, 2, true);
      dv.setUint16(34, 16, true);
      ws(36, "data");
      dv.setUint32(40, len * 2, true);

      for (let i = 0; i < len; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]));
        dv.setInt16(
          44 + i * 2,
          clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
          true
        );
      }
      return new Blob([buffer], { type: "audio/wav" });
    },
    []
  );

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

      const data = queueRef.current.shift()!;
      const { ctx, analyser } = ensureAudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      try {
        const blob = new Blob([data], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElementRef.current = audio;

        const mediaSource = ctx.createMediaElementSource(audio);
        mediaSource.connect(analyser);

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
      } catch {
        /* playback error — skip chunk */
      }
    }

    playingRef.current = false;
  }, [ensureAudioCtx]);

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
        const data = await res.arrayBuffer();
        queueRef.current.push(data);
        playQueue();
      } catch {
        /* aborted or network error */
      }
    },
    [playQueue]
  );

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

    const re = /([.!?])\s+/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    while ((match = re.exec(bufRef.current)) !== null) {
      const sentence = bufRef.current.slice(idx, match.index + match[1].length);
      if (sentence.trim()) queueTTS(sentence.trim());
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

    try {
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vad = await MicVAD.new({
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/vad/",
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }),
        positiveSpeechThreshold: 0.92,
        negativeSpeechThreshold: 0.35,
        minSpeechMs: 400,
        preSpeechPadMs: 300,
        redemptionMs: 800,

        onSpeechStart: () => {
          if (mutedRef.current || pausedRef.current) return;
          if (
            stateRef.current === "speaking" ||
            stateRef.current === "thinking"
          ) {
            interrupt();
          }
          setStateSync("listening");
          setCurrentTranscript("");
        },

        onSpeechRealStart: () => {
          if (mutedRef.current || pausedRef.current) return;
        },

        onSpeechEnd: async (audio: Float32Array) => {
          if (mutedRef.current || pausedRef.current) return;
          setStateSync("transcribing");

          try {
            const blob = toWav(audio);
            const fd = new FormData();
            fd.append("audio", blob, "speech.wav");
            const res = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: fd,
            });

            if (!res.ok) {
              setStateSync("listening");
              return;
            }

            const { text } = await res.json();
            if (!text?.trim()) {
              setStateSync("listening");
              return;
            }

            setCurrentTranscript(text);
            setStateSync("thinking");
            sentLenRef.current = 0;
            bufRef.current = "";

            optionsRef.current.sendMessage(
              { text },
              { body: optionsRef.current.chatBody }
            );
          } catch {
            setStateSync("listening");
          }
        },
      });

      vadRef.current = vad;
      vad.start();
      setStateSync("listening");
    } catch (err) {
      console.error("VAD initialization failed:", err);
      startedRef.current = false;
      setStateSync("idle");
    }
  }, [ensureAudioCtx, interrupt, setStateSync, toWav]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    if (vadRef.current) {
      next ? vadRef.current.pause() : vadRef.current.start();
    }
  }, []);

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
      if (vadRef.current) vadRef.current.pause();
    } else {
      audioCtxRef.current?.resume();
      if (!mutedRef.current && vadRef.current) vadRef.current.start();
      playQueue();
    }
  }, [playQueue]);

  const cleanup = useCallback(() => {
    interrupt();
    if (vadRef.current) {
      vadRef.current.destroy();
      vadRef.current = null;
    }
    const externalCtx = optionsRef.current.audioContextRef?.current;
    if (audioCtxRef.current && audioCtxRef.current !== externalCtx) {
      audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAnalyserNode(null);
    startedRef.current = false;
    setStateSync("idle");
  }, [interrupt, setStateSync]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    state: voiceState,
    analyser: analyserNode,
    currentTranscript,
    isMuted,
    isPaused,
    toggleMute,
    togglePause,
    start,
    cleanup,
  };
}
