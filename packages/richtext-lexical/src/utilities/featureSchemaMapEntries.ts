import type { FieldSchemaMap } from 'payload'

type FieldSchema = FieldSchemaMap extends Map<string, infer V> ? V : never

/**
 * Schema paths of the entries features generated directly in `generateSchemaMap`, per field schema map.
 * All other entries of a feature are sub-fields of these entries.
 */
const featureEntryPathsBySchemaMap = new WeakMap<FieldSchemaMap, Set<string>>()

/**
 * Feature schema map entries derived only from a block registered in the config, mapped to the block slug
 */
const registeredBlockSchemas = new WeakMap<FieldSchema, string>()

export function addFeatureEntryPath({
  schemaMap,
  schemaPath,
}: {
  schemaMap: FieldSchemaMap
  schemaPath: string
}) {
  let featureEntryPaths = featureEntryPathsBySchemaMap.get(schemaMap)

  if (!featureEntryPaths) {
    featureEntryPaths = new Set()
    featureEntryPathsBySchemaMap.set(schemaMap, featureEntryPaths)
  }

  featureEntryPaths.add(schemaPath)
}

export function getFeatureEntryPaths(schemaMap: FieldSchemaMap): Set<string> | undefined {
  return featureEntryPathsBySchemaMap.get(schemaMap)
}

export function setRegisteredBlockSchema({
  blockSlug,
  schema,
}: {
  blockSlug: string
  schema: FieldSchema
}) {
  registeredBlockSchemas.set(schema, blockSlug)
}

export function getRegisteredBlockSlug(schema: FieldSchema | undefined): string | undefined {
  return schema ? registeredBlockSchemas.get(schema) : undefined
}
