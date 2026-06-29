export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="h-64 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-6 w-56 animate-pulse rounded bg-slate-100" />
        <div className="h-56 animate-pulse rounded-md bg-slate-100" />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-6 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-48 animate-pulse rounded-md bg-slate-100" />
      </div>
    </div>
  );
}
