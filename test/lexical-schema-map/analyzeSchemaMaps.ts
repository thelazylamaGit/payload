import type { SanitizedServerEditorConfig } from '@payloadcms/richtext-lexical'
import type { FieldSchemaMap, Payload, RichTextField } from 'payload'

import { initI18n } from '@payloadcms/translations'
import { getClientConfig } from '@payloadcms/ui/utilities/getClientConfig'
import { getClientSchemaMap } from '@payloadcms/ui/utilities/getClientSchemaMap'
import { getSchemaMap } from '@payloadcms/ui/utilities/getSchemaMap'
import { performance } from 'node:perf_hooks'

import { initLexicalFeatures } from '../../packages/richtext-lexical/src/utilities/initLexicalFeatures.js'
import { getFlightBytes } from './flightSize.js'

const featurePathSegment = '.lexical_internal_feature.'

export type EditorMapStats = {
  /** Entries that belong to rich text editors nested inside this editor's blocks */
  descendantEditorEntries: number
  /** Distinct object identities among entry values (what Flight can share) */
  distinctValueIdentities: number
  /** Distinct serialized entry values (structural duplicates collapse) */
  distinctValueShapes: number
  entries: number
  flightBytes: number
  jsonBytes: number
  keyBytes: number
  schemaPath: string
}

const countDescendantEditorEntries = (schemaPath: string, keys: string[]) => {
  const ownPrefixLength = schemaPath.length + featurePathSegment.length
  return keys.filter((key) => key.indexOf(featurePathSegment, ownPrefixLength) !== -1).length
}

export const buildEditorSchemaMaps = async ({
  collectionSlug,
  payload,
}: {
  collectionSlug: string
  payload: Payload
}) => {
  // Int tests have no generated import map; schema-map conversion only uses it for custom components.
  if (!payload.importMap) {
    payload.importMap = new Proxy({}, { get: () => () => null })
  }

  const i18n = await initI18n({ config: payload.config.i18n, context: 'client', language: 'en' })

  const heapBefore = process.memoryUsage().heapUsed
  const constructionStart = performance.now()

  global._payload_doNotCacheSchemaMap = true
  global._payload_doNotCacheClientSchemaMap = true

  const schemaMap: FieldSchemaMap = getSchemaMap({ collectionSlug, config: payload.config, i18n })
  const clientConfig = getClientConfig({
    config: payload.config,
    i18n,
    importMap: payload.importMap,
    user: true,
  })
  const clientSchemaMap = getClientSchemaMap({
    collectionSlug,
    config: clientConfig,
    i18n,
    payload,
    schemaMap,
  })
  const clientSchemaMapMs = performance.now() - constructionStart

  /**
   * Initializes one instance of the editor at a schema path, like each rendered rich text field does.
   */
  const initEditorInstance = (schemaPath: string) => {
    const field = schemaMap.get(schemaPath) as RichTextField
    const { featureClientSchemaMap, featureClientSchemaMapSource } = initLexicalFeatures({
      clientFieldSchemaMap: clientSchemaMap,
      fieldSchemaMap: schemaMap,
      i18n,
      path: schemaPath,
      payload,
      sanitizedEditorConfig: (
        field.editor as unknown as { editorConfig: SanitizedServerEditorConfig }
      ).editorConfig,
      schemaPath,
    })
    return { featureClientSchemaMap, featureClientSchemaMapSource, schemaPath }
  }

  const editors = [...schemaMap.entries()]
    .filter(([, field]) => 'type' in field && field.type === 'richText')
    .map(([schemaPath]) => initEditorInstance(schemaPath))

  const constructionMs = performance.now() - constructionStart
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore

  return {
    clientConfig,
    clientSchemaMap,
    clientSchemaMapMs,
    constructionMs,
    editors,
    heapDeltaBytes,
    initEditorInstance,
    schemaMap,
  }
}

export const analyzeEditorMap = ({
  featureClientSchemaMap,
  schemaPath,
}: {
  featureClientSchemaMap: Record<string, Record<string, unknown>>
  schemaPath: string
}): EditorMapStats => {
  const entries = Object.values(featureClientSchemaMap).flatMap((featureEntries) =>
    Object.entries(featureEntries),
  )
  const keys = entries.map(([key]) => key)

  return {
    descendantEditorEntries: countDescendantEditorEntries(schemaPath, keys),
    distinctValueIdentities: new Set(entries.map(([, value]) => value)).size,
    distinctValueShapes: new Set(entries.map(([, value]) => JSON.stringify(value))).size,
    entries: entries.length,
    flightBytes: getFlightBytes(featureClientSchemaMap),
    jsonBytes: Buffer.byteLength(JSON.stringify(featureClientSchemaMap)),
    keyBytes: keys.reduce((total, key) => total + Buffer.byteLength(JSON.stringify(key)), 0),
    schemaPath,
  }
}
