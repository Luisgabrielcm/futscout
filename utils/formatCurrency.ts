export function formatCurrency(value: number) {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(0)}M`
  }

  return `€${value.toLocaleString()}`
}