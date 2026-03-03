import { after } from "next/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { buildAnalysisPrompt } from "@/lib/prompts/analysis";
import { SessionAnalysis, DepthLevel } from "@/lib/types";
import { clearCachedMessages } from "@/lib/cache/conversation-context";

export async function POST(req: Request) {
  const { topicId, topicName, transcript, previousLevel } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const analysisPrompt = buildAnalysisPrompt(topicName, transcript, previousLevel);

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    prompt: analysisPrompt,
  });

  let analysis: SessionAnalysis;
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    analysis = JSON.parse(cleaned);
  } catch {
    analysis = {
      depth_level_demonstrated: previousLevel as DepthLevel,
      gap_types_identified: [],
      understanding_breakdown: ["Unable to parse session analysis"],
      mental_model_update: "",
      session_summary: {
        what_covered: [],
        what_correct: [],
        where_broke_down: [],
        self_test_questions: [],
        next_session_focus: [],
        core_concepts: [],
        current_level_description: "",
        next_level_requires: "",
      },
      self_test_questions: [],
    };
  }

  const depthLevel = Math.max(1, Math.min(5, analysis.depth_level_demonstrated)) as DepthLevel;

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      transcript,
      depth_level_before: previousLevel,
      depth_level_after: depthLevel,
      gap_types: analysis.gap_types_identified,
      session_summary: analysis.session_summary,
    })
    .select()
    .single();

  if (sessionError) {
    return Response.json({ error: sessionError.message }, { status: 500 });
  }

  const status =
    depthLevel >= 4
      ? "strong"
      : depthLevel >= 2
        ? "developing"
        : "needs_review";

  await supabase
    .from("topics")
    .update({
      current_depth_level: depthLevel,
      mental_model: analysis.mental_model_update || null,
      common_errors: analysis.understanding_breakdown || [],
      last_tested_at: new Date().toISOString(),
      status,
    })
    .eq("id", topicId);

  after(async () => {
    await clearCachedMessages(topicId);
  });

  return Response.json({
    sessionId: session.id,
    analysis,
    newLevel: depthLevel,
  });
}
