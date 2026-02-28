"use client";

import { useState } from "react";
import { Benchmark, RoomPosition } from "@/lib/types";

interface RoomMarkerProps {
  position: RoomPosition;
  benchmark: Benchmark;
}

const positionStyles: Record<RoomPosition, { label: string; color: string }> = {
  ahead: { label: "Ahead of the room", color: "text-success" },
  at_par: { label: "At par with the room", color: "text-gold" },
  below: { label: "Below the room", color: "text-text-muted" },
};

export function RoomMarker({ position, benchmark }: RoomMarkerProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = positionStyles[position];

  return (
    <span
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`text-xs ${config.color} cursor-help`}>
        {config.label}
      </span>
      {showTooltip && (
        <span className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-surface-active border border-border rounded-[--radius-card] text-xs text-text-secondary shadow-lg z-50">
          <span className="block font-medium text-text-primary-soft mb-1">
            Room Benchmark: Level {benchmark.benchmark_level}
          </span>
          <span className="block mb-1">{benchmark.description}</span>
          <span className="block text-text-dim">
            Source:{" "}
            <a
              href={benchmark.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-link hover:underline"
            >
              {benchmark.source_name}
            </a>
          </span>
        </span>
      )}
    </span>
  );
}
