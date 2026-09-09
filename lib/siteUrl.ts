// Only the public origin belongs in metadata. Never use a database/API URL here.
export function getSiteUrl(value = process.env.SITE_URL): string {
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("SITE_URL obrigatória em produção")
    return "http://localhost:3000"
  }
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error()
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !local) throw new Error()
    return url.origin
  } catch {
    throw new Error("SITE_URL deve ser uma origem HTTPS sem credenciais, caminho, query ou fragmento (HTTP apenas em localhost)")
  }
}
