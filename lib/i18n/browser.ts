import { localePreferenceCookie, type Locale } from "./config"

// Explicit browser side effect, called only from the language-switch event.
// No cookie is read/written during rendering or module initialization.
export function persistLocalePreference(locale: Locale) {
  document.cookie = localePreferenceCookie(locale, window.location.protocol === "https:")
}
