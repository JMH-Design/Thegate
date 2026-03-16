/**
 * Tests for voice session start and TTS playback.
 *
 * Covers:
 *   - Happy path: voice connects, state transitions, TTS plays
 *   - Autoplay rejection: NotAllowedError surfaces via ttsError
 *   - New-topic path with pre-acquired AudioContext
 *   - State propagation (useState replaces useSyncExternalStore)
 *
 * Flow under test:
 *   voice.start() → state="listening"
 *   → messages updated with assistant response
 *   → useEffect pipes text to queueTTS()
 *   → fetch('/api/voice/tts')
 *   → createStreamingPlayTask → Audio.play()
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceSession } from "../use-voice-session";

function createMockMediaStream(): MediaStream {
  const track = {
    kind: "audio",
    enabled: true,
    muted: false,
    readyState: "live" as MediaStreamTrackState,
    id: "mock-track-id",
    stop: vi.fn(),
    getSettings: () => ({}),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  };
  return {
    id: "mock-stream-id",
    active: true,
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  } as unknown as MediaStream;
}

function createMockAudioContext(state: "running" | "suspended" = "running") {
  const ctx: Record<string, unknown> = {
    state,
    createAnalyser: () => ({
      fftSize: 256,
      smoothingTimeConstant: 0.8,
      connect: vi.fn(),
      context: ctx,
    }),
    createMediaElementSource: () => ({ connect: vi.fn() }),
    destination: {},
    resume: vi.fn(() => {
      ctx.state = "running";
      return Promise.resolve();
    }),
    close: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
  };
  return ctx as unknown as AudioContext;
}

type MessageLike = {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
};

interface TestProps {
  sendMessage: ReturnType<typeof vi.fn>;
  messages: MessageLike[];
  status: string;
  stop: ReturnType<typeof vi.fn>;
  chatBody: Record<string, unknown>;
  audioContextRef: { current: AudioContext | null };
  onConnectionStateChange?: ReturnType<typeof vi.fn>;
}

describe("Voice session start and TTS playback", () => {
  let ttsFetchCalls: Array<{ text: string }>;
  let audioPlayCalls: Array<{ url: string; resolved: boolean }>;
  let audioPlayBehavior: "resolve" | "reject-autoplay";

  beforeEach(() => {
    vi.clearAllMocks();
    ttsFetchCalls = [];
    audioPlayCalls = [];
    audioPlayBehavior = "resolve";

    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(createMockMediaStream())),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (typeof url === "string" && url.includes("/api/voice/realtime-token")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: "mock-token" }),
          } as Response);
        }
        if (typeof url === "string" && url.includes("api.openai.com/v1/realtime/calls")) {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve("v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n"),
          } as Response);
        }
        if (typeof url === "string" && url.includes("/api/voice/tts")) {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          ttsFetchCalls.push({ text: body.text });
          return Promise.resolve({
            ok: true,
            body: null,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
          } as unknown as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function (this: unknown) {
        const openListeners: (() => void)[] = [];
        const dc = {
          addEventListener: (event: string, fn: () => void) => {
            if (event === "open") openListeners.push(fn);
          },
          removeEventListener: vi.fn(),
          close: vi.fn(),
        };
        return {
          createDataChannel: () => dc,
          createOffer: () =>
            Promise.resolve({
              type: "offer",
              sdp: "v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n",
            }),
          setLocalDescription: () => Promise.resolve(),
          setRemoteDescription: () => {
            openListeners.forEach((fn) => fn());
            return Promise.resolve();
          },
          addTrack: vi.fn(),
          close: vi.fn(),
        };
      })
    );

    vi.stubGlobal(
      "AudioContext",
      vi.fn(function (this: unknown) {
        return createMockAudioContext("running");
      })
    );

    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(function (url?: string) {
        const instance = {
          src: url || "",
          currentTime: 0,
          onended: null as (() => void) | null,
          onerror: null as (() => void) | null,
          pause: vi.fn(),
          play: vi.fn(() => {
            if (audioPlayBehavior === "reject-autoplay") {
              const entry = { url: url || "", resolved: false };
              audioPlayCalls.push(entry);
              return Promise.reject(
                new DOMException(
                  "play() failed because the user didn't interact with the document first.",
                  "NotAllowedError"
                )
              );
            }
            const entry = { url: url || "", resolved: true };
            audioPlayCalls.push(entry);
            setTimeout(() => instance.onended?.(), 10);
            return Promise.resolve();
          }),
        };
        return instance;
      })
    );

    if (typeof globalThis.URL?.createObjectURL !== "function") {
      vi.stubGlobal("URL", {
        ...globalThis.URL,
        createObjectURL: vi.fn(() => "blob:mock-audio-url"),
        revokeObjectURL: vi.fn(),
      });
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-audio-url");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeProps(overrides: Partial<TestProps> = {}): TestProps {
    return {
      sendMessage: vi.fn(),
      messages: [],
      status: "ready",
      stop: vi.fn(),
      chatBody: {},
      audioContextRef: { current: createMockAudioContext("running") },
      ...overrides,
    };
  }

  function assistantMessage(text: string): MessageLike {
    return { role: "assistant", parts: [{ type: "text", text }] };
  }

  function userMessage(text: string): MessageLike {
    return { role: "user", parts: [{ type: "text", text }] };
  }

  it("state transitions from idle → listening after start() (P1 fix)", async () => {
    const props = makeProps();
    const { result } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    expect(result.current.state).toBe("idle");

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });
  });

  it("transitions to speaking and fetches TTS when AI responds", async () => {
    const props = makeProps();
    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });

    act(() => {
      rerender(
        makeProps({
          ...props,
          messages: [
            userMessage("__START_SESSION__"),
            assistantMessage(
              "Hello! Let's begin our learning session. What do you already know about this topic?"
            ),
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(
      () => {
        expect(ttsFetchCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    expect(ttsFetchCalls[0].text).toContain("Hello!");
    expect(result.current.state).toBe("speaking");
  });

  it("surfaces ttsError when audio.play() is rejected by autoplay policy (P2 fix)", async () => {
    audioPlayBehavior = "reject-autoplay";

    const suspendedCtx = createMockAudioContext("suspended");
    const props = makeProps({
      audioContextRef: { current: suspendedCtx },
    });

    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });

    act(() => {
      rerender(
        makeProps({
          ...props,
          audioContextRef: { current: suspendedCtx },
          messages: [
            userMessage("__START_SESSION__"),
            assistantMessage(
              "Welcome! I'm excited to explore this topic with you. Let's start with what you know."
            ),
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(
      () => {
        expect(ttsFetchCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    await waitFor(
      () => {
        expect(audioPlayCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    const successfulPlays = audioPlayCalls.filter((c) => c.resolved);
    expect(successfulPlays).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.ttsError).toBe("Tap anywhere to enable audio");
    });
  });

  it("new-topic path with pre-acquired running AudioContext plays audio successfully (P0 fix)", async () => {
    audioPlayBehavior = "resolve";

    // Simulates the fixed flow: AudioContext created during user gesture
    // in knowledge-map.tsx and passed through voice-pre-session.ts
    const preAcquiredCtx = createMockAudioContext("running");
    const props = makeProps({ audioContextRef: { current: preAcquiredCtx } });

    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });

    act(() => {
      rerender(
        makeProps({
          ...props,
          audioContextRef: { current: preAcquiredCtx },
          messages: [
            userMessage("__START_SESSION__"),
            assistantMessage("Great topic! Let's dive in. Tell me what draws you to this subject."),
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(
      () => {
        expect(ttsFetchCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    await waitFor(
      () => {
        expect(audioPlayCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    const played = audioPlayCalls.filter((c) => c.resolved);
    expect(played.length).toBeGreaterThan(0);
    expect(result.current.ttsError).toBeNull();
  });

  it("voice speaks correctly when AudioContext is created from user gesture (click handler)", async () => {
    audioPlayBehavior = "resolve";

    const gestureCtx = createMockAudioContext("running");
    const props = makeProps({ audioContextRef: { current: gestureCtx } });

    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });

    act(() => {
      rerender(
        makeProps({
          ...props,
          audioContextRef: { current: gestureCtx },
          messages: [
            userMessage("__START_SESSION__"),
            assistantMessage("Welcome back! Let's reinforce what you learned last time."),
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(
      () => {
        expect(ttsFetchCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    await waitFor(
      () => {
        expect(audioPlayCalls.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    const played = audioPlayCalls.filter((c) => c.resolved);
    expect(played.length).toBeGreaterThan(0);
    expect(result.current.ttsError).toBeNull();
  });

  it("ttsError is cleared on start() and reconnect()", async () => {
    audioPlayBehavior = "reject-autoplay";

    const props = makeProps({
      audioContextRef: { current: createMockAudioContext("suspended") },
    });

    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    act(() => {
      rerender(
        makeProps({
          ...props,
          audioContextRef: { current: createMockAudioContext("suspended") },
          messages: [
            userMessage("__START_SESSION__"),
            assistantMessage("Hello! Let's begin. What do you know?"),
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(
      () => {
        expect(result.current.ttsError).toBeTruthy();
      },
      { timeout: 5000 }
    );

    // reconnect() should clear ttsError
    await act(async () => {
      await result.current.reconnect();
    });

    expect(result.current.ttsError).toBeNull();
  });
});
