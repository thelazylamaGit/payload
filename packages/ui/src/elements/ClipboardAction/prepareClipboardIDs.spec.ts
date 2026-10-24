import type { Field, FieldSchemaMap, SanitizedConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { mergeFormStateFromClipboard } from './mergeFormStateFromClipboard.js'
import { prepareClipboardIDs } from './prepareClipboardIDs.js'

const embedded: Field[] = [
  { name: 'items', type: 'array', fields: [{ name: 'title', type: 'text' }] },
  { name: 'nested', type: 'blocks', blocks: [], blockReferences: ['nested'] },
  { name: 'relationship', type: 'relationship', relationTo: 'pages' },
  { name: 'upload', type: 'upload', relationTo: 'media' },
  { name: 'settings', type: 'group', fields: [{ name: 'id', type: 'text' }] },
]
const fields: Field[] = [{ name: 'body', type: 'richText' }]
const config = {
  blocks: [{ slug: 'nested', fields: [{ name: 'value', type: 'text' }] }],
} as SanitizedConfig
const schemaMap: FieldSchemaMap = new Map([
  ['pages.layout.accordion.body', fields[0]],
  [
    'pages.layout.accordion.body.lexical_internal_feature.blocks.lexical_blocks.panel.fields',
    { fields: embedded },
  ],
  [
    'pages.layout.accordion.body.lexical_internal_feature.blocks.lexical_inline_blocks.panel.fields',
    { fields: embedded },
  ],
])
function data(type = 'block') {
  return {
    id: 'old-row',
    body: {
      root: {
        type: 'root',
        children: [
          {
            type,
            fields: {
              id: 'old-embedded',
              blockType: 'panel',
              items: [{ id: 'old-item', title: 'unsaved' }],
              nested: [{ id: 'old-nested', blockType: 'nested', value: 'unchanged' }],
              relationship: { id: 'relationship-id' },
              upload: { id: 'upload-id' },
              settings: { id: '0123456789abcdef01234567' },
            },
          },
        ],
      },
    },
  }
}

describe('on-demand structural IDs using native server schemas', () => {
  it('should reproduce the native limitation for IDs inside rich-text JSON', () => {
    const source = data()
    const result = mergeFormStateFromClipboard({
      dataFromClipboard: {
        type: 'blocks',
        blocks: [],
        path: 'source',
        rowIndex: 0,
        data: { 'source.0.body': { value: source.body, valid: true } },
      },
      formState: {},
      path: 'target',
      rowIndex: 0,
    })
    expect(result['target.0.body'].value).toBe(source.body)
    expect(source.body.root.children[0].fields.items[0].id).toBe('old-item')
  })

  it.each(['block', 'inlineBlock'])(
    'should refresh only structural IDs for %s with an off-screen editor',
    (type) => {
      const source = data(type)
      const before = structuredClone(source)
      const result = prepareClipboardIDs({ config, data: source, fields, schemaMap })
      const original = source.body.root.children[0].fields
      const value = result.body.root.children[0].fields
      expect(source).toEqual(before)
      expect(result.id).not.toBe(source.id)
      expect(value.id).not.toBe(original.id)
      expect(value.items[0].id).not.toBe(original.items[0].id)
      expect(value.nested[0].id).not.toBe(original.nested[0].id)
      expect(value.items[0].title).toBe('unsaved')
      expect(value.settings).toEqual(original.settings)
      expect(value.relationship).toEqual(original.relationship)
      expect(value.upload).toEqual(original.upload)
      const again = prepareClipboardIDs({ config, data: source, fields, schemaMap })
      expect(again.body.root.children[0].fields.id).not.toBe(value.id)
    },
  )

  it('should reject unsupported embedded blocks without touching the source', () => {
    const source = data()
    expect(() =>
      prepareClipboardIDs({ config, data: source, fields, schemaMap: new Map() }),
    ).toThrow('does not support')
    expect(source.body.root.children[0].fields.id).toBe('old-embedded')
  })
})
