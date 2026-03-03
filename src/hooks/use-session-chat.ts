"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Topic, UserProfile, SessionSummary } from "@/lib/types";

interface UseSessionDataOptions {
  topicId: string;
  isNew: boolean;
}

async function fetchSessionData({
  topicId,
  isNew,
}: UseSessionDataOptions): Promise<{
  topic: Topic | null;
  profile: UserProfile | null;
  sessionCount: number;
  lastSummary: SessionSummary | null;
}> {
  const supabase = createClient();

  if (isNew) {
    const { data: userData } = await supabase.auth.getUser();
    let profile: UserProfile | null = null;
    if (userData.user) {
      const { data: u } = await supabase
        .from("users")
        .select("profile")
        .eq("id", userData.user.id)
        .single();
      profile = (u?.profile as UserProfile) ?? null;
    }
    return {
      topic: null,
      profile,
      sessionCount: 1,
      lastSummary: null,
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    throw new Error("Not authenticated");
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
    throw new Error("Topic not found");
  }

  const { count } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .eq("topic_id", topicId);

  const { data: lastSession } = await supabase
    .from("sessions")
    .select("session_summary")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return {
    topic: topicData as Topic,
    profile: (u?.profile as UserProfile) ?? null,
    sessionCount: (count || 0) + 1,
    lastSummary: (lastSession?.session_summary as SessionSummary) ?? null,
  };
}

export const sessionDataQueryKey = (topicId: string, isNew: boolean) =>
  ["session-data", topicId, isNew] as const;

export function useSessionData(topicId: string, isNew: boolean) {
  return useQuery({
    queryKey: sessionDataQueryKey(topicId, isNew),
    queryFn: () => fetchSessionData({ topicId, isNew }),
    enabled: !!topicId,
    staleTime: 30 * 1000,
  });
}

export function useInvalidateSessionData() {
  const queryClient = useQueryClient();
  return useCallback(
    (topicId: string, isNew: boolean) => {
      queryClient.invalidateQueries({ queryKey: sessionDataQueryKey(topicId, isNew) });
    },
    [queryClient]
  );
}
