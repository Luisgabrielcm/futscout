import { redirect } from "next/navigation"
import { localizedHref } from "../../../../../lib/i18n"
import { requireLocale } from "../../../../../lib/i18n/server"

type HistoryPageProps = { params: Promise<{ slug: string; locale?: string }> }

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { slug, locale: routeLocale } = await params
  const locale = requireLocale(routeLocale ?? "pt")
  redirect(localizedHref(locale, `/jogadores/${encodeURIComponent(slug)}/vida-real`))
}
