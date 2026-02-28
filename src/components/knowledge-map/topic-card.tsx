"use client";

import { useRouter } from "next/navigation";
import { TopicWithBenchmark, DEPTH_LABELS } from "@/lib/types";
import { DepthBadge } from "./depth-badge";
import { RoomMarker } from "./room-marker";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

interface TopicCardProps {
  topic: TopicWithBenchmark;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never tested";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const statusStyles = {
  needs_review: "text-amber-400 bg-amber-400/10",
  developing: "text-gold bg-gold/10",
  strong: "text-success bg-success/10",
};

const statusLabels = {
  needs_review: "Needs Review",
  developing: "Developing",
  strong: "Strong",
};

export function TopicCard({ topic }: TopicCardProps) {
  const router = useRouter();

  return (
    <Card
      hoverable
      onClick={() => router.push(`/session/${topic.id}`)}
      className="flex items-center justify-between group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="text-base font-semibold text-text-primary truncate">
            {topic.name}
          </h3>
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyles[topic.status]}`}
          >
            {statusLabels[topic.status]}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <DepthBadge level={topic.current_depth_level} />
          {topic.benchmark && topic.room_position && (
            <RoomMarker
              position={topic.room_position}
              benchmark={topic.benchmark}
            />
          )}
          <span className="text-text-dim text-xs">
            {formatDate(topic.last_tested_at)}
          </span>
        </div>

        {topic.mental_model && (
          <p className="mt-2 text-xs text-text-muted line-clamp-1">
            &ldquo;{topic.mental_model}&rdquo;
          </p>
        )}
      </div>

      <ChevronRight
        size={18}
        className="text-text-dim group-hover:text-text-tertiary transition-colors ml-4 flex-shrink-0"
      />
    </Card>
  );
}
