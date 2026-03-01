import { streamText, convertToModelMessages, UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildCoachSystemPrompt } from "@/lib/prompts/coach-system";
import { DepthLevel, SessionSummary } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      topicName,
      currentLevel,
      mentalModel,
      commonErrors,
      lastSummary,
      isNewTopic,
      sessionCount,
      userProfile,
    } = body;

    const systemPrompt = buildCoachSystemPrompt({
      userProfile: userProfile || null,
      topicName: topicName || "Unknown Topic",
      currentLevel: (currentLevel || 1) as DepthLevel,
      mentalModel: mentalModel || null,
      commonErrors: commonErrors || null,
      lastSummary: lastSummary || null,
      isNewTopic: isNewTopic ?? true,
      sessionCount: sessionCount || 1,
    });

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages ?? []),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    return new Response(message, { status: 500 });
  }
}
