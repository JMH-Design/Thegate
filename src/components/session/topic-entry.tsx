import { Topic, DEPTH_LABELS } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface ReturningTopicEntryProps {
  topic: Topic;
  onReinforce: () => void;
  onGoDeeper: () => void;
}

export function ReturningTopicEntry({
  topic,
  onReinforce,
  onGoDeeper,
}: ReturningTopicEntryProps) {
  const lastTested = topic.last_tested_at
    ? new Date(topic.last_tested_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Never";

  return (
    <div className="max-w-lg mx-auto text-center py-16 px-6">
      <h2 className="text-2xl font-bold text-text-primary mb-1 uppercase tracking-wide">
        {topic.name}
      </h2>
      <div className="w-16 h-px bg-border-subtle mx-auto my-4" />

      <p className="text-sm text-text-secondary mb-1">
        You&apos;re at{" "}
        <span className="text-gold font-semibold">
          Level {topic.current_depth_level} — {DEPTH_LABELS[topic.current_depth_level]}
        </span>
      </p>
      <p className="text-xs text-text-dim mb-6">Last session: {lastTested}</p>

      {topic.mental_model && (
        <div className="bg-bg-secondary rounded-[--radius-card] p-5 mb-8 text-left">
          <p className="text-xs text-text-dim uppercase tracking-widest mb-2 font-semibold">
            What you know
          </p>
          <p className="text-sm text-text-secondary leading-relaxed italic">
            &ldquo;{topic.mental_model}&rdquo;
          </p>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <Button variant="secondary" onClick={onReinforce}>
          Reinforce
        </Button>
        <Button variant="primary" onClick={onGoDeeper}>
          Go deeper →
        </Button>
      </div>
    </div>
  );
}

interface NewTopicEntryProps {
  topicName: string;
}

export function NewTopicEntry({ topicName }: NewTopicEntryProps) {
  return (
    <div className="max-w-lg mx-auto text-center py-16 px-6">
      <h2 className="text-2xl font-bold text-text-primary mb-1 uppercase tracking-wide">
        {topicName}
      </h2>
      <div className="w-16 h-px bg-border-subtle mx-auto my-4" />
      <p className="text-sm text-text-dim">First session</p>
    </div>
  );
}
