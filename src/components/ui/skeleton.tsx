interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-surface rounded-md animate-skeleton ${className}`}
      aria-hidden="true"
    />
  );
}

export function TopicCardSkeleton() {
  return (
    <div className="bg-surface rounded-[--radius-card] p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-5 w-28 rounded-full" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-start">
        <div className="max-w-[85%] space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
    </div>
  );
}
