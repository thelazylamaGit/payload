import { describe, expect, it } from 'vitest'

import { isEmptyValue, isPublishedStatus, isSameDocumentContent } from './documentContent.js'

const ignoredPaths = ['_status', 'createdAt', 'updatedAt']

const fields = [
  { name: '_status', type: 'select' },
  { name: 'updatedAt', type: 'date' },
  { name: 'title', type: 'text', localized: true },
  { name: 'json', type: 'json' },
  { name: 'richText', type: 'richText' },
  {
    type: 'tabs',
    tabs: [
      { name: 'meta', fields: [{ name: 'description', type: 'textarea' }] },
      { fields: [{ type: 'row', fields: [{ name: 'subtitle', type: 'text' }] }] },
    ],
  },
  { name: 'list', type: 'array', fields: [{ name: 'text', type: 'text' }] },
  {
    name: 'layout',
    type: 'blocks',
    blockReferences: ['quote'],
    blocks: [],
  },
]

const blocks = { quote: { slug: 'quote', fields: [{ name: 'text', type: 'text' }] } }

const isSame = (a: Record<string, unknown>, b: Record<string, unknown>, localeCodes?: string[]) =>
  isSameDocumentContent({ a, b, blocks, fields, ignoredPaths, localeCodes })

describe('isSameDocumentContent', () => {
  it('should ignore status and timestamps', () => {
    expect(
      isSame(
        { _status: 'draft', title: 'a', updatedAt: '1' },
        { _status: 'published', title: 'a', updatedAt: '2' },
      ),
    ).toBe(true)
  })

  it('should treat empty field values and empty rich text as missing', () => {
    expect(
      isSame(
        {
          list: [],
          meta: { description: '' },
          richText: { root: { type: 'root', children: [{ type: 'paragraph', children: [] }] } },
          subtitle: '',
        },
        { meta: { description: null }, richText: null },
      ),
    ).toBe(true)
  })

  it('should compare data within JSON values exactly', () => {
    expect(isSame({ json: { items: [] } }, { json: {} })).toBe(false)
    expect(isSame({ json: { a: '' } }, { json: { a: null } })).toBe(false)
    expect(isSame({ json: {} }, { json: {} })).toBe(true)
  })

  it('should compare fields within tabs, rows, arrays and referenced blocks', () => {
    expect(isSame({ meta: { description: 'a' } }, { meta: { description: 'b' } })).toBe(false)
    expect(isSame({ subtitle: 'a' }, { subtitle: 'b' })).toBe(false)
    expect(isSame({ list: [{ id: '1', text: 'a' }] }, { list: [{ id: '1', text: 'b' }] })).toBe(
      false,
    )
    expect(
      isSame(
        { layout: [{ id: '1', blockType: 'quote', text: '' }] },
        { layout: [{ id: '1', blockType: 'quote', text: null }] },
      ),
    ).toBe(true)
    expect(
      isSame(
        { layout: [{ id: '1', blockType: 'quote', text: 'a' }] },
        { layout: [{ id: '1', blockType: 'quote', text: 'b' }] },
      ),
    ).toBe(false)
  })

  it('should treat an added row as a change', () => {
    expect(isSame({ list: [{ id: '1' }] }, { list: [] })).toBe(false)
  })

  it('should compare every locale of localized fields', () => {
    const localeCodes = ['en', 'es']

    expect(isSame({ title: { en: 'a', es: '' } }, { title: { en: 'a' } }, localeCodes)).toBe(true)
    expect(
      isSame({ title: { en: 'a', es: 'b' } }, { title: { en: 'a', es: 'c' } }, localeCodes),
    ).toBe(false)
  })
})

describe('isEmptyValue', () => {
  it('should only treat whole empty values as empty', () => {
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue(null)).toBe(true)
    expect(isEmptyValue({})).toBe(false)
    expect(isEmptyValue(0)).toBe(false)
    expect(isEmptyValue(false)).toBe(false)
  })
})

describe('isPublishedStatus', () => {
  it('should require all locales to be published', () => {
    expect(isPublishedStatus('published')).toBe(true)
    expect(isPublishedStatus({ en: 'published', es: 'published' })).toBe(true)
    expect(isPublishedStatus({ en: 'published', es: 'draft' })).toBe(false)
    expect(isPublishedStatus('draft')).toBe(false)
    expect(isPublishedStatus(undefined)).toBe(false)
  })
})
