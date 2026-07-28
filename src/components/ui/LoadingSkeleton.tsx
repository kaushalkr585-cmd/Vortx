// ============================================================
// VORTX — LoadingSkeleton Component
// ============================================================

import { cn } from '../../lib/utils';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

export function MediaPreviewSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse" aria-label="Loading media info...">
      {/* Thumbnail */}
      <Skeleton className="w-36 h-24 rounded-xl flex-shrink-0" />

      {/* Info */}
      <div className="flex-1 flex flex-col gap-3 pt-1">
        <Skeleton className="h-4 w-4/5 rounded" />
        <Skeleton className="h-4 w-3/5 rounded" />
        <div className="flex gap-2 mt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ResolutionSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}
