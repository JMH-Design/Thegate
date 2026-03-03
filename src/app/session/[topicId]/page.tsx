"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { createClient } from "@/lib/supabase/client";
import { Topic, DepthLevel } from "@/lib/types";
import { ChatMessage } from "@/components/session/chat-message";
import { ChatInput } from "@/components/session/chat-input";
import { SessionHeader } from "@/components/session/session-header";
import {
  ReturningTopicEntry,
  NewTopicEntry,
} from "@/components/session/topic-entry";
import { VoiceMode } from "@/components/session/voice-mode";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useSessionData, useInvalidateSessionData } from "@/hooks/use-session-chat";
import { takePreAcquiredStream } from "@/lib/voice-pre-session";
import { Mic } from "lucide-react";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = params.topicId as string;
  const isNew = topicId === "new";
  const newTopicName = searchParams.get("topic") || "";

  const [started, setStarted] = useState(false);
  const [ending, setEnding] = useState(false);
  const [voiceMode, setVoiceMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const preAcquiredStreamRef = useRef<MediaStream | null>(null);
  const supabase = createClient();

  const {
    data: sessionData,
    isLoading: loading,
    error: sessionError,
  } = useSessionData(topicId, isNew);
  const invalidateSessionData = useInvalidateSessionData();

  const topic = sessionData?.topic ?? null;
  const profile = sessionData?.profile ?? null;
  const sessionCount = sessionData?.sessionCount ?? 1;
  const lastSummary = sessionData?.lastSummary ?? null;

  useEffect(() => {
    if (sessionError?.message === "Not authenticated") {
      router.push("/login");
    } else if (sessionError?.message === "Topic not found") {
      router.push("/");
    }
  }, [sessionError, router]);

  const currentLevel = (topic?.current_depth_level || 1) as DepthLevel;
  const targetLevel = Math.min(currentLevel + 1, 5) as DepthLevel;
  const displayName = topic?.name || newTopicName;

  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const hasAutoStarted = useRef(false);

  const sessionId = isNew ? `new-${newTopicName || "session"}` : topicId;

  const chatBody = useMemo(
    () => ({
      topicName: displayName,
      currentLevel,
      mentalModel: topic?.mental_model ?? null,
      commonErrors: topic?.common_errors ?? null,
      lastSummary,
      isNewTopic: isNew || !topic,
      sessionCount,
      userProfile: profile,
      voiceMode,
      sessionId,
    }),
    [
      displayName,
      currentLevel,
      topic?.mental_model,
      topic?.common_errors,
      lastSummary,
      isNew,
      topic,
      sessionCount,
      profile,
      voiceMode,
      sessionId,
    ]
  );

  const voice = useVoiceSession({
    sendMessage,
    messages,
    status,
    stop,
    chatBody,
    audioContextRef,
    preAcquiredStreamRef,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (
      isNew &&
      !loading &&
      !hasAutoStarted.current &&
      messages.length === 0 &&
      !isStreaming &&
      newTopicName
    ) {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        audioContextRef.current.resume();
      }
      preAcquiredStreamRef.current = takePreAcquiredStream();
      hasAutoStarted.current = true;
      setStarted(true);
      voice.start();
      sendMessage(
        { text: "__START_SESSION__" },
        {
          body: {
            ...chatBody,
            isNewTopic: true,
          },
        }
      );
    }
  }, [
    isNew,
    loading,
    messages.length,
    isStreaming,
    newTopicName,
    chatBody,
    sendMessage,
    voice,
  ]);

  function handleReinforce() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      audioContextRef.current.resume();
    }
    voice.start();
    setStarted(true);
    sendMessage(
      { text: "__START_SESSION__" },
      {
        body: {
          ...chatBody,
          isNewTopic: false,
          sessionIntent: "reinforce",
        },
      }
    );
  }

  function handleGoDeeper() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      audioContextRef.current.resume();
    }
    voice.start();
    setStarted(true);
    sendMessage(
      { text: "__START_SESSION__" },
      {
        body: {
          ...chatBody,
          isNewTopic: false,
          sessionIntent: "go_deeper",
        },
      }
    );
  }

  function handleSend() {
    if (!input.trim() || isStreaming) return;
    if (!started) setStarted(true);
    sendMessage({ text: input }, { body: chatBody });
    setInput("");
  }

  const handleSwitchToText = useCallback(() => {
    voice.cleanup();
    setVoiceMode(false);
  }, [voice]);

  const handleSwitchToVoice = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      audioContextRef.current.resume();
    }
    setVoiceMode(true);
  }, []);

  async function handleEndSession() {
    if (messages.length < 4 || ending) return;
    setEnding(true);

    if (voiceMode) voice.cleanup();

    const transcript = messages
      .map((m) => {
        const text =
          m.parts
            ?.filter(
              (p): p is { type: "text"; text: string } => p.type === "text"
            )
            .map((p) => p.text)
            .join("") || "";
        return `${m.role === "user" ? "USER" : "COACH"}: ${text}`;
      })
      .join("\n\n");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    let activeTopicId = topicId;

    if (isNew && newTopicName) {
      const { data: newTopic } = await supabase
        .from("topics")
        .insert({
          user_id: userData.user.id,
          name: newTopicName,
          current_depth_level: 1,
          status: "developing",
        })
        .select()
        .single();

      if (newTopic) {
        activeTopicId = newTopic.id;
      }
    }

    const res = await fetch("/api/sessions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicId: activeTopicId,
        topicName: displayName,
        transcript,
        previousLevel: currentLevel,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      invalidateSessionData(activeTopicId ?? topicId, false);
      if (isNew && newTopicName && activeTopicId) {
        fetch("/api/topics/suggest-icon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicName: newTopicName,
            topicId: activeTopicId,
          }),
        }).catch(() => {});
      }
      router.push(`/session-close/${data.sessionId}`);
    } else {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!started && !isNew && topic) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <SessionHeader
          topicName={displayName}
          currentLevel={currentLevel}
          targetLevel={targetLevel}
          sessionNumber={sessionCount}
          onBack={() => router.push("/")}
        />
        <ReturningTopicEntry
          topic={topic}
          onReinforce={handleReinforce}
          onGoDeeper={handleGoDeeper}
        />
      </div>
    );
  }

  function getMessageText(m: (typeof messages)[0]): string {
    return (
      m.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") || ""
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <SessionHeader
        topicName={displayName}
        currentLevel={currentLevel}
        targetLevel={targetLevel}
        sessionNumber={sessionCount}
        onBack={() => router.push("/")}
      />

      {isNew && <NewTopicEntry topicName={newTopicName} />}

      {voiceMode ? (
        <VoiceMode
          state={voice.state}
          analyser={voice.analyser}
          currentTranscript={voice.currentTranscript}
          isMuted={voice.isMuted}
          isPaused={voice.isPaused}
          ending={ending}
          canEnd={messages.length >= 4}
          topicName={displayName}
          sessionNumber={sessionCount}
          voiceError={voice.realtimeError}
          onToggleMute={voice.toggleMute}
          onTogglePause={voice.togglePause}
          onEnd={handleEndSession}
          onSwitchToText={handleSwitchToText}
        />
      ) : (
        <>
          <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6 overflow-y-auto">
            {status === "error" && error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-4 py-3 text-sm text-danger">
                <p className="font-medium">Something went wrong</p>
                <p className="mt-1 text-text-secondary">{error.message}</p>
              </div>
            )}
            {messages
              .filter((m) => getMessageText(m) !== "__START_SESSION__")
              .map((m, i, arr) => (
                <ChatMessage
                  key={m.id}
                  role={m.role as "user" | "assistant"}
                  content={getMessageText(m)}
                  isStreaming={
                    isStreaming &&
                    i === arr.length - 1 &&
                    m.role === "assistant"
                  }
                />
              ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="sticky bottom-0 bg-bg-primary border-t border-border-subtle">
            <div className="max-w-2xl mx-auto px-6 py-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSubmit={handleSend}
                    disabled={isStreaming || ending}
                  />
                </div>
                <button
                  onClick={handleSwitchToVoice}
                  className="flex-shrink-0 w-[34px] h-[34px] rounded-full bg-surface hover:bg-surface-hover text-text-muted hover:text-gold border border-border-subtle flex items-center justify-center transition-all duration-fast mb-[11px]"
                  aria-label="Switch to voice mode"
                >
                  <Mic size={16} />
                </button>
              </div>
              {messages.length >= 4 && !ending && (
                <button
                  onClick={handleEndSession}
                  className="mt-3 w-full text-center text-xs text-text-dim hover:text-text-muted transition-colors"
                >
                  End session & see results
                </button>
              )}
              {ending && (
                <p className="mt-3 text-center text-xs text-gold animate-pulse">
                  Analyzing session...
                </p>
              )}
            </div>

            <div className="text-center pb-3">
              <span className="text-[11px] text-text-dim">
                {displayName} · Session {sessionCount}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
