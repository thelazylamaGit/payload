import type { Payload } from 'payload'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { expandFeatureClientSchemaMap } from '../../packages/richtext-lexical/src/utilities/featureClientSchemaMapSource.js'
import { initPayloadInt } from '../__helpers/shared/initPayloadInt.js'
import { analyzeEditorMap, buildEditorSchemaMaps } from './analyzeSchemaMaps.js'
import { getFlightBytes } from './flightSize.js'
import { blockSlugs, pagesSlug } from './shared.js'

let payload: Payload

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const featurePathSegment = '.lexical_internal_feature.'

/**
 * Editors along the representative nesting path, from the outermost to the innermost editor.
 */
const nestingPath = [
  'pages.layout.RichTextSection.content',
  'pages.layout.RichTextSection.content.lexical_internal_feature.blocks.lexical_blocks.Panel.fields.items.ContentWithMedia.content',
  'pages.layout.RichTextSection.content.lexical_internal_feature.blocks.lexical_blocks.Panel.fields.items.ContentWithMedia.content.lexical_internal_feature.blocks.lexical_blocks.TextPanel.fields.content',
  'pages.layout.RichTextSection.content.lexical_internal_feature.blocks.lexical_blocks.Panel.fields.items.ContentWithMedia.content.lexical_internal_feature.blocks.lexical_blocks.TextPanel.fields.content.lexical_internal_feature.blocks.lexical_blocks.Grid.fields.panels.GridPanel.items.TextColumns.columns.content',
]

describe('Lexical feature client schema maps', () => {
  let built: Awaited<ReturnType<typeof buildEditorSchemaMaps>>

  beforeAll(async () => {
    ;({ payload } = await initPayloadInt(dirname))
    built = await buildEditorSchemaMaps({ collectionSlug: pagesSlug, payload })
  })

  afterAll(async () => {
    // Size, scaling and timing report for manual comparison; timings are not asserted
    if (process.env.SCHEMA_MAP_REPORT) {
      const stats = built.editors.map(analyzeEditorMap)

      fs.writeFileSync(
        process.env.SCHEMA_MAP_REPORT,
        JSON.stringify(
          {
            clientSchemaMapEntries: built.clientSchemaMap.size,
            clientSchemaMapMs: built.clientSchemaMapMs,
            combinedSourceFlightBytes: getFlightBytes(
              built.editors.map((editor) => editor.featureClientSchemaMapSource),
            ),
            combinedFlightBytes: getFlightBytes(
              built.editors.map((editor) => editor.featureClientSchemaMap),
            ),
            constructionMs: built.constructionMs,
            heapDeltaBytes: built.heapDeltaBytes,
            nestingDepthFlightBytes: nestingPath.map((schemaPath) =>
              getFlightBytes(getEditor(schemaPath).featureClientSchemaMap),
            ),
            repeatedInstanceFlightBytes: [1, 2, 4, 8].map((instances) => [
              instances,
              getRepeatedInstanceFlightBytes(nestingPath[0]!, instances),
            ]),
            serverSchemaMapEntries: built.schemaMap.size,
            stats,
            sumOfIndividualFlightBytes: stats.reduce((total, s) => total + s.flightBytes, 0),
          },
          null,
          2,
        ),
      )
    }

    await payload.destroy()
  })

  const getEditor = (schemaPath: string) => {
    const editor = built.editors.find((candidate) => candidate.schemaPath === schemaPath)

    if (!editor) {
      throw new Error(`No editor at ${schemaPath}`)
    }

    return editor
  }

  /**
   * The feature client schema map the client derives from what the server sends
   */
  const getClientFeatureClientSchemaMap = (schemaPath: string) =>
    expandFeatureClientSchemaMap({
      blocksMap: built.clientConfig.blocksMap,
      source: getEditor(schemaPath).featureClientSchemaMapSource,
    })

  /**
   * Flight bytes of a route rendering the same editor several times, e.g. repeated block rows.
   */
  const getRepeatedInstanceFlightBytes = (schemaPath: string, instances: number) =>
    getFlightBytes(
      Array.from(
        { length: instances },
        () => built.initEditorInstance(schemaPath).featureClientSchemaMapSource,
      ),
    )

  it('should send every lexical feature entry with exactly one editor', () => {
    const deliveredKeys = built.editors.flatMap(({ featureClientSchemaMap }) =>
      Object.values(featureClientSchemaMap).flatMap((entries) => Object.keys(entries)),
    )
    const featureKeys = [...built.clientSchemaMap.keys()].filter((key) =>
      key.includes(featurePathSegment),
    )

    expect(new Set(deliveredKeys).size).toBe(deliveredKeys.length)
    expect(deliveredKeys.sort()).toEqual(featureKeys.sort())
  })

  it('should not include nested editor schemas in ancestor editors', () => {
    const descendantEditorEntries = nestingPath.map(
      (schemaPath) => analyzeEditorMap(getEditor(schemaPath)).descendantEditorEntries,
    )

    expect(descendantEditorEntries).toEqual([0, 0, 0, 0])
  })

  it('should keep the allowed block selection of each editor', () => {
    const getAllowedSlugs = (schemaPath: string, blocksKey: string) => {
      const prefix = `${schemaPath}.lexical_internal_feature.blocks.${blocksKey}.`

      return Object.keys(getClientFeatureClientSchemaMap(schemaPath).blocks!)
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('.'))
        .map((key) => key.slice(prefix.length))
    }

    expect(getAllowedSlugs(nestingPath[0]!, 'lexical_blocks')).toEqual([
      blockSlugs.panel,
      blockSlugs.contentWithMedia,
      blockSlugs.textPanel,
      blockSlugs.accordion,
      blockSlugs.buttonRow,
      blockSlugs.layoutFields,
      blockSlugs.labelledCallout,
    ])
    expect(getAllowedSlugs(nestingPath[0]!, 'lexical_inline_blocks')).toEqual([
      blockSlugs.inlineBadge,
    ])
    expect(getAllowedSlugs(nestingPath[2]!, 'lexical_blocks')).toEqual([
      blockSlugs.grid,
      blockSlugs.buttonRow,
      'InlineDefinedNote',
    ])
    expect(getAllowedSlugs(nestingPath[3]!, 'lexical_blocks')).toEqual([blockSlugs.buttonRow])
  })

  it('should share client schemas between placements of the same editor', () => {
    const textPanelEditors = built.editors.filter(({ schemaPath }) =>
      schemaPath.endsWith('lexical_blocks.TextPanel.fields.content'),
    )
    const gridEntries = textPanelEditors.map(
      ({ featureClientSchemaMap, schemaPath }) =>
        featureClientSchemaMap.blocks![
          `${schemaPath}.lexical_internal_feature.blocks.lexical_blocks.Grid`
        ]!,
    )

    expect(textPanelEditors.length).toBeGreaterThan(1)
    expect(new Set(gridEntries).size).toBe(1)
  })

  it('should not grow with repeated instances of the same editor', () => {
    const single = getRepeatedInstanceFlightBytes(nestingPath[0]!, 1)

    // Each additional instance is a short Flight back-reference to the first one
    expect(getRepeatedInstanceFlightBytes(nestingPath[0]!, 8) - single).toBeLessThan(7 * 100)
  })

  it('should derive the full feature client schema map on the client', () => {
    for (const { featureClientSchemaMap, schemaPath } of built.editors) {
      // Same entries, values and order as the full feature client schema map
      expect(JSON.stringify(getClientFeatureClientSchemaMap(schemaPath))).toBe(
        JSON.stringify(featureClientSchemaMap),
      )
    }
  })

  it('should only send the entries features generate and reference registered blocks', () => {
    for (const { featureClientSchemaMap, featureClientSchemaMapSource } of built.editors) {
      expect(featureClientSchemaMapSource.blocks!.entries.length).toBeLessThan(
        Object.keys(featureClientSchemaMap.blocks!).length,
      )
    }

    const getEntry = (schemaPath: string, key: string) =>
      getEditor(schemaPath).featureClientSchemaMapSource.blocks!.entries.find(
        (entry) => entry.key === key,
      )!

    expect(getEntry(nestingPath[0]!, 'lexical_blocks.LayoutFields.fields')).toEqual({
      blockSlug: blockSlugs.layoutFields,
      hasSubFields: true,
      key: 'lexical_blocks.LayoutFields.fields',
    })
    expect(getEntry(nestingPath[0]!, 'lexical_blocks.LayoutFields').value![0]).toMatchObject({
      blocks: [],
    })
    // Custom block components add a server-only field, so the block's fields are sent
    expect(getEntry(nestingPath[0]!, 'lexical_blocks.LabelledCallout.fields').value).toBeDefined()
    // Blocks defined inline in an editor are not part of the client config
    expect(getEntry(nestingPath[2]!, 'lexical_blocks.InlineDefinedNote')).not.toHaveProperty(
      'blockSlug',
    )
  })

  it('should keep the serialized schema maps of all editors within budget', () => {
    const allSources = built.editors.map(
      ({ featureClientSchemaMapSource }) => featureClientSchemaMapSource,
    )

    // 406,805 bytes for the full maps before client schemas were shared and nested editor schemas were excluded
    expect(getFlightBytes(allSources)).toBeLessThan(20_000)
  })
})
