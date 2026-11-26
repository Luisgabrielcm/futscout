import type { Locale } from '../../lib/i18n'
import { estimateNoticeRequired } from '../../lib/economicData/estimateNotice'

export default function EstimatedValueNote({ provider, value, required = false, locale = 'pt' }: {
  required?: boolean; provider?: string; value: number | null | undefined; locale?: Locale;
}) {
  if (!(estimateNoticeRequired || required) || provider !== 'FUTSCOUT_VALUE' || value == null) return null
  return <small className="estimatedValueNote" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400 }}>
    {locale === 'en' ? 'Estimated statistical data' : 'Dados estatísticos estimados'}
  </small>
}
