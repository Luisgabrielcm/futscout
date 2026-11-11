// Canonical fixed-scale decimal text, with no binary floating-point conversion.
// Reject precision loss instead of rounding. Exponents are bounded before work.
export function canonicalEconomicDecimal(text: string, scale = 18): string {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 18) throw Error('ECONOMIC_DECIMAL_SCALE')
  const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text)
  if (!match || text.length > 128) throw Error('ECONOMIC_DECIMAL_TEXT')
  const fraction = match[2] ?? '', exponent = BigInt(match[3] ?? '0')
  if (exponent < -BigInt(100) || exponent > BigInt(100)) throw Error('ECONOMIC_DECIMAL_EXPONENT')
  const coefficient = BigInt(match[1] + fraction)
  const shift = exponent + BigInt(scale) - BigInt(fraction.length)
  let scaled: bigint
  if (shift >= BigInt(0)) scaled = coefficient * BigInt(10) ** shift
  else {
    const divisor = BigInt(10) ** -shift
    if (coefficient % divisor !== BigInt(0)) throw Error('ECONOMIC_DECIMAL_PRECISION_LOSS')
    scaled = coefficient / divisor
  }
  if (scaled.toString().length > 38) throw Error('ECONOMIC_DECIMAL_OVERFLOW')
  if (!scale) return scaled.toString()
  const digits = scaled.toString().padStart(scale + 1, '0')
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}
