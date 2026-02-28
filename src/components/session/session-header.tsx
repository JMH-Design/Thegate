import { DepthLevel, DEPTH_LABELS } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

interface SessionHeaderProps {
  topicName: string;
  currentLevel: DepthLevel;
  targetLevel: DepthLevel;
  sessionNumber: number;
  onBack: () => void;
}

export function SessionHeader({
  topicName,
  currentLevel,
  targetLevel,
  sessionNumber,
  onBack,
}: SessionHeaderProps) {
  return (
    <header className="border-b border-border-subtle bg-bg-primary/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary-soft transition-colors duration-fast"
          aria-label="Back to map"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="text-center">
          <span className="text-xs text-text-dim">
            Level {currentLevel} → {targetLevel}
          </span>
          <div className="text-sm font-medium text-text-primary-soft">
            {DEPTH_LABELS[currentLevel]}{" "}
            <span className="text-text-dim mx-1">→</span>{" "}
            <span className="text-gold">{DEPTH_LABELS[targetLevel]}</span>
          </div>
        </div>

        <span className="text-xs text-text-dim">
          Session {sessionNumber}
        </span>
      </div>
    </header>
  );
}
