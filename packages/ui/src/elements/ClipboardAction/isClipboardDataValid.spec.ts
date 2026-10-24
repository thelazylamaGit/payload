import type { ClientBlock } from 'payload'

import { describe, expect, it } from 'vitest'

import type { ClipboardPasteActionValidateArgs } from './types.js'

import { isClipboardDataValid } from './isClipboardDataValid.js'

const content: ClientBlock = {
  slug: 'content',
  fields: [{ name: 'body', type: 'richText' }],
}
const hero: ClientBlock = { slug: 'hero', fields: [{ name: 'title', type: 'text' }] }

function copiedRow(): ClipboardPasteActionValidateArgs {
  return {
    type: 'blocks',
    blocks: [content, hero],
    data: { 'source.1.blockType': { valid: true, value: 'content' } },
    fieldPath: 'destination',
    path: 'source',
    rowIndex: 1,
    schemaBlocks: [content],
  }
}

describe('individual block clipboard compatibility', () => {
  it('should accept a selected block despite unrelated source block schemas', () => {
    expect(isClipboardDataValid(copiedRow())).toBe(true)
  })

  it('should reject a selected block absent from the destination', () => {
    expect(isClipboardDataValid({ ...copiedRow(), schemaBlocks: [hero] })).toBe(false)
  })

  it('should reject incompatible fields on the selected block', () => {
    expect(
      isClipboardDataValid({
        ...copiedRow(),
        schemaBlocks: [{ slug: 'content', fields: [{ name: 'body', type: 'text' }] }],
      }),
    ).toBe(false)
  })

  it('should reject a selected block missing its source schema', () => {
    expect(isClipboardDataValid({ ...copiedRow(), blocks: [hero] })).toBe(false)
  })

  it('should reject row data without a block type', () => {
    expect(isClipboardDataValid({ ...copiedRow(), data: {} })).toBe(false)
  })

  it('should retain schema checks for every block in a whole-field copy', () => {
    expect(isClipboardDataValid({ ...copiedRow(), rowIndex: undefined })).toBe(false)
    expect(
      isClipboardDataValid({
        ...copiedRow(),
        rowIndex: undefined,
        schemaBlocks: [content, hero],
      }),
    ).toBe(true)
  })

  it('should retain nested field compatibility checks', () => {
    const source: ClientBlock = {
      slug: 'content',
      fields: [{ name: 'items', type: 'array', fields: [{ name: 'value', type: 'text' }] }],
    }
    const destination: ClientBlock = {
      slug: 'content',
      fields: [{ name: 'items', type: 'array', fields: [{ name: 'value', type: 'number' }] }],
    }

    expect(
      isClipboardDataValid({ ...copiedRow(), blocks: [source, hero], schemaBlocks: [destination] }),
    ).toBe(false)
  })

  it('should retain ordinary Array row schema validation', () => {
    const fields = [{ name: 'text', type: 'text' as const }]

    expect(
      isClipboardDataValid({
        type: 'array',
        data: {},
        fields,
        fieldPath: 'destination',
        path: 'source',
        rowIndex: 0,
        schemaFields: fields,
      }),
    ).toBe(true)
    expect(
      isClipboardDataValid({
        type: 'array',
        data: {},
        fields,
        fieldPath: 'destination',
        path: 'source',
        rowIndex: 0,
        schemaFields: [{ name: 'text', type: 'number' }],
      }),
    ).toBe(false)
  })
  it('should accept identical source and destination allowed-block lists', () => {
    expect(isClipboardDataValid({ ...copiedRow(), schemaBlocks: [content, hero] })).toBe(true)
  })

  it.each([
    null,
    [],
    {},
    { data: {} },
    { ...copiedRow(), rowIndex: -1 },
    { ...copiedRow(), rowIndex: 0.5 },
    { ...copiedRow(), blocks: null },
    { ...copiedRow(), blocks: [null] },
    { ...copiedRow(), data: null },
  ])('should reject malformed clipboard payloads safely: %j', (value) => {
    expect(isClipboardDataValid((value ?? {}) as any)).toBe(false)
  })

  it('should reject a structural change inside a named tab', () => {
    const block = (type: 'text' | 'number'): ClientBlock => ({
      slug: 'content',
      fields: [
        {
          type: 'tabs',
          tabs: [{ name: 'main', label: 'Main', fields: [{ name: 'value', type }] }],
        },
      ],
    })
    expect(
      isClipboardDataValid({
        ...copiedRow(),
        blocks: [block('text')],
        schemaBlocks: [block('number')],
      }),
    ).toBe(false)
  })

  it('should reject incompatible nested block definitions with matching slugs', () => {
    const block = (type: 'text' | 'number'): ClientBlock => ({
      slug: 'content',
      fields: [
        {
          name: 'children',
          type: 'blocks',
          blocks: [{ slug: 'child', fields: [{ name: 'value', type }] }],
        },
      ],
    })
    expect(
      isClipboardDataValid({
        ...copiedRow(),
        blocks: [block('text')],
        schemaBlocks: [block('number')],
      }),
    ).toBe(false)
  })
})
