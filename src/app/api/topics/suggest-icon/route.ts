import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import {
  ICON_WHITELIST,
  isValidIconName,
  type IconName,
} from "@/lib/knowledge-map/icon-cache";

const ICON_LIST = ICON_WHITELIST.join(", ");

export async function POST(req: Request) {
  try {
    const { topicName, topicId } = await req.json();

    if (!topicName || typeof topicName !== "string") {
      return Response.json(
        { error: "topicName is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      prompt: `Given the learning topic "${topicName}", choose the single most fitting icon from this exact list. Reply with ONLY the icon name, nothing else.

Icons: ${ICON_LIST}`,
      maxOutputTokens: 20,
    });

    const trimmed = text.trim();
    const icon = isValidIconName(trimmed) ? trimmed : "BookMarked";

    if (topicId && typeof topicId === "string") {
      await supabase
        .from("topics")
        .update({ icon: icon as IconName })
        .eq("id", topicId)
        .eq("user_id", user.id);
    }

    return Response.json({ icon });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Icon suggestion failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
