import { Benchmark, DepthLevel, DEPTH_LABELS, getRoomPosition } from "@/lib/types";
import { SectionHeader } from "@/components/ui/section-header";

interface RoomBenchmarkProps {
  userLevel: DepthLevel;
  benchmark: Benchmark | null;
}

export function RoomBenchmark({ userLevel, benchmark }: RoomBenchmarkProps) {
  if (!benchmark) return null;

  const position = getRoomPosition(userLevel, benchmark.benchmark_level);

  return (
    <div className="py-6">
      <SectionHeader>The Room</SectionHeader>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">{benchmark.description}</span>
          <span className="text-text-dim">Level {benchmark.benchmark_level}</span>
        </div>

        <div className="relative h-2 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-surface-active rounded-full"
            style={{ width: `${(benchmark.benchmark_level / 5) * 100}%` }}
          />
          <div
            className={`absolute top-0 h-full rounded-full ${
              position === "ahead"
                ? "bg-gold"
                : position === "at_par"
                  ? "bg-gold/60"
                  : "bg-text-muted"
            }`}
            style={{ width: `${(userLevel / 5) * 100}%` }}
          />
        </div>

        <div className="flex justify-between text-xs">
          <span
            className={
              position === "ahead"
                ? "text-gold"
                : position === "at_par"
                  ? "text-gold"
                  : "text-text-muted"
            }
          >
            You → Level {userLevel}
          </span>
          <span className="text-text-dim">
            {position === "ahead"
              ? "Ahead of the room"
              : position === "at_par"
                ? "At par"
                : "Below the room"}
          </span>
        </div>

        <p className="text-[11px] text-text-dim mt-2">
          Source:{" "}
          <a
            href={benchmark.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-link hover:underline"
          >
            {benchmark.source_name}
          </a>
        </p>
      </div>
    </div>
  );
}
