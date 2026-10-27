import type { Option } from 'payload'

import { describe, expect, it } from 'vitest'

import { getOptionLabel } from './getOptionLabel.js'

const i18n = { fallbackLanguage: 'en', language: 'de', t: (key: string) => key } as Parameters<
  typeof getOptionLabel
>[0]['i18n']

const options: Option[] = [
  { label: 'Blog', value: 'blog' },
  { label: { de: 'Nachrichten', en: 'News' }, value: 'news' },
  { label: ({ t }) => t('custom:event'), value: 'event' },
  'plain',
]

describe('getOptionLabel', () => {
  it('should return the option label instead of the stored value', () => {
    expect(getOptionLabel({ i18n, options, value: 'blog' })).toBe('Blog')
  })

  it('should return the localized option label', () => {
    expect(getOptionLabel({ i18n, options, value: 'news' })).toBe('Nachrichten')
  })

  it('should resolve option label functions', () => {
    expect(getOptionLabel({ i18n, options, value: 'event' })).toBe('custom:event')
  })

  it('should return the value for string options', () => {
    expect(getOptionLabel({ i18n, options, value: 'plain' })).toBe('plain')
  })

  it('should fall back to the raw value when no option matches', () => {
    expect(getOptionLabel({ i18n, options, value: 'archived' })).toBe('archived')
  })
})
