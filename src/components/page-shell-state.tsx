"use client";

import { AppShell, type HeaderUser } from "@/components/app-shell";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function PageShellState({
  locale,
  dict,
  title,
  currentPath,
  isDemo,
  headerUser,
}: {
  locale: Locale;
  dict: Dictionary;
  title: string;
  currentPath: string;
  isDemo?: boolean;
  headerUser?: HeaderUser | null;
}) {
  return (
    <AppShell
      locale={locale}
      dict={dict}
      title={title}
      currentPath={currentPath}
      isDemo={isDemo}
      headerUser={headerUser}
    >
      {null}
    </AppShell>
  );
}
