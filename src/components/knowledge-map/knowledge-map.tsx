"use client";

import { useRouter } from "next/navigation";
import {
  Topic,
  Benchmark,
  UserProfile,
  TopicWithBenchmark,
  DepthLevel,
  RoomPosition,
} from "@/lib/types";
import { TopicCard } from "./topic-card";
import { PackMap } from "./pack-map";
import { Plus, LogOut, List, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface KnowledgeMapProps {
  profile: UserProfile | null;
  topics: Topic[];
  benchmarks: Benchmark[];
  userEmail: string;
}

function getRoomPosition(
  userLevel: DepthLevel,
  benchmarkLevel: DepthLevel
): RoomPosition {
  if (userLevel > benchmarkLevel) return "ahead";
  if (userLevel === benchmarkLevel) return "at_par";
  return "below";
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
  const [viewMode, setViewMode] = useState<"pack" | "list">(
    topics.length >= 2 ? "pack" : "list"
  );

  const enriched = enrichTopics(topics, benchmarks);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleNewTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTopic.trim()) return;
    router.push(`/session/new?topic=${encodeURIComponent(newTopic.trim())}`);
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

      <main
        className={`flex flex-1 flex-col min-h-0 w-full py-10 ${
          viewMode === "pack" ? "" : "max-w-[--thread-max-width] mx-auto px-6"
        }`}
      >
        <div
          className={`shrink-0 flex items-center justify-between mb-8 ${
            viewMode === "pack" ? "max-w-[--thread-max-width] mx-auto w-full px-6" : ""
          }`}
        >
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
            {topics.length >= 1 && (
              <div className="flex rounded-[--radius-button] border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("pack")}
                  className={`p-2 transition-colors duration-fast ${
                    viewMode === "pack"
                      ? "bg-surface text-gold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                  aria-label="Pack view"
                >
                  <CircleDot size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`p-2 transition-colors duration-fast ${
                    viewMode === "list"
                      ? "bg-surface text-gold"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                  aria-label="List view"
                >
                  <List size={18} />
                </button>
              </div>
            )}
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
          <form
            onSubmit={handleNewTopic}
            className={`mb-8 flex gap-3 items-center ${
              viewMode === "pack" ? "max-w-[--thread-max-width] mx-auto w-full px-6" : ""
            }`}
          >
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
              }}
            >
              Cancel
            </Button>
          </form>
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
