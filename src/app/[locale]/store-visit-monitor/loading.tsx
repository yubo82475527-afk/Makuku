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
            <div className="text-sm font-semibold text-slate-900">Store Visit Monitor</div>
            <SkeletonBlock className="mt-2 h-4 w-44" />
          </div>
          <SkeletonBlock className="h-9 w-32" />
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card key={index}>
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-3 h-7 w-16" />
          </Card>
        ))}
      </div>

      <Card>
        <SkeletonBlock className="h-5 w-40" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16" />
          ))}
        </div>
      </Card>

      <Card>
        <SkeletonBlock className="h-9 w-full" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
