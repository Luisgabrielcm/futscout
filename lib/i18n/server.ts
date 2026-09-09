import { notFound } from "next/navigation"
import { isLocale, type Locale } from "./config"

// Pure validation of resolved route params: no cookies, database or network.
export function requireLocale(value: unknown): Locale {
  if (!isLocale(value)) notFound()
  return value
}
