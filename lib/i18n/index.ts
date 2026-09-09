import { pt, type MessageKey } from "./dictionaries/pt"
import { en } from "./dictionaries/en"
import type { Locale } from "./config"
export { localeTags, localizedHref, type Locale, type LocaleProps } from "./config"
export const dictionaries = { pt, en } as const
export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token)
}
