import { streamText, generateText, convertToModelMessages, UIMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { FTUE_SYSTEM_PROMPT, FTUE_EXTRACTION_PROMPT } from "@/lib/prompts/ftue-system";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, action }: { messages: UIMessage[]; action?: string } =
    await req.json();

  if (action === "extract_profile") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transcript = messages
      .map((m: UIMessage) => {
        const text =
          m.parts
            ?.filter((p: { type: string }): p is { type: "text"; text: string } => p.type === "text")
            .map((p: { type: "text"; text: string }) => p.text)
            .join("") || "";
        return `${m.role === "user" ? "USER" : "COACH"}: ${text}`;
      })
      .join("\n\n");

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6-20250514"),
      prompt: `${FTUE_EXTRACTION_PROMPT}\n\nTranscript:\n---\n${transcript}\n---`,
    });

    let profile;
    try {
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      profile = JSON.parse(cleaned);
    } catch {
      profile = { role: "Unknown", gap: "Unknown" };
    }

    await supabase.from("users").update({ profile }).eq("id", user.id);

    return Response.json({ profile });
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-6-20250514"),
    system: FTUE_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
