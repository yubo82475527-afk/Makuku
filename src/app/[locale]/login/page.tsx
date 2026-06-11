import { PcLoginForm } from "@/components/pc-login-form";
import { getPageI18n } from "@/lib/i18n/server";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await getPageI18n(params);
  const isZh = locale === "zh";
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          {isZh ? "Makuku 后台" : "Makuku Console"}
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          {isZh ? "登录后台" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {isZh ? "仅 manager / admin 账号可以进入 PC 后台。" : "Only manager or admin accounts can access the PC console."}
        </p>
        <PcLoginForm locale={locale} />
      </section>
    </main>
  );
}

