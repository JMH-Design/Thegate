"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { createClient } from "@/lib/supabase/client";
import { Topic, DepthLevel, UserProfile, SessionSummary } from "@/lib/types";
import { ChatMessage } from "@/components/session/chat-message";
import { ChatInput } from "@/components/session/chat-input";
import { SessionHeader } from "@/components/session/session-header";
import {
  ReturningTopicEntry,
  NewTopicEntry,
} from "@/components/session/topic-entry";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = params.topicId as string;
  const isNew = topicId === "new";
  const newTopicName = searchParams.get("topic") || "";

  const [topic, setTopic] = useState<Topic | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessionCount, setSessionCount] = useState(1);
  const [lastSummary, setLastSummary] = useState<SessionSummary | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [ending, setEnding] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const currentLevel = (topic?.current_depth_level || 1) as DepthLevel;
  const targetLevel = Math.min(currentLevel + 1, 5) as DepthLevel;
  const displayName = topic?.name || newTopicName;

  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  const hasAutoStarted = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-send first message on new topic so coach greets with diagnostic question
  useEffect(() => {
    if (
      isNew &&
      !loading &&
      !hasAutoStarted.current &&
      messages.length === 0 &&
      !isStreaming &&
      newTopicName
    ) {
      hasAutoStarted.current = true;
      setStarted(true);
      sendMessage(
        { text: "__START_SESSION__" },
        {
          body: {
            topicName: displayName,
            currentLevel,
            mentalModel: topic?.mental_model ?? null,
            commonErrors: topic?.common_errors ?? null,
            lastSummary,
            isNewTopic: true,
            sessionCount,
            userProfile: profile,
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
    displayName,
    currentLevel,
    topic?.mental_model,
    topic?.common_errors,
    lastSummary,
    sessionCount,
    profile,
  ]);

  useEffect(() => {
    async function loadData() {
      if (isNew) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: u } = await supabase
            .from("users")
            .select("profile")
            .eq("id", userData.user.id)
            .single();
          setProfile(u?.profile || null);
        }
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push("/login");
        return;
      }

      const [{ data: topicData }, { data: u }] = await Promise.all([
        supabase.from("topics").select("*").eq("id", topicId).single(),
        supabase
          .from("users")
          .select("profile")
          .eq("id", userData.user.id)
          .single(),
      ]);

      if (!topicData) {
        router.push("/");
        return;
      }

      setTopic(topicData as Topic);
      setProfile(u?.profile || null);

      const { count } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .eq("topic_id", topicId);
      setSessionCount((count || 0) + 1);

      const { data: lastSession } = await supabase
        .from("sessions")
        .select("session_summary")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setLastSummary(lastSession?.session_summary || null);

      setLoading(false);
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId, isNew]);

  function handleReinforce() {
    setStarted(true);
    sendMessage(
      { text: "__START_SESSION__" },
      {
        body: {
          topicName: displayName,
          currentLevel,
          mentalModel: topic?.mental_model ?? null,
          commonErrors: topic?.common_errors ?? null,
          lastSummary,
          isNewTopic: false,
          sessionCount,
          userProfile: profile,
          sessionIntent: "reinforce",
        },
      }
    );
  }

  function handleGoDeeper() {
    setStarted(true);
    sendMessage(
      { text: "__START_SESSION__" },
      {
        body: {
          topicName: displayName,
          currentLevel,
          mentalModel: topic?.mental_model ?? null,
          commonErrors: topic?.common_errors ?? null,
          lastSummary,
          isNewTopic: false,
          sessionCount,
          userProfile: profile,
          sessionIntent: "go_deeper",
        },
      }
    );
  }

  function handleSend() {
    if (!input.trim() || isStreaming) return;
    if (!started) setStarted(true);
    sendMessage(
      { text: input },
      {
        body: {
          topicName: displayName,
          currentLevel,
          mentalModel: topic?.mental_model ?? null,
          commonErrors: topic?.common_errors ?? null,
          lastSummary,
          isNewTopic: isNew || !topic,
          sessionCount,
          userProfile: profile,
        },
      }
    );
    setInput("");
  }

  async function handleEndSession() {
    if (messages.length < 4 || ending) return;
    setEnding(true);

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
        setTopic(newTopic as Topic);
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
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            disabled={isStreaming || ending}
          />
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
    </div>
  );
}
