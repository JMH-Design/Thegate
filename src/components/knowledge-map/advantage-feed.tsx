import { TopicWithBenchmark, DEPTH_LABELS, DepthLevel } from "@/lib/types";

interface AdvantageCardProps {
  topic: TopicWithBenchmark;
}

export function AdvantageCard({ topic }: AdvantageCardProps) {
  const nextLevel = Math.min(topic.current_depth_level + 1, 5) as DepthLevel;
  const needsReview =
    topic.last_tested_at &&
    Date.now() - new Date(topic.last_tested_at).getTime() >
      14 * 24 * 60 * 60 * 1000;

  if (needsReview) {
    return (
      <div className="p-4 bg-bg-secondary rounded-[--radius-card] border border-border-subtle">
        <p className="text-sm text-text-secondary">
          You haven&apos;t tested{" "}
          <span className="text-text-primary-soft font-medium">
            {topic.name}
          </span>{" "}
          in over 2 weeks. Depth levels decay without retrieval.{" "}
          <span className="text-gold-link cursor-pointer hover:underline">
            Pick it up.
          </span>
        </p>
      </div>
    );
  }

  if (topic.benchmark && topic.room_position === "below") {
    return (
      <div className="p-4 bg-bg-secondary rounded-[--radius-card] border border-border-subtle">
        <p className="text-sm text-text-secondary">
          You&apos;re at Level {topic.current_depth_level} on{" "}
          <span className="text-text-primary-soft font-medium">
            {topic.name}
          </span>
          . {topic.benchmark.description} Level {nextLevel} is{" "}
          {DEPTH_LABELS[nextLevel]} — where real leverage begins.
          {topic.benchmark.source_name && (
            <span className="text-text-dim text-xs ml-1">
              [Source: {topic.benchmark.source_name}]
            </span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-bg-secondary rounded-[--radius-card] border border-border-subtle">
      <p className="text-sm text-text-secondary">
        <span className="text-text-primary-soft font-medium">
          {topic.name}
        </span>{" "}
        — Level {topic.current_depth_level} ({DEPTH_LABELS[topic.current_depth_level]}).
        {topic.current_depth_level < 5
          ? ` Level ${nextLevel} unlocks ${DEPTH_LABELS[nextLevel]}.`
          : " You've reached Generation level. Maintain it through regular retrieval."}
      </p>
    </div>
  );
}
