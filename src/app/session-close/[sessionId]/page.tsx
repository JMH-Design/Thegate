"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Session, Topic, Benchmark, DepthLevel } from "@/lib/types";
import { LevelProgression } from "@/components/session-close/level-progression";
import { RoomBenchmark } from "@/components/session-close/room-benchmark";
import { SessionSummaryView } from "@/components/session-close/session-summary";
import { SelfTest } from "@/components/session-close/self-test";
import { Button } from "@/components/ui/button";

export default function SessionClosePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!sessionData) {
        router.push("/");
        return;
      }

      setSession(sessionData as Session);

      const { data: topicData } = await supabase
        .from("topics")
        .select("*")
        .eq("id", sessionData.topic_id)
        .single();

      if (topicData) {
        setTopic(topicData as Topic);

        const { data: benchmarkData } = await supabase
          .from("benchmarks")
          .select("*")
          .ilike("topic_name", topicData.name)
          .limit(1)
          .maybeSingle();

        setBenchmark(benchmarkData as Benchmark | null);
      }

      setLoading(false);
    }

    load();
  }, [sessionId, router, supabase]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  const summary = session.session_summary;

  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-lg mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <p className="text-xs text-text-dim uppercase tracking-widest mb-2">
            Session Complete
          </p>
          <h1 className="text-2xl font-bold text-text-primary">
            {topic?.name || "Topic"}
          </h1>
        </div>

        <div className="w-full h-px bg-border-subtle mb-2" />

        <LevelProgression
          before={session.depth_level_before as DepthLevel}
          after={session.depth_level_after as DepthLevel}
        />

        <div className="w-full h-px bg-border-subtle my-2" />

        <RoomBenchmark
          userLevel={session.depth_level_after as DepthLevel}
          benchmark={benchmark}
        />

        {summary && (
          <>
            <div className="w-full h-px bg-border-subtle my-2" />
            <div className="py-6">
              <SessionSummaryView summary={summary} />
            </div>
          </>
        )}

        {summary?.self_test_questions && summary.self_test_questions.length > 0 && (
          <>
            <div className="w-full h-px bg-border-subtle my-2" />
            <SelfTest questions={summary.self_test_questions} />
          </>
        )}

        <div className="w-full h-px bg-border-subtle my-6" />

        <Button
          variant="secondary"
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
          className="w-full"
        >
          Back to map
        </Button>
      </div>
    </div>
  );
}
