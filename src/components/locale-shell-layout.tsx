"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell, type HeaderUser } from "@/components/app-shell";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

function shouldBypassShell(pathname: string) {
  return /\/(login|mobile\/offline-capture)(\/|$)/.test(pathname);
}

export function LocaleShellLayout({
  locale,
  dict,
  headerUser,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  headerUser?: HeaderUser | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (shouldBypassShell(pathname)) {
    return <>{children}</>;
  }

  return (
    <AppShell
      locale={locale}
      dict={dict}
      title={dict.app.name}
      currentPath="/dashboard"
      headerUser={headerUser}
    >
      {children}
    </AppShell>
  );
}
