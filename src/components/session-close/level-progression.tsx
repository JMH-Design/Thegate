import { DepthLevel, DEPTH_LABELS } from "@/lib/types";
import { SectionHeader } from "@/components/ui/section-header";

interface LevelProgressionProps {
  before: DepthLevel;
  after: DepthLevel;
}

export function LevelProgression({ before, after }: LevelProgressionProps) {
  const improved = after > before;
  const same = after === before;

  return (
    <div className="py-6">
      <SectionHeader>Level Progression</SectionHeader>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <span className="block text-3xl font-bold text-text-muted">{before}</span>
          <span className="text-xs text-text-dim">{DEPTH_LABELS[before]}</span>
        </div>

        <div className="flex-1 h-px bg-border relative">
          <div
            className={`absolute top-1/2 -translate-y-1/2 h-0.5 transition-all duration-slow ${
              improved ? "bg-gold" : same ? "bg-text-dim" : "bg-danger"
            }`}
            style={{ width: "100%" }}
          />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg">
            {improved ? "→" : same ? "·" : "←"}
          </span>
        </div>

        <div className="text-center">
          <span
            className={`block text-3xl font-bold ${
              improved ? "text-gold" : same ? "text-text-muted" : "text-danger"
            }`}
          >
            {after}
          </span>
          <span className="text-xs text-text-dim">{DEPTH_LABELS[after]}</span>
        </div>
      </div>

      <p className="mt-4 text-sm text-text-secondary text-center">
        {improved
          ? `You moved from ${DEPTH_LABELS[before]} to ${DEPTH_LABELS[after]}. That means you can now ${getCapabilityText(after)}.`
          : same
            ? `You held steady at ${DEPTH_LABELS[after]}. Reinforcement complete.`
            : `Level adjusted to ${DEPTH_LABELS[after]}. The previous level wasn't fully demonstrated this time.`}
      </p>
    </div>
  );
}

function getCapabilityText(level: DepthLevel): string {
  const capabilities: Record<DepthLevel, string> = {
    1: "describe this topic in your own words",
    2: "explain why it works the way it does",
    3: "predict what happens when conditions change",
    4: "diagnose and fix problems in the system",
    5: "create novel applications from this knowledge",
  };
  return capabilities[level];
}
