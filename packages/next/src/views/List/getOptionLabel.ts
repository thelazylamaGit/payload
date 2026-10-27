import type { I18n } from '@payloadcms/translations'
import type { Option } from 'payload'

import { getTranslation } from '@payloadcms/translations'

/**
 * Returns the translated label of the select or radio option matching `value`.
 * Falls back to the raw value when no option matches or the label does not resolve to a string.
 */
export const getOptionLabel = ({
  i18n,
  options,
  value,
}: {
  i18n: Pick<I18n, 'fallbackLanguage' | 'language' | 't'>
  options: Option[]
  value: unknown
}): string => {
  const option = options?.find((option) =>
    typeof option === 'string' ? option === value : option.value === value,
  )

  if (option && typeof option === 'object') {
    const label = getTranslation(option.label, i18n)

    if (typeof label === 'string') {
      return label
    }
  }

  return String(value)
}
