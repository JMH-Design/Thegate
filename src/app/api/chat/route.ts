import { streamText, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { buildCoachSystemPrompt } from "@/lib/prompts/coach-system";
import { DepthLevel } from "@/lib/types";
import {
  getCachedMessages,
  setCachedMessages,
  type CachedMessage,
} from "@/lib/cache/conversation-context";

export const maxDuration = 60;

function toCachedMessage(m: { id?: string; role?: string; parts?: unknown[] }): CachedMessage {
  const textParts = (m.parts ?? []).filter(
    (p): p is { type: string; text?: string } =>
      typeof p === "object" && p !== null && (p as { type?: string }).type === "text"
  );
  const content = textParts.map((p) => p.text ?? "").join("") || "";
  return {
    id: m.id ?? crypto.randomUUID(),
    role: m.role ?? "user",
    content,
    parts: m.parts as CachedMessage["parts"],
  };
}

function mergeMessages(
  cached: CachedMessage[],
  incoming: Array<{ id?: string; role?: string; parts?: unknown[] }>
): Array<{ id?: string; role?: string; parts?: unknown[] }> {
  const incomingIds = new Set(
    (incoming ?? []).map((m) => m.id ?? crypto.randomUUID())
  );
  const older = cached.filter((m) => !incomingIds.has(m.id));
  return [
    ...older.map((m) => ({ id: m.id, role: m.role, parts: m.parts })),
    ...(incoming ?? []),
  ];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages: incomingMessages,
      sessionId,
      topicName,
      currentLevel,
      mentalModel,
      commonErrors,
      lastSummary,
      isNewTopic,
      sessionCount,
      userProfile,
      sessionIntent,
      voiceMode,
    } = body;

    const coachMode = voiceMode ? "audio" : "text";
    const systemPrompt = buildCoachSystemPrompt(
      {
        userProfile: userProfile || null,
        topicName: topicName || "Unknown Topic",
        currentLevel: (currentLevel || 1) as DepthLevel,
        mentalModel: mentalModel || null,
        commonErrors: commonErrors || null,
        lastSummary: lastSummary || null,
        isNewTopic: isNewTopic ?? true,
        sessionCount: sessionCount || 1,
        sessionIntent: sessionIntent || undefined,
      },
      coachMode
    );

    let messagesToUse = incomingMessages ?? [];
    if (sessionId) {
      const cached = await getCachedMessages(sessionId);
      if (cached?.length) {
        messagesToUse = mergeMessages(
          cached,
          incomingMessages ?? []
        );
      }
    }

    const result = streamText({
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      messages: await convertToModelMessages(messagesToUse),
    });

    if (sessionId && messagesToUse.length > 0) {
      const toCache = messagesToUse.map(toCachedMessage);
      setCachedMessages(sessionId, toCache).catch(() => {});
    }

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat request failed";
    return new Response(message, { status: 500 });
  }
}
