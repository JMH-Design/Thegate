import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { topicNames } = await req.json();

    if (!Array.isArray(topicNames) || topicNames.length < 2) {
      return Response.json(
        { error: "topicNames must be a non-empty array of at least 2 items" },
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

    const topicList = topicNames
      .filter((n: unknown) => typeof n === "string")
      .map((n: string) => n.trim())
      .filter(Boolean);

    if (topicList.length < 2) {
      return Response.json(
        { error: "At least 2 valid topic names required" },
        { status: 400 }
      );
    }

    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: `You group learning topics into semantic clusters. Return ONLY valid JSON, no other text.
Format: { "Cluster Name": ["topic1", "topic2"], "Another Cluster": ["topic3"] }
- Use 3–8 clusters depending on topic diversity
- Cluster names should be short and descriptive (e.g., "Programming", "Data & Analytics", "Business")
- Every topic must appear in exactly one cluster
- Match topic names exactly as provided (case-sensitive)`,
      prompt: `Group these topics into semantic clusters:\n${topicList.map((t) => `- ${t}`).join("\n")}`,
      maxOutputTokens: 1024,
    });

    let parsed: Record<string, string[]>;
    try {
      parsed = JSON.parse(text.trim()) as Record<string, string[]>;
    } catch {
      return Response.json(
        { error: "Invalid cluster response from model" },
        { status: 500 }
      );
    }

    const clusters: Record<string, string[]> = {};

    for (const [clusterName, topicsInCluster] of Object.entries(parsed)) {
      if (Array.isArray(topicsInCluster) && topicsInCluster.length > 0) {
        clusters[clusterName] = topicsInCluster;
      }
    }

    const assigned = new Set(Object.values(clusters).flat());
    const unassigned = topicList.filter((t) => !assigned.has(t));
    if (unassigned.length > 0) {
      clusters["Other"] = [...(clusters["Other"] ?? []), ...unassigned];
    }

    return Response.json({ clusters });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cluster assignment failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
