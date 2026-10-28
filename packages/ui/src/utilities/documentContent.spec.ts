import { describe, expect, it } from 'vitest'

import { isPublishedStatus, isSameDocumentContent } from './documentContent.js'

const ignoredPaths = ['_status', 'createdAt', 'updatedAt']

describe('isSameDocumentContent', () => {
  it('should ignore status and timestamps', () => {
    expect(
      isSameDocumentContent({
        a: { _status: 'draft', title: 'a', updatedAt: '1' },
        b: { _status: 'published', title: 'a', updatedAt: '2' },
        ignoredPaths,
      }),
    ).toBe(true)
  })

  it('should treat empty values and empty rich text as missing', () => {
    expect(
      isSameDocumentContent({
        a: {
          array: [],
          group: { text: '' },
          richText: { root: { type: 'root', children: [{ type: 'paragraph', children: [] }] } },
        },
        b: { group: { text: null }, richText: null },
        ignoredPaths,
      }),
    ).toBe(true)
  })

  it('should detect nested and localized differences', () => {
    expect(
      isSameDocumentContent({
        a: { title: { de: 'b', en: 'a' } },
        b: { title: { de: 'c', en: 'a' } },
        ignoredPaths,
      }),
    ).toBe(false)
  })

  it('should keep the position of empty array items', () => {
    expect(
      isSameDocumentContent({
        a: { list: [{ text: '' }, { text: 'a' }] },
        b: { list: [{ text: 'a' }] },
        ignoredPaths,
      }),
    ).toBe(false)
  })
})

describe('isPublishedStatus', () => {
  it('should require all locales to be published', () => {
    expect(isPublishedStatus('published')).toBe(true)
    expect(isPublishedStatus({ de: 'published', en: 'published' })).toBe(true)
    expect(isPublishedStatus({ de: 'draft', en: 'published' })).toBe(false)
    expect(isPublishedStatus('draft')).toBe(false)
    expect(isPublishedStatus(undefined)).toBe(false)
  })
})
