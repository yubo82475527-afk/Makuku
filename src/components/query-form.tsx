"use client";

import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormHTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useTransition } from "react";
import { Button } from "@/components/ui";

const QueryFormPendingContext = createContext(false);

type QueryFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  children: ReactNode;
};

export function QueryForm({ children, className, ...props }: QueryFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <QueryFormPendingContext.Provider value={pending}>
      <form
        {...props}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const nextParams = new URLSearchParams();
          for (const [key, value] of formData.entries()) {
            const text = typeof value === "string" ? value.trim() : "";
            if (!text) continue;
            nextParams.append(key, text);
          }
          const nextQuery = nextParams.toString();
          const currentQuery = searchParams.toString();
          startTransition(() => {
            if (nextQuery === currentQuery) {
              router.refresh();
              return;
            }
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
          });
        }}
      >
        {children}
      </form>
    </QueryFormPendingContext.Provider>
  );
}

type QuerySubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
};

export function QuerySubmitButton({ idleLabel, pendingLabel, className }: QuerySubmitButtonProps) {
  const pending = useContext(QueryFormPendingContext);

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={clsx(className)}>
      {pending ? (
        <>
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {pendingLabel}
        </>
      ) : idleLabel}
    </Button>
  );
}
