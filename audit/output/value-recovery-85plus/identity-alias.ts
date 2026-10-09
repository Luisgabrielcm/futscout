import { getCountryFlag } from '../../../lib/countryFlags'
export function recoveryNationality(value: string) {
  return getCountryFlag(value)?.code === 'NL' ? 'NL' : value
}
