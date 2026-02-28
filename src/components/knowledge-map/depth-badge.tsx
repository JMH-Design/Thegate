import { DepthLevel, DEPTH_LABELS } from "@/lib/types";

interface DepthBadgeProps {
  level: DepthLevel;
  showLabel?: boolean;
}

const levelColors: Record<DepthLevel, string> = {
  1: "bg-text-dim/20 text-text-dim",
  2: "bg-text-muted/20 text-text-muted",
  3: "bg-gold/20 text-gold",
  4: "bg-gold/30 text-gold-focus",
  5: "bg-gold/40 text-gold-link",
};

export function DepthBadge({ level, showLabel = true }: DepthBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${levelColors[level]}`}
    >
      <span className="font-bold">L{level}</span>
      {showLabel && (
        <span className="opacity-80">{DEPTH_LABELS[level]}</span>
      )}
    </span>
  );
}
