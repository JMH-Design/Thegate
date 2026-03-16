"use client";

import { useRouter } from "next/navigation";
import {
  Topic,
  Benchmark,
  UserProfile,
  TopicWithBenchmark,
  DepthLevel,
  getRoomPosition,
} from "@/lib/types";
import { TopicCard } from "./topic-card";
import { PackMap } from "./pack-map";
import { Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { setPreAcquiredStream, setPreAcquiredAudioContext } from "@/lib/voice-pre-session";
import { useState } from "react";

interface KnowledgeMapProps {
  profile: UserProfile | null;
  topics: Topic[];
  benchmarks: Benchmark[];
  userEmail: string;
}

function enrichTopics(
  topics: Topic[],
  benchmarks: Benchmark[]
): TopicWithBenchmark[] {
  return topics.map((topic) => {
    const benchmark = benchmarks.find(
      (b) => b.topic_name.toLowerCase() === topic.name.toLowerCase()
    );
    return {
      ...topic,
      benchmark: benchmark || null,
      room_position: benchmark
        ? getRoomPosition(topic.current_depth_level, benchmark.benchmark_level)
        : undefined,
    };
  });
}

export function KnowledgeMap({
  profile,
  topics,
  benchmarks,
  userEmail,
}: KnowledgeMapProps) {
  const router = useRouter();
  const supabase = createClient();
  const [newTopic, setNewTopic] = useState("");
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  // viewMode: default "list"; add view switcher UI to re-enable pack view
  const [viewMode] = useState<"pack" | "list">("list");

  const enriched = enrichTopics(topics, benchmarks);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleNewTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTopic.trim()) return;
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setPreAcquiredStream(stream);
      const audioCtx = new AudioContext();
      await audioCtx.resume();
      setPreAcquiredAudioContext(audioCtx);
      router.push(`/session/new?topic=${encodeURIComponent(newTopic.trim())}`);
    } catch {
      setMicDenied(true);
    }
  }

  async function handleRetryMic() {
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setPreAcquiredStream(stream);
      const audioCtx = new AudioContext();
      await audioCtx.resume();
      setPreAcquiredAudioContext(audioCtx);
      router.push(`/session/new?topic=${encodeURIComponent(newTopic.trim())}`);
    } catch {
      setMicDenied(true);
    }
  }

  const greeting = profile?.role
    ? `${profile.role}${profile.company_type ? ` · ${profile.company_type}` : ""}`
    : userEmail;

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <header className="shrink-0 border-b border-border-subtle">
        <div className="max-w-[--thread-max-width] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text-primary tracking-tight">
              THE GATE
            </h1>
            <p className="text-xs text-text-dim mt-0.5">{greeting}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-text-muted hover:text-text-primary-soft transition-colors duration-fast"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col min-h-0 w-full py-10 max-w-[--thread-max-width] mx-auto px-6">
        <div className="shrink-0 flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-semibold text-text-primary">
              Your Knowledge Map
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              {topics.length === 0
                ? "Start your first session to build your map."
                : `${topics.length} topic${topics.length !== 1 ? "s" : ""} mapped`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => setShowNewTopic(true)}
              className="gap-2"
            >
              <Plus size={16} />
              New Topic
            </Button>
          </div>
        </div>

        {showNewTopic && (
          <div className="mb-8">
            <form onSubmit={handleNewTopic} className="flex gap-3 items-center">
              <input
                autoFocus
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="What do you want to understand?"
                className="flex-1 h-12 bg-surface border border-border rounded-[--radius-input] px-4 text-input text-text-primary-soft placeholder:text-text-muted transition-all duration-fast focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold/30"
              />
              <Button type="submit" disabled={!newTopic.trim()}>
                Start
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowNewTopic(false);
                  setNewTopic("");
                  setMicDenied(false);
                }}
              >
                Cancel
              </Button>
            </form>
            {micDenied && (
              <div className="mt-3 p-3 rounded-lg bg-danger/10 border border-danger/30">
                <p className="text-sm text-danger">
                  Microphone access is required for voice sessions. Please allow
                  mic access and try again, or use text mode on the session page.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    onClick={handleRetryMic}
                  >
                    Retry microphone
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-3 text-xs"
                    onClick={() => {
                      setMicDenied(false);
                      router.push(
                        `/session/new?topic=${encodeURIComponent(newTopic.trim())}`
                      );
                    }}
                  >
                    Continue with text mode
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {topics.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <EmptyState onStart={() => setShowNewTopic(true)} />
          </div>
        ) : viewMode === "pack" ? (
          <div className="flex min-h-0 flex-1 w-full overflow-hidden">
            <PackMap topics={topics} profile={profile} />
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-surface flex items-center justify-center">
        <span className="text-2xl text-gold">✦</span>
      </div>
      <h3 className="text-xl font-semibold text-text-primary mb-2">
        The map is empty
      </h3>
      <p className="text-text-secondary max-w-sm mx-auto mb-8">
        Every topic you bring to The Gate becomes a point on your knowledge map.
        Depth levels earned through demonstrated understanding.
      </p>
      <Button onClick={onStart}>Start your first topic</Button>
    </div>
  );
}
