"use client";

import { useContext, useEffect } from "react";
import { AppShellContext, type HeaderUser } from "@/components/app-shell";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

export function PageShellState({
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
  const shellContext = useContext(AppShellContext);
  const setShellState = shellContext?.setShellState;

  useEffect(() => {
    setShellState?.({ title, currentPath, isDemo, headerUser });
  }, [currentPath, headerUser, isDemo, setShellState, title]);

  return null;
}
