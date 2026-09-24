import { catalogNotFound } from "../../../lib/catalogNotFound"
import { parseLocale } from "../../../lib/i18n/config"

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  return catalogNotFound(parseLocale((await params).locale), undefined, request.method === "HEAD")
}
export const HEAD = GET
