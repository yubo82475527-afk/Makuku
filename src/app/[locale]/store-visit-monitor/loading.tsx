import { Card } from "@/components/ui";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;
}

export default function StoreVisitMonitorLoading() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SkeletonBlock className="h-5 w-28" />
            <SkeletonBlock className="mt-2 h-4 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-32" />
        </div>
      </Card>

      <Card>
        <SkeletonBlock className="h-9 w-full" />
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <SkeletonBlock className="h-5 w-36" />
            <SkeletonBlock className="mt-2 h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-28" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
