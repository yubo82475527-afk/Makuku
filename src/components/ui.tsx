import { clsx } from "clsx";
import type { ReactNode } from "react";
import { severityClass } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx("rounded-lg border border-slate-200 bg-white p-4 shadow-sm", className)}>{children}</section>;
}

export function MetricCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </Card>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  const toneClass =
    tone === "neutral"
      ? "bg-slate-100 text-slate-700 ring-slate-200"
      : severityClass(tone);
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1", toneClass)}>
      {children}
    </span>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500",
        props.className,
      )}
    />
  );
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500",
        props.className,
      )}
    />
  );
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
        props.className,
      )}
    />
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{text}</div>;
}

export function DataNotice({ error, dict }: { error?: string | null; dict: Dictionary }) {
  if (!error) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {dict.app.dataNotice} {error}
    </div>
  );
}
