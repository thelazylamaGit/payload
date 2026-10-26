import type { I18nClient } from '@payloadcms/translations'
import type { ClientField, ClientFieldSchemaMap, FieldSchemaMap, Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import type { SanitizedServerEditorConfig } from '../lexical/config/types.js'

import { expandFeatureClientSchemaMap } from './featureClientSchemaMapSource.js'
import { initLexicalFeatures } from './initLexicalFeatures.js'

const editorPath = 'pages.content'
const blocksPath = `${editorPath}.lexical_internal_feature.blocks`
const nestedEditorPath = `${blocksPath}.lexical_blocks.panel.fields.body`

const sanitizedEditorConfig = {
  resolvedFeatureMap: new Map([
    ['blocks', { generateSchemaMap: () => new Map(), key: 'blocks', order: 0 }],
  ]),
} as unknown as SanitizedServerEditorConfig

const label: ClientField = { name: 'label', type: 'text' }

const createClientFieldSchemaMap = (): ClientFieldSchemaMap =>
  new Map<string, any>([
    [`${blocksPath}.lexical_blocks.panel`, { name: 'lexical_blocks_panel', type: 'blocks' }],
    [`${blocksPath}.lexical_blocks.panel.fields`, { fields: [label] }],
    [`${blocksPath}.lexical_blocks.panel.label`, label],
    [nestedEditorPath, { name: 'body', type: 'richText' }],
    [
      `${nestedEditorPath}.lexical_internal_feature.blocks.lexical_blocks.cta`,
      { name: 'cta', type: 'blocks' },
    ],
    [`${nestedEditorPath}.lexical_internal_feature.blocks.lexical_blocks.cta.label`, label],
  ])

const initFeatures = (clientFieldSchemaMap: ClientFieldSchemaMap) =>
  initLexicalFeatures({
    clientFieldSchemaMap,
    fieldSchemaMap: new Map() as FieldSchemaMap,
    i18n: {} as I18nClient,
    path: editorPath,
    payload: { importMap: {} } as unknown as Payload,
    sanitizedEditorConfig,
    schemaPath: editorPath,
  })

const getBlocksFeatureClientSchemaMap = (clientFieldSchemaMap: ClientFieldSchemaMap) =>
  initFeatures(clientFieldSchemaMap).featureClientSchemaMap.blocks!

describe('initLexicalFeatures', () => {
  it('should include sub-fields of the feature but not of nested editors', () => {
    const blocksSchemaMap = getBlocksFeatureClientSchemaMap(createClientFieldSchemaMap())

    expect(Object.keys(blocksSchemaMap)).toEqual([
      `${blocksPath}.lexical_blocks.panel`,
      `${blocksPath}.lexical_blocks.panel.fields`,
      `${blocksPath}.lexical_blocks.panel.label`,
      nestedEditorPath,
    ])
    expect(blocksSchemaMap[`${blocksPath}.lexical_blocks.panel.fields`]).toEqual([label])
    expect(blocksSchemaMap[`${blocksPath}.lexical_blocks.panel.label`]).toEqual([label])
  })

  it('should return the same schema objects for every instance of an editor', () => {
    const clientFieldSchemaMap = createClientFieldSchemaMap()

    expect(getBlocksFeatureClientSchemaMap(clientFieldSchemaMap)).toBe(
      getBlocksFeatureClientSchemaMap(clientFieldSchemaMap),
    )
  })

  it('should rebuild when the client field schema map is rebuilt', () => {
    const first = getBlocksFeatureClientSchemaMap(createClientFieldSchemaMap())
    const second = getBlocksFeatureClientSchemaMap(createClientFieldSchemaMap())

    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })

  it('should send the full map if its sub-field entries cannot be derived on the client', () => {
    const { featureClientSchemaMap, featureClientSchemaMapSource } = initFeatures(
      createClientFieldSchemaMap(),
    )

    expect(featureClientSchemaMapSource.blocks!.entries).toHaveLength(
      Object.keys(featureClientSchemaMap.blocks!).length,
    )
    expect(
      expandFeatureClientSchemaMap({ blocksMap: {}, source: featureClientSchemaMapSource }),
    ).toEqual(featureClientSchemaMap)
  })
})
