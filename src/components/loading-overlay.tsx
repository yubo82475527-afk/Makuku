"use client";

type LoadingOverlayProps = {
  open: boolean;
  title: string;
  description?: string;
};

export function LoadingOverlay({ open, title, description }: LoadingOverlayProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-6">
      <div className="w-full max-w-xs rounded-2xl bg-white px-5 py-4 text-center shadow-2xl">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        <div className="mt-4 text-base font-semibold text-slate-900">{title}</div>
        {description ? <div className="mt-1 text-sm text-slate-500">{description}</div> : null}
      </div>
    </div>
  );
}
