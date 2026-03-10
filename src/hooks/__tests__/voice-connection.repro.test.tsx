/**
 * Reproduction test for the voice connection bug:
 * "Voice never connects and always says Connecting..."
 *
 * PRECISE ERROR (confirmed by tests):
 * voice.start() RESOLVES successfully (realtime.connect() completes) but the
 * voice state NEVER updates from "idle" to "listening". setStateSync("listening")
 * either isn't called or the state update doesn't propagate to the hook's return.
 *
 * Test structure:
 * 1. Integration: voice.start() should transition state (fails - reproduces bug)
 * 2. PRECISE ERROR: documents the exact failure mode
 * 3. Realtime isolate: useRealtimeTranscription.connect() works in isolation
 * 4. Step-by-step: each step (getUserMedia, token, OpenAI, RTCPeerConnection) works
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVoiceSession } from "../use-voice-session";
import { useRealtimeTranscription } from "../use-realtime-transcription";

const MOCK_TOKEN = "mock-realtime-token";
const MOCK_SDP_ANSWER = "v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n";

function createMockMediaStream(): MediaStream {
  const track = {
    kind: "audio",
    enabled: true,
    muted: false,
    readyState: "live" as MediaStreamTrackState,
    id: "mock-track-id",
    stop: vi.fn(),
    getSettings: () => ({}),
    clone: () => createMockMediaStream().getTracks()[0],
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

function createMockDataChannel() {
  const listeners: Record<string, () => void> = {};
  return {
    addEventListener: (event: string, fn: () => void) => {
      listeners[event] = fn;
    },
    removeEventListener: vi.fn(),
    close: vi.fn(),
    _open: () => listeners["open"]?.(),
  };
}

describe("Voice connection bug reproduction", () => {
  const mockSendMessage = vi.fn();
  const mockStop = vi.fn();

  let defaultOptions: Parameters<typeof useVoiceSession>[0];

  beforeEach(() => {
    vi.clearAllMocks();

    defaultOptions = {
      sendMessage: mockSendMessage,
      messages: [],
      status: "ready",
      stop: mockStop,
      chatBody: {},
    };

    // Mock fetch
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/voice/realtime-token")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: MOCK_TOKEN }),
          } as Response);
        }
        if (url.includes("api.openai.com/v1/realtime/calls")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(MOCK_SDP_ANSWER),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    // Mock getUserMedia
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(createMockMediaStream())),
      },
    });

    // Mock RTCPeerConnection - must be a constructor (use function, not arrow)
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function (this: unknown) {
        const dc = createMockDataChannel();
        return {
          createOffer: () =>
            Promise.resolve({
              type: "offer",
              sdp: "v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n",
            }),
          setLocalDescription: () => Promise.resolve(),
          setRemoteDescription: () => {
            setTimeout(() => dc._open(), 0);
            return Promise.resolve();
          },
          createDataChannel: () => dc,
          addTrack: vi.fn(),
          close: vi.fn(),
        };
      })
    );

    // Mock AudioContext - use a constructor function
    const mockAudioContext = {
      state: "running",
      createAnalyser: () => ({
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
      }),
      createMediaElementSource: () => ({ connect: vi.fn() }),
      destination: {},
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function (this: unknown) {
        return mockAudioContext;
      })
    );

    // Pass pre-created context to avoid AudioContext constructor in hook
    defaultOptions.audioContextRef = {
      current: mockAudioContext as unknown as AudioContext,
    };

  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("voice.start() should transition from idle to listening within 30 seconds", async () => {
    const { result } = renderHook(() => useVoiceSession(defaultOptions), {
      wrapper: ({ children }) => <>{children}</>,
    });

    expect(result.current.state).toBe("idle");

    await act(async () => {
      await result.current.start();
    });

    // Bug: voice stays "idle" forever with no error (perpetual "Connecting...").
    // We expect either: state transitions to listening/speaking/thinking (success)
    // OR realtimeError is set (failed fast, user can reconnect).
    await waitFor(
      () => {
        const { state, realtimeError } = result.current;
        const isStuck = state === "idle" && !realtimeError;
        expect(isStuck).toBe(false);
      },
      { timeout: 30000 }
    );
  });

  it("PRECISE ERROR: voice.start() resolves but state stays idle (setStateSync never propagates)", async () => {
    // Pinpoint: does voice.start() resolve, reject, or hang?
    const mockStream = createMockMediaStream();
    const openListeners: (() => void)[] = [];

    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/voice/realtime-token")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: MOCK_TOKEN }),
          } as Response);
        }
        if (url.includes("api.openai.com")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(MOCK_SDP_ANSWER),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function (this: unknown) {
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

    const mockAudioContext = {
      state: "running",
      createAnalyser: () => ({
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
      }),
      createMediaElementSource: () => ({ connect: vi.fn() }),
      destination: {},
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };

    const opts = {
      ...defaultOptions,
      audioContextRef: { current: mockAudioContext as unknown as AudioContext },
    };

    const { result } = renderHook(() => useVoiceSession(opts), {
      wrapper: ({ children }) => <>{children}</>,
    });

    // Wrap start() in act so React flushes state updates
    await act(async () => {
      await result.current.start();
    });

    // PRECISE ERROR: Even after start() resolves and act flushes, state stays "idle".
    // realtime.connect() completes (start resolves) but setStateSync("listening") either
    // isn't called or the state update doesn't propagate to the hook's return value.
    await waitFor(
      () => {
        expect(result.current.state).not.toBe("idle");
      },
      { timeout: 2000 }
    ).catch(() => {
      throw new Error(
        `PRECISE ERROR: voice.start() resolves but state NEVER updates from "idle". ` +
          `state=${result.current.state}, realtimeError=${result.current.realtimeError}. ` +
          `realtime.connect() completes (start resolves) but setStateSync("listening") either isn't called or doesn't propagate.`
      );
    });
  });

  it("DIAGNOSTIC: useVoiceSession with same mocks as realtime isolate test", async () => {
    // Use the SAME mock setup that makes realtime.connect() pass in isolation.
    // If this fails, the bug is in useVoiceSession orchestration, not realtime.
    const mockStream = createMockMediaStream();
    const openListeners: (() => void)[] = [];

    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/voice/realtime-token")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: MOCK_TOKEN }),
          } as Response);
        }
        if (url.includes("api.openai.com")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(MOCK_SDP_ANSWER),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      })
    );

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function (this: unknown) {
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

    const mockAudioContext = {
      state: "running",
      createAnalyser: () => ({
        fftSize: 256,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
      }),
      createMediaElementSource: () => ({ connect: vi.fn() }),
      destination: {},
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };

    const opts = {
      ...defaultOptions,
      audioContextRef: { current: mockAudioContext as unknown as AudioContext },
    };

    const { result } = renderHook(() => useVoiceSession(opts), {
      wrapper: ({ children }) => <>{children}</>,
    });

    await act(async () => {
      await result.current.start();
    });

    await waitFor(
      () => {
        const { state, realtimeError } = result.current;
        const isStuck = state === "idle" && !realtimeError;
        expect(isStuck).toBe(false);
      },
      { timeout: 5000 }
    );
  });
});

describe("Realtime transcription - isolate connect()", () => {
  const mockOnTranscriptComplete = vi.fn();
  const mockOnConnectionStateChange = vi.fn();

  function setupRealtimeMocks() {
    const mockStream = createMockMediaStreamForRealtime();
    const mockPc = createMockRTCPeerConnection();

    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      },
    });

    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.includes("/api/voice/realtime-token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: "test-token" }),
        } as Response);
      }
      if (url.includes("api.openai.com/v1/realtime/calls")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n"),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));

    vi.stubGlobal("RTCPeerConnection", mockPc);

    return { mockStream, mockPc };
  }

  function createMockMediaStreamForRealtime() {
    const track = {
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live" as MediaStreamTrackState,
      id: "mock-track",
      stop: vi.fn(),
      getSettings: () => ({}),
      clone: () => track,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    };
    return {
      id: "mock-stream",
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

  function createMockRTCPeerConnection() {
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
        createDataChannel: () => dc,
        addTrack: vi.fn(),
        close: vi.fn(),
      };
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connect() - getUserMedia is called", async () => {
    const { mockStream } = setupRealtimeMocks();
    const getUserMediaSpy = vi.mocked(navigator.mediaDevices.getUserMedia);

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      result.current.connect();
    });

    expect(getUserMediaSpy).toHaveBeenCalled();
    expect(getUserMediaSpy).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });

  it("connect() - token fetch is called", async () => {
    setupRealtimeMocks();
    const fetchSpy = vi.mocked(globalThis.fetch);

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      result.current.connect();
    });

    const tokenCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/api/voice/realtime-token")
    );
    expect(tokenCalls.length).toBeGreaterThan(0);
  });

  it("connect() - OpenAI API fetch is called", async () => {
    setupRealtimeMocks();
    const fetchSpy = vi.mocked(globalThis.fetch);

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      result.current.connect();
    });

    const openaiCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("api.openai.com/v1/realtime/calls")
    );
    expect(openaiCalls.length).toBeGreaterThan(0);
  });

  it("connect() - resolves and sets isConnected", async () => {
    setupRealtimeMocks();

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      result.current.connect();
    });

    await waitFor(
      () => {
        expect(result.current.isConnected).toBe(true);
      },
      { timeout: 5000 }
    );

    expect(mockOnConnectionStateChange).toHaveBeenCalledWith("connected");
  });

  it("connect() - rejects when token fetch fails", async () => {
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() =>
          Promise.resolve({
            getTracks: () => [{ stop: vi.fn() }],
          } as unknown as MediaStream)
        ),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          text: () => Promise.resolve("Token failed"),
        } as Response)
      )
    );
    vi.stubGlobal("RTCPeerConnection", vi.fn());

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      try {
        await result.current.connect();
      } catch {
        /* expected */
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});

describe("Step-by-step: which step fails?", () => {
  const mockOnTranscriptComplete = vi.fn();
  const mockOnConnectionStateChange = vi.fn();

  function createMockStream() {
    const track = {
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live" as MediaStreamTrackState,
      id: "mock-track",
      stop: vi.fn(),
      getSettings: () => ({}),
      clone: () => track,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    };
    return {
      id: "mock-stream",
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("STEP 1: getUserMedia - succeeds", async () => {
    const getUserMediaSpy = vi.fn(() =>
      Promise.resolve(createMockStream())
    );
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: { getUserMedia: getUserMediaSpy },
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    expect(stream).toBeDefined();
    expect(stream.getTracks().length).toBeGreaterThan(0);
  });

  it("STEP 2: token fetch - succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("realtime-token")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: "test-token" }),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected: ${url}`));
      })
    );

    const res = await fetch("/api/voice/realtime-token", { method: "POST" });
    const data = await (res as Response).json();

    expect(res.ok).toBe(true);
    expect(data.token).toBe("test-token");
  });

  it("STEP 3: RTCPeerConnection constructor - succeeds", () => {
    const MockPC = vi.fn().mockImplementation(function (this: unknown) {
      return {
        createOffer: () => Promise.resolve({ type: "offer", sdp: "v=0" }),
        setLocalDescription: () => Promise.resolve(),
        setRemoteDescription: () => Promise.resolve(),
        createDataChannel: () => ({ addEventListener: vi.fn(), close: vi.fn() }),
        addTrack: vi.fn(),
        close: vi.fn(),
      };
    });

    vi.stubGlobal("RTCPeerConnection", MockPC);

    const pc = new RTCPeerConnection();
    expect(pc).toBeDefined();
    expect(pc.createOffer).toBeDefined();
    expect(pc.createDataChannel).toBeDefined();
  });

  it("STEP 4: full realtime connect flow - trace each step", async () => {
    const steps: string[] = [];
    const openListeners: (() => void)[] = [];

    const mockStream = createMockStream();
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          steps.push("1.getUserMedia");
          return mockStream;
        }),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/voice/realtime-token")) {
          steps.push("2.tokenFetch");
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: "test-token" }),
          } as Response);
        }
        if (url.includes("api.openai.com")) {
          steps.push("3.openaiFetch");
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve("v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n"),
          } as Response);
        }
        return Promise.reject(new Error(`Unexpected: ${url}`));
      })
    );

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockImplementation(function (this: unknown) {
        steps.push("4.RTCPeerConnection");
        return {
          createDataChannel: () => {
            steps.push("5.createDataChannel");
            return {
              addEventListener: (event: string, fn: () => void) => {
                if (event === "open") openListeners.push(fn);
              },
              removeEventListener: vi.fn(),
              close: vi.fn(),
            };
          },
          createOffer: () => {
            steps.push("6.createOffer");
            return Promise.resolve({
              type: "offer",
              sdp: "v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n",
            });
          },
          setLocalDescription: () => {
            steps.push("7.setLocalDescription");
            return Promise.resolve();
          },
          setRemoteDescription: () => {
            steps.push("8.setRemoteDescription");
            openListeners.forEach((fn) => fn());
            return Promise.resolve();
          },
          addTrack: vi.fn(),
          close: vi.fn(),
        };
      })
    );

    const { result } = renderHook(() =>
      useRealtimeTranscription({
        onTranscriptComplete: mockOnTranscriptComplete,
        onConnectionStateChange: mockOnConnectionStateChange,
      })
    );

    await act(async () => {
      result.current.connect();
    });

    expect(steps).toContain("1.getUserMedia");
    expect(steps).toContain("2.tokenFetch");
    expect(steps).toContain("4.RTCPeerConnection");
    expect(steps).toContain("5.createDataChannel");
    expect(steps).toContain("6.createOffer");
    expect(steps).toContain("7.setLocalDescription");
    expect(steps).toContain("3.openaiFetch");
    expect(steps).toContain("8.setRemoteDescription");

    await waitFor(
      () => {
        expect(result.current.isConnected).toBe(true);
      },
      { timeout: 5000 }
    );
  });
});
