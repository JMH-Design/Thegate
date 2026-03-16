/**
 * Tests for voice connection token-refresh lifecycle.
 *
 * ORIGINAL BUG: TOKEN_REFRESH_MS was 45s — connection dropped every 45 seconds
 * even though the token was valid for 600s. User saw "Connection expired."
 *
 * FIX: Silent auto-reconnect ~60s before token expiry (at ~540s). Reuses the
 * existing mic stream so no permission prompt appears. After MAX_AUTO_RECONNECTS
 * (5) silent cycles, surfaces the error.
 *
 * Scenarios:
 *   1. REGRESSION: no error at 45s
 *   2. Silent reconnect at ~540s (based on expires_at)
 *   3. Mic stream reused during auto-reconnect
 *   4. Error after MAX_AUTO_RECONNECTS cycles
 *   5. Fallback timing when expires_at is missing
 *   6. Error surfaces when auto-reconnect fetch fails
 *   7. Integration: voice session stays listening across reconnect
 *   8. Integration: session survives mid-conversation reconnect
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRealtimeTranscription } from "../use-realtime-transcription";
import { useVoiceSession } from "../use-voice-session";

const TOKEN_EXPIRY_S = 600;
const REFRESH_BUFFER_MS = 60_000;
const EXPECTED_REFRESH_DELAY = TOKEN_EXPIRY_S * 1000 - REFRESH_BUFFER_MS; // 540_000
const MAX_AUTO_RECONNECTS = 5;
const MOCK_TOKEN = "mock-realtime-token";
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

function createRTCMock() {
  return vi.fn().mockImplementation(function (this: unknown) {
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
  });
}

function setupGlobalMocks(opts?: { omitExpiresAt?: boolean }) {
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    mediaDevices: {
      getUserMedia: vi.fn(() => Promise.resolve(createMockMediaStream())),
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("/api/voice/realtime-token")) {
        const payload: Record<string, unknown> = { token: MOCK_TOKEN };
        if (!opts?.omitExpiresAt) {
          payload.expires_at = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_S;
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(payload),
        } as Response);
      }
      if (typeof url === "string" && url.includes("api.openai.com/v1/realtime/calls")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(MOCK_SDP),
        } as Response);
      }
      if (typeof url === "string" && url.includes("/api/voice/tts")) {
        return Promise.resolve({
          ok: true,
          body: null,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
        } as unknown as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    })
  );

  vi.stubGlobal("RTCPeerConnection", createRTCMock());

  vi.stubGlobal(
    "AudioContext",
    vi.fn(function (this: unknown) {
      return createMockAudioContext();
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
  }
}

// ---------------------------------------------------------------------------
// useRealtimeTranscription — silent auto-reconnect
// ---------------------------------------------------------------------------

describe("Connection auto-reconnect — useRealtimeTranscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupGlobalMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("REGRESSION: no error at 45s (was the original bug)", async () => {
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
        onError,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("stays connected at 539s (1s before auto-reconnect)", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      vi.advanceTimersByTime(EXPECTED_REFRESH_DELAY - 1_000);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("silently reconnects at ~540s — no error, stays connected", async () => {
    const onConnectionStateChange = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
        onConnectionStateChange,
        onError,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);
    onConnectionStateChange.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(onConnectionStateChange).not.toHaveBeenCalledWith("failed");
    expect(onConnectionStateChange).toHaveBeenCalledWith("connected");
  });

  it("reuses mic stream during auto-reconnect (getUserMedia not called again)", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    const getUserMediaSpy = vi.mocked(navigator.mediaDevices.getUserMedia);
    expect(getUserMediaSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(true);
  });

  it("fetches a new token during auto-reconnect", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    const fetchSpy = vi.mocked(globalThis.fetch);
    const tokenCallsBefore = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes("/api/voice/realtime-token")
    ).length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    const tokenCallsAfter = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes("/api/voice/realtime-token")
    ).length;
    expect(tokenCallsAfter).toBe(tokenCallsBefore + 1);
  });

  it("errors after MAX_AUTO_RECONNECTS (5) silent cycles", async () => {
    const onError = vi.fn();
    const onConnectionStateChange = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
        onError,
        onConnectionStateChange,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    for (let i = 0; i < MAX_AUTO_RECONNECTS; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
      });
      expect(result.current.isConnected).toBe(true);
      expect(result.current.error).toBeNull();
    }

    // Next cycle: counter >= MAX_AUTO_RECONNECTS → error
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe(
      "Connection expired. Tap Reconnect to continue."
    );
    expect(onConnectionStateChange).toHaveBeenCalledWith("failed");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Session expired" })
    );
  });

  it("uses FALLBACK_REFRESH_MS when expires_at is missing", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupGlobalMocks({ omitExpiresAt: true });

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.isConnected).toBe(true);

    // Should NOT fire at 45s (old bug)
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();

    // Should auto-reconnect at FALLBACK_REFRESH_MS (540s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY - 45_000);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("surfaces error when auto-reconnect fetch fails", async () => {
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: vi.fn(),
        onError,
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    // Break the token endpoint for the reconnect attempt
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          text: () => Promise.resolve("Service unavailable"),
        } as Response)
      )
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useVoiceSession — integration: silent reconnect during coaching session
// ---------------------------------------------------------------------------

type MessageLike = {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
};

type SendMessageFn = (
  message: { text: string },
  options?: { body?: Record<string, unknown> }
) => void;

interface SessionProps {
  sendMessage: SendMessageFn;
  messages: MessageLike[];
  status: string;
  stop: () => void;
  chatBody: Record<string, unknown>;
  audioContextRef: { current: AudioContext | null };
  onConnectionStateChange?: (state: string) => void;
}

function makeProps(overrides: Partial<SessionProps> = {}): SessionProps {
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

describe("Connection auto-reconnect — useVoiceSession (integration)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setupGlobalMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("REGRESSION: no realtimeError at 45s", async () => {
    const props = makeProps();

    const { result } = renderHook(
      (p: SessionProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("listening");

    act(() => {
      vi.advanceTimersByTime(45_000);
    });

    expect(result.current.realtimeError).toBeNull();
    expect(result.current.state).toBe("listening");
  });

  it("stays listening across silent auto-reconnect at 540s", async () => {
    const onConnectionStateChange = vi.fn();
    const props = makeProps({ onConnectionStateChange });

    const { result } = renderHook(
      (p: SessionProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("listening");
    expect(result.current.realtimeError).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.state).toBe("listening");
    expect(result.current.realtimeError).toBeNull();
    expect(onConnectionStateChange).not.toHaveBeenCalledWith("failed");
  });

  it("session survives mid-conversation auto-reconnect", async () => {
    const props = makeProps();

    const { result, rerender } = renderHook(
      (p: SessionProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    // Coach responds mid-session
    act(() => {
      rerender(
        makeProps({
          ...props,
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: "What is quantum decoherence?" }],
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text:
                    "Got it — you want to be able to explain quantum decoherence fluently. " +
                    "Here's how I want to run this session.",
                },
              ],
            },
          ],
          status: "ready",
        })
      );
    });

    // Auto-reconnect fires during active session — should be invisible
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.realtimeError).toBeNull();
  });

  it("surfaces error after 5 auto-reconnect cycles", async () => {
    const onConnectionStateChange = vi.fn();
    const props = makeProps({ onConnectionStateChange });

    const { result } = renderHook(
      (p: SessionProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    // 5 silent reconnects — no error
    for (let i = 0; i < MAX_AUTO_RECONNECTS; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
      });
      expect(result.current.realtimeError).toBeNull();
    }

    // 6th cycle: error surfaces
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.realtimeError).toBe(
      "Connection expired. Tap Reconnect to continue."
    );
    expect(onConnectionStateChange).toHaveBeenCalledWith("failed");
  });

  it("manual reconnect() works after auto-reconnect limit is reached", async () => {
    const props = makeProps();

    const { result } = renderHook(
      (p: SessionProps) => useVoiceSession(p),
      { initialProps: props }
    );

    await act(async () => {
      await result.current.start();
    });

    // Exhaust auto-reconnect limit
    for (let i = 0; i < MAX_AUTO_RECONNECTS; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
      });
    }

    // 6th → error
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPECTED_REFRESH_DELAY);
    });

    expect(result.current.realtimeError).toContain("Connection expired");

    // User taps Reconnect — should still work
    await act(async () => {
      await result.current.reconnect();
    });

    expect(result.current.realtimeError).toBeNull();
    expect(result.current.state).toBe("listening");
  });
});
