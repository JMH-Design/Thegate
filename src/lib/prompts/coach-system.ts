import fs from "fs";
import path from "path";
import {
  UserProfile,
  DepthLevel,
  DEPTH_LABELS,
  SessionSummary,
} from "@/lib/types";

export type CoachMode = "audio" | "text";

interface CoachContext {
  userProfile: UserProfile | null;
  topicName: string;
  currentLevel: DepthLevel;
  mentalModel: string | null;
  commonErrors: string[] | null;
  lastSummary: SessionSummary | null;
  isNewTopic: boolean;
  sessionCount: number;
  sessionIntent?: "reinforce" | "go_deeper";
  daysSinceLastSession?: number;
}

function loadCoachTemplate(mode: CoachMode): string {
  const filename = mode === "audio" ? "coach-audio.md" : "coach-text.md";
  const filePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "prompts",
    filename
  );
  return fs.readFileSync(filePath, "utf-8");
}

function buildDynamicSections(ctx: CoachContext): {
  knownErrorRouting: string;
  userContext: string;
  topicContext: string;
  sessionObjective: string;
} {
  const levelLabel = DEPTH_LABELS[ctx.currentLevel];
  const targetLevel = Math.min(ctx.currentLevel + 1, 5) as DepthLevel;
  const targetLabel = DEPTH_LABELS[targetLevel];

  const knownErrorRouting = ctx.commonErrors?.length
    ? `This user has recurring error patterns: ${ctx.commonErrors.join("; ")}. Weight your activity selection toward these failure modes. Design questions that specifically probe these patterns — do not treat them as background information. The session should create at least one moment that tests each known error directly.`
    : "No known error patterns yet.";

  const userContext = ctx.userProfile
    ? `Name: ${ctx.userProfile.name || "Unknown"}
Role: ${ctx.userProfile.role || "Unknown"}
Background: ${ctx.userProfile.background || ctx.userProfile.expertise_domain || "Unknown"}
Goal: ${ctx.userProfile.goal || ctx.userProfile.winning_definition || "Not specified"}
Gap: ${ctx.userProfile.gap || "Not specified"}`
    : "No profile available yet.";

  let topicContext = `Topic: ${ctx.topicName}
Current depth level: ${ctx.currentLevel} — ${levelLabel}
${ctx.isNewTopic ? "This is a NEW topic. The user has no prior sessions on this." : `This is a RETURNING topic. Session ${ctx.sessionCount}.`}`;
  if (
    ctx.daysSinceLastSession !== undefined &&
    ctx.daysSinceLastSession > 7
  ) {
    topicContext += `\nLast session was ${ctx.daysSinceLastSession} days ago. Treat recorded level as potentially decayed — start the audit one level below recorded (Level ${Math.max(ctx.currentLevel - 1, 1)}) to verify retention before assuming it holds.`;
  }
  if (ctx.mentalModel) {
    topicContext += `\nLast mental model (user's own words): "${ctx.mentalModel}"`;
  } else {
    topicContext += "\nNo mental model recorded yet.";
  }
  if (ctx.lastSummary) {
    topicContext += `
Last session covered: ${ctx.lastSummary.what_covered.join(", ")}
Where they broke down: ${ctx.lastSummary.where_broke_down.join(", ")}`;
  }

  const sessionObjective = ctx.isNewTopic
    ? `New topic. Start with a diagnostic question that requires prediction or mechanism — not description. The question must be impossible to answer with surface recall alone. Understand what the user already knows before beginning the audit. If the user message is exactly "__START_SESSION__", they have just landed on the page; respond with your first diagnostic question as if they said they're ready to begin. Include any source content (passage, diagram, code) directly in your questions when needed — never ask them to "go look it up."`
    : ctx.sessionIntent === "go_deeper"
      ? `Target today: reach Level ${targetLevel} — ${targetLabel}. The user clicked "Go deeper". First present a focus-choice step: reference prior session (weak areas, new material) and ask: "Want to strengthen those edge cases first, move into new material, or split the session?" Then proceed based on their choice. If the user message is exactly "__START_SESSION__", they have just clicked Go deeper; present this focus-choice question.`
      : `Target today: reach Level ${targetLevel} — ${targetLabel}. The user clicked "Reinforce" (or sessionIntent is undefined). Go straight into the audit. Start by acknowledging where the user is (Level ${ctx.currentLevel}: ${levelLabel}), then begin the Understanding Audit at their current level to verify retention before pushing forward. If the user message is exactly "__START_SESSION__", they have just clicked Reinforce; acknowledge their level and start the session with your first question.`;

  return {
    knownErrorRouting,
    userContext,
    topicContext,
    sessionObjective,
  };
}

export function buildCoachSystemPrompt(
  ctx: CoachContext,
  mode: CoachMode = "text"
): string {
  const template = loadCoachTemplate(mode);
  const sections = buildDynamicSections(ctx);

  return template
    .replace("{{KNOWN_ERROR_ROUTING}}", sections.knownErrorRouting)
    .replace("{{USER_CONTEXT}}", sections.userContext)
    .replace("{{TOPIC_CONTEXT}}", sections.topicContext)
    .replace("{{SESSION_OBJECTIVE}}", sections.sessionObjective);
}
