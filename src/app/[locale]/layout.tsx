import { LocaleShellLayout } from "@/components/locale-shell-layout";
import { readSessionFromCookies } from "@/lib/auth-session";
import { getPageI18n } from "@/lib/i18n/server";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale, dict } = await getPageI18n(params);
  const session = await readSessionFromCookies();

  return (
    <LocaleShellLayout
      locale={locale}
      dict={dict}
      headerUser={session ? { displayName: session.displayName, role: session.role } : null}
    >
      {children}
    </LocaleShellLayout>
  );
}
