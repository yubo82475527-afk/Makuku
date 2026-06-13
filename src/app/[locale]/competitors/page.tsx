import { redirect } from "next/navigation";

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/competitor-products`);
}
