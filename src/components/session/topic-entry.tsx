import { Topic, DEPTH_LABELS } from "@/lib/types";
import { formatLastTestedDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";

interface ReturningTopicEntryProps {
  topic: Topic;
  onReinforce: () => void;
  onGoDeeper: () => void;
  connecting?: boolean;
  connectingError?: string | null;
}

export function ReturningTopicEntry({
  topic,
  onReinforce,
  onGoDeeper,
  connecting = false,
  connectingError = null,
}: ReturningTopicEntryProps) {
  const lastTested = formatLastTestedDate(topic.last_tested_at);

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

      {connectingError && (
        <p className="mb-4 text-sm text-danger">{connectingError}</p>
      )}
      <div className="flex gap-3 justify-center">
        <Button
          variant="secondary"
          onClick={onReinforce}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "Reinforce"}
        </Button>
        <Button
          variant="primary"
          onClick={onGoDeeper}
          disabled={connecting}
        >
          {connecting ? "Connecting..." : "Go deeper →"}
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
