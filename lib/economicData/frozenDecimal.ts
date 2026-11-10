// Node 24 JSON source context preserves numeric literals before binary rounding.
export function frozenValueLexemes(json: string) {
  const values = new Map<string, string>()
  JSON.parse(json, function (this: Record<string, unknown>, key: string, value: unknown, context?: { source?: string }) {
    if (key === 'valueEur' && typeof this.playerId === 'string' && 'eaId' in this && 'method' in this && 'type' in this) {
      if (!context?.source || value === null || values.has(this.playerId)) throw Error('FROZEN_DECIMAL_LEXEME_MISSING_OR_DUPLICATE')
      values.set(this.playerId, context.source)
    }
    return value
  })
  return values
}
