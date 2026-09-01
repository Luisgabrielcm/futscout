export function getAttributeLevel(value: number) {
  if (value >= 80) {
    return "high"
  }

  if (value >= 60) {
    return "medium"
  }

  return "low"
}