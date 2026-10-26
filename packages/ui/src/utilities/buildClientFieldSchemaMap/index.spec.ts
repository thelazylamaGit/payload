import type { I18n } from '@payloadcms/translations'
import type {
  Block,
  ClientBlock,
  ClientConfig,
  ClientField,
  FieldSchemaMap,
  Payload,
  RichTextAdapter,
  RichTextFieldClient,
} from 'payload'

import { describe, expect, it } from 'vitest'

import { buildClientFieldSchemaMap } from './index.js'

const payload = {
  config: { db: { defaultIDType: 'number' } },
  importMap: {},
} as unknown as Payload

const i18n = {
  language: 'en',
  t: (key: string) => key,
} as unknown as I18n

const createConfig = (fields: ClientField[]): ClientConfig =>
  ({
    collections: [{ slug: 'pages', fields }],
    globals: [],
  }) as unknown as ClientConfig

const createRichTextFields = (count: number): RichTextFieldClient[] =>
  Array.from({ length: count }, (_, index) => ({ name: `content${index}`, type: 'richText' }))

/**
 * Builds a server schema map with the entries a rich text editor adds for its sub-fields
 */
const createSchemaMap = (richTextFields: RichTextFieldClient[]): FieldSchemaMap => {
  const schemaMap: FieldSchemaMap = new Map()

  for (const field of richTextFields) {
    schemaMap.set(`pages.${field.name}`, { name: field.name, type: 'richText' })
    schemaMap.set(`pages.${field.name}.lexical_internal_feature.link.fields`, {
      fields: [{ name: 'url', type: 'text' }],
    })
    schemaMap.set(`pages.${field.name}.lexical_internal_feature.link.fields.url`, {
      name: 'url',
      type: 'text',
    })
  }

  return schemaMap
}

class IterationCountingMap<K, V> extends Map<K, V> {
  iterationCount = 0

  override entries() {
    this.iterationCount++
    return super.entries()
  }

  override [Symbol.iterator]() {
    this.iterationCount++
    return super[Symbol.iterator]()
  }
}

const countSchemaMapIterations = (richTextFieldCount: number): number => {
  const fields = createRichTextFields(richTextFieldCount)
  const schemaMap = new IterationCountingMap(createSchemaMap(fields))

  buildClientFieldSchemaMap({
    collectionSlug: 'pages',
    config: createConfig(fields),
    i18n,
    payload,
    schemaMap,
  })

  return schemaMap.iterationCount
}

describe('buildClientFieldSchemaMap', () => {
  it('should add sub-fields of rich text fields nested in rich text sub-fields', () => {
    const fields = createRichTextFields(1)
    const schemaMap = createSchemaMap(fields)

    schemaMap.set('pages.content0.lexical_blocks.quote.fields.body', {
      name: 'body',
      type: 'richText',
      editor: {} as RichTextAdapter,
    })
    schemaMap.set('pages.content0.lexical_blocks.quote.fields.body.lexical_internal_feature.link', {
      fields: [{ name: 'url', type: 'text' }],
    })

    const { clientFieldSchemaMap } = buildClientFieldSchemaMap({
      collectionSlug: 'pages',
      config: createConfig(fields),
      i18n,
      payload,
      schemaMap,
    })

    expect(
      clientFieldSchemaMap.get('pages.content0.lexical_blocks.quote.fields.body'),
    ).toMatchObject({ name: 'body', type: 'richText' })
    expect(
      clientFieldSchemaMap.has(
        'pages.content0.lexical_blocks.quote.fields.body.lexical_internal_feature.link',
      ),
    ).toBe(true)
  })

  it('should not read the schema map once per rich text field', () => {
    expect(countSchemaMapIterations(50)).toBe(countSchemaMapIterations(1))
  })

  it('should share client schemas of the same server schema placed at several paths', () => {
    const fields = createRichTextFields(2)
    const schemaMap = createSchemaMap(fields)
    const sharedBlock = { slug: 'cta', fields: [{ name: 'label', type: 'text' }] } as Block
    const sharedBlockFields = { fields: sharedBlock.fields }

    for (const field of fields) {
      const blockPath = `pages.${field.name}.lexical_internal_feature.blocks.lexical_blocks.cta`
      schemaMap.set(blockPath, sharedBlock)
      schemaMap.set(`${blockPath}.fields`, sharedBlockFields)
      schemaMap.set(`${blockPath}.label`, sharedBlock.fields[0]!)
    }

    const { clientFieldSchemaMap } = buildClientFieldSchemaMap({
      collectionSlug: 'pages',
      config: createConfig(fields),
      i18n,
      payload,
      schemaMap,
    })

    const getEntry = (richTextName: string, suffix = '') =>
      clientFieldSchemaMap.get(
        `pages.${richTextName}.lexical_internal_feature.blocks.lexical_blocks.cta${suffix}`,
      )

    expect(getEntry('content0')).toMatchObject({ slug: 'cta' })
    expect(getEntry('content0')).toBe(getEntry('content1'))
    expect(getEntry('content0', '.fields')).toBe(getEntry('content1', '.fields'))
    expect(getEntry('content0', '.label')).toBe(getEntry('content1', '.label'))
    expect((getEntry('content0', '.fields') as { fields: ClientField[] }).fields[0]).toBe(
      getEntry('content0', '.label'),
    )
  })

  it('should not share client schemas of different server schemas with the same slug', () => {
    const fields = createRichTextFields(2)
    const schemaMap = createSchemaMap(fields)

    for (const field of fields) {
      schemaMap.set(`pages.${field.name}.lexical_internal_feature.blocks.lexical_blocks.cta`, {
        slug: 'cta',
        fields: [{ name: 'label', type: 'text', label: field.name }],
      })
    }

    const { clientFieldSchemaMap } = buildClientFieldSchemaMap({
      collectionSlug: 'pages',
      config: createConfig(fields),
      i18n,
      payload,
      schemaMap,
    })

    const content0Block = clientFieldSchemaMap.get(
      'pages.content0.lexical_internal_feature.blocks.lexical_blocks.cta',
    ) as ClientBlock
    const content1Block = clientFieldSchemaMap.get(
      'pages.content1.lexical_internal_feature.blocks.lexical_blocks.cta',
    ) as ClientBlock

    expect(content0Block).not.toBe(content1Block)
    expect(content0Block.fields[0]).toMatchObject({ label: 'content0' })
    expect(content1Block.fields[0]).toMatchObject({ label: 'content1' })
  })
})
