export function normalizePreferredFoot(
  foot?: string
): "Direito" | "Esquerdo" | undefined {
  if (!foot) {
    return undefined
  }

  const normalized =
    foot.trim().toLowerCase()

  if (
    normalized === "left" ||
    normalized === "esquerdo"
  ) {
    return "Esquerdo"
  }

  if (
    normalized === "right" ||
    normalized === "direito"
  ) {
    return "Direito"
  }

  return undefined
}