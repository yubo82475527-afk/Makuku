import { PageShellState } from "@/components/page-shell-state";
import { UsageAssistantKnowledgeAdmin } from "@/components/usage-assistant-knowledge-admin";
import { getPageI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function UsageAssistantKnowledgePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale, dict } = await getPageI18n(params);
  const isZh = locale === "zh";

  return (
    <>
      <PageShellState
        locale={locale}
        dict={dict}
        title={isZh ? "使用助手知识库" : "Usage Assistant KB"}
        currentPath="/usage-assistant-knowledge"
      />
      <UsageAssistantKnowledgeAdmin locale={locale} />
    </>
  );
}
