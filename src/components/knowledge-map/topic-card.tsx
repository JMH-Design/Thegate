"use client";

import { useRouter } from "next/navigation";
import { TopicWithBenchmark, DEPTH_LABELS, STATUS_LABELS } from "@/lib/types";
import { formatLastTestedDate } from "@/lib/date-utils";
import { DepthBadge } from "./depth-badge";
import { RoomMarker } from "./room-marker";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";

interface TopicCardProps {
  topic: TopicWithBenchmark;
}

const statusStyles = {
  needs_review: "text-amber-400 bg-amber-400/10",
  developing: "text-gold bg-gold/10",
  strong: "text-success bg-success/10",
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
            {STATUS_LABELS[topic.status]}
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
            {formatLastTestedDate(topic.last_tested_at, "Never tested")}
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
