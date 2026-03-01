import { SessionSummary as SessionSummaryType } from "@/lib/types";

interface SessionSummaryProps {
  summary: SessionSummaryType;
}

export function SessionSummaryView({ summary }: SessionSummaryProps) {
  return (
    <div className="space-y-6">
      {summary.what_covered.length > 0 && (
        <div>
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            What You Built Today
          </h3>
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
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            What You Got Right
          </h3>
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
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            Where You Broke Down
          </h3>
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
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            Where You Are Now
          </h3>
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
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            Core Concepts to Lock In
          </h3>
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
          <h3 className="text-xs text-text-dim uppercase tracking-widest font-semibold mb-3">
            Next Session
          </h3>
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
