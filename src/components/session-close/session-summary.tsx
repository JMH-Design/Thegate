import { SessionSummary as SessionSummaryType } from "@/lib/types";
import { SectionHeader } from "@/components/ui/section-header";
import { Volume2, Pause, Play } from "lucide-react";

interface SessionSummaryProps {
  summary: SessionSummaryType;
  isReading?: boolean;
  isPaused?: boolean;
  onToggleRead?: () => void;
}

export function SessionSummaryView({
  summary,
  isReading,
  isPaused,
  onToggleRead,
}: SessionSummaryProps) {
  return (
    <div className="space-y-6">
      {onToggleRead && (
        <div className="flex justify-end">
          <button
            onClick={onToggleRead}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-gold transition-colors duration-fast"
            aria-label={isReading ? (isPaused ? "Resume reading" : "Stop reading") : "Read aloud"}
          >
            {isReading ? (
              isPaused ? (
                <>
                  <Play size={13} />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause size={13} />
                  <span>Pause</span>
                </>
              )
            ) : (
              <>
                <Volume2 size={13} />
                <span>Read aloud</span>
              </>
            )}
          </button>
        </div>
      )}

      {summary.what_covered.length > 0 && (
        <div>
          <SectionHeader className="mb-3">What You Built Today</SectionHeader>
          <ul className="space-y-1.5">
            {summary.what_covered.map((item, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-gold mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.what_correct?.length > 0 && (
        <div>
          <SectionHeader className="mb-3">What You Got Right</SectionHeader>
          <ul className="space-y-1.5">
            {summary.what_correct.map((item, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-gold mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.where_broke_down.length > 0 && (
        <div>
          <SectionHeader className="mb-3">Where You Broke Down</SectionHeader>
          <ul className="space-y-1.5">
            {summary.where_broke_down.map((item, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-text-muted mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(summary.current_level_description || summary.next_level_requires) && (
        <div>
          <SectionHeader className="mb-3">Where You Are Now</SectionHeader>
          <p className="text-sm text-text-secondary leading-relaxed">
            {summary.current_level_description}
            {summary.current_level_description && summary.next_level_requires && " "}
            {summary.next_level_requires && (
              <>
                Here&apos;s what the next level would require: {summary.next_level_requires}
              </>
            )}
          </p>
        </div>
      )}

      {summary.core_concepts && summary.core_concepts.length > 0 && (
        <div>
          <SectionHeader className="mb-3">Core Concepts to Lock In</SectionHeader>
          <ul className="space-y-1.5">
            {summary.core_concepts.map((item, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-gold mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.next_session_focus.length > 0 && (
        <div>
          <SectionHeader className="mb-3">Next Session</SectionHeader>
          <ul className="space-y-1.5">
            {summary.next_session_focus.map((item, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-text-tertiary mt-0.5">·</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function buildSummaryScript(summary: SessionSummaryType): string {
  const parts: string[] = [];

  if (summary.what_covered.length > 0) {
    parts.push(
      "Here's what you built today. " + summary.what_covered.join(". ") + "."
    );
  }

  if (summary.what_correct && summary.what_correct.length > 0) {
    parts.push(
      "What you got right. " + summary.what_correct.join(". ") + "."
    );
  }

  if (summary.where_broke_down.length > 0) {
    parts.push(
      "Where you broke down. " + summary.where_broke_down.join(". ") + "."
    );
  }

  if (summary.current_level_description) {
    let level = "Where you are now. " + summary.current_level_description;
    if (summary.next_level_requires) {
      level +=
        " Here's what the next level would require: " +
        summary.next_level_requires;
    }
    parts.push(level);
  }

  if (summary.core_concepts && summary.core_concepts.length > 0) {
    parts.push(
      "Core concepts to lock in. " + summary.core_concepts.join(". ") + "."
    );
  }

  if (summary.next_session_focus.length > 0) {
    parts.push(
      "For the next session. " + summary.next_session_focus.join(". ") + "."
    );
  }

  return parts.join(" ");
}
