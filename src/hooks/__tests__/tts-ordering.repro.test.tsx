/**
 * Verify TTS phrase ordering: slot-based queue ensures correct playback order.
 *
 * queueTTS reserves a slot in the queue BEFORE awaiting fetch, so the queue
 * order matches call order regardless of which fetch resolves first.
 * playQueue waits for each slot to become ready before playing it.
 *
 * These tests resolve TTS fetches OUT OF ORDER and assert that playback
 * still happens in the original call order.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceSession } from "../use-voice-session";

const MOCK_TOKEN = "mock-token";
const MOCK_SDP = "v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n";

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

function createMockAudioContext() {
  const ctx: Record<string, unknown> = {
    state: "running",
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

type SendMessageFn = (
  message: { text: string },
  options?: { body?: Record<string, unknown> }
) => void;

interface TestProps {
  sendMessage: SendMessageFn;
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>;
  status: string;
  stop: () => void;
  chatBody: Record<string, unknown>;
  audioContextRef: { current: AudioContext | null };
}

function makeProps(overrides: Partial<TestProps> = {}): TestProps {
  return {
    sendMessage: vi.fn<SendMessageFn>(),
    messages: [],
    status: "ready",
    stop: vi.fn(),
    chatBody: {},
    audioContextRef: { current: createMockAudioContext() },
    ...overrides,
  };
}

describe("TTS phrase ordering bug", () => {
  let ttsCallOrder: string[];
  let ttsDeferreds: Array<{ text: string; resolve: () => void }>;
  let audioPlayCount: number;
  let playOrder: string[];

  function makeTtsResponse(label: string) {
    return {
      ok: true,
      body: null,
      arrayBuffer: () => {
        playOrder.push(label);
        return Promise.resolve(new ArrayBuffer(1024));
      },
    } as unknown as Response;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    ttsCallOrder = [];
    ttsDeferreds = [];
    audioPlayCount = 0;
    playOrder = [];

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
            json: () =>
              Promise.resolve({
                token: MOCK_TOKEN,
                expires_at: Math.floor(Date.now() / 1000) + 600,
              }),
          } as Response);
        }
        if (typeof url === "string" && url.includes("api.openai.com/v1/realtime/calls")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(MOCK_SDP),
          } as Response);
        }
        if (typeof url === "string" && url.includes("/api/voice/tts")) {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          ttsCallOrder.push(body.text);
          return new Promise<Response>((resolve) => {
            ttsDeferreds.push({
              text: body.text,
              resolve: () => resolve(makeTtsResponse(body.text)),
            });
          });
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
          createOffer: () => Promise.resolve({ type: "offer", sdp: MOCK_SDP }),
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
        return createMockAudioContext();
      })
    );

    vi.stubGlobal(
      "Audio",
      vi.fn().mockImplementation(function () {
        const instance = {
          src: "",
          currentTime: 0,
          onended: null as (() => void) | null,
          onerror: null as (() => void) | null,
          pause: vi.fn(),
          play: vi.fn(() => {
            audioPlayCount++;
            setTimeout(() => instance.onended?.(), 5);
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
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays phrases in call order even when fetches resolve out of order", async () => {
    const props = makeProps();

    const { result, rerender } = renderHook(
      (p: TestProps) => useVoiceSession(p),
      { initialProps: props }
    );

    // Connect
    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("listening");
    });

    // Stream a response with 3 phrase boundaries.
    // The useEffect regex splits at ". " and fires 3 concurrent queueTTS calls.
    act(() => {
      rerender(
        makeProps({
          ...props,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "__START_SESSION__" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "First sentence. Second sentence. Third sentence. ",
                },
              ],
            },
          ],
          status: "streaming",
        })
      );
    });

    // All 3 TTS fetches should be initiated concurrently
    await waitFor(() => {
      expect(ttsDeferreds).toHaveLength(3);
    });

    // Verify calls were made in text order
    expect(ttsCallOrder).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);

    // Resolve fetches OUT OF ORDER: 2nd, 3rd, 1st
    // (simulates network jitter — the 2nd phrase's TTS response arrives first)
    await act(async () => {
      ttsDeferreds[1].resolve(); // "Second sentence." resolves first
      ttsDeferreds[2].resolve(); // "Third sentence." resolves second
      ttsDeferreds[0].resolve(); // "First sentence." resolves third
      await new Promise((r) => setTimeout(r, 100));
    });

    await waitFor(() => {
      expect(audioPlayCount).toBe(3);
    });

    // Playback order matches call order, not resolve order
    expect(playOrder).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);
    expect(playOrder).toEqual(ttsCallOrder);
  });

  it("with 5 phrases and realistic jitter, playback still follows call order", async () => {
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

    // 5-phrase response — simulates a typical coach greeting
    act(() => {
      rerender(
        makeProps({
          ...props,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "__START_SESSION__" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text:
                    "Got it. " +
                    "You want to explain quantum decoherence fluently. " +
                    "I'll hold that as our target. " +
                    "Let's build toward it. " +
                    "Here's how I want to run this session. ",
                },
              ],
            },
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(() => {
      expect(ttsDeferreds).toHaveLength(5);
    });

    expect(ttsCallOrder).toEqual([
      "Got it.",
      "You want to explain quantum decoherence fluently.",
      "I'll hold that as our target.",
      "Let's build toward it.",
      "Here's how I want to run this session.",
    ]);

    // Realistic jitter: phrases 3 and 5 resolve before phrase 1
    // (shorter phrases often synthesize faster)
    await act(async () => {
      ttsDeferreds[2].resolve(); // "I'll hold that..."
      ttsDeferreds[4].resolve(); // "Here's how I want..."
      ttsDeferreds[0].resolve(); // "Got it."
      ttsDeferreds[1].resolve(); // "You want to explain..."
      ttsDeferreds[3].resolve(); // "Let's build toward it."
      await new Promise((r) => setTimeout(r, 100));
    });

    await waitFor(() => {
      expect(audioPlayCount).toBe(5);
    });

    expect(playOrder).toEqual(ttsCallOrder);
  });

  it("adjacent pair stays in order even when second phrase resolves first", async () => {
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

    // Just 2 phrases — even a pair can swap
    act(() => {
      rerender(
        makeProps({
          ...props,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "__START_SESSION__" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "Welcome back! Let me check your progress. ",
                },
              ],
            },
          ],
          status: "streaming",
        })
      );
    });

    await waitFor(() => {
      expect(ttsDeferreds).toHaveLength(2);
    });

    expect(ttsCallOrder).toEqual([
      "Welcome back!",
      "Let me check your progress.",
    ]);

    // Second phrase resolves before first (shorter text → faster synthesis)
    await act(async () => {
      ttsDeferreds[1].resolve(); // "Let me check your progress."
      ttsDeferreds[0].resolve(); // "Welcome back!"
      await new Promise((r) => setTimeout(r, 100));
    });

    await waitFor(() => {
      expect(audioPlayCount).toBe(2);
    });

    expect(playOrder).toEqual(["Welcome back!", "Let me check your progress."]);
    expect(playOrder).toEqual(ttsCallOrder);
  });
});
