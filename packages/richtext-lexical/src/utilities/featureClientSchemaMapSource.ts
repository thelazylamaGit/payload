import type { ClientBlock, ClientField, TabAsFieldClient } from 'payload'

import { fieldAffectsData, getFieldPaths, tabHasName } from 'payload/shared'

import type { FeatureClientSchemaMap, SingleFeatureClientSchemaMap } from '../types.js'

/**
 * An entry a feature generated directly in its `generateSchemaMap`. The entries of its sub-fields are not sent;
 * they are derived from the entry's fields by `expandFeatureClientSchemaMap`.
 */
export type FeatureClientSchemaMapSourceEntry = {
  /**
   * Slug of the block registered in the config (`config.blocks`) this entry is derived from.
   * Its client block is taken from the client config instead of being sent with every editor:
   * - an entry with `value` is a blocks field whose `blocks` are replaced by that block
   * - an entry without `value` consists of that block's fields
   */
  blockSlug?: string
  /** Whether entries for the sub-fields of this entry's fields are derived */
  hasSubFields?: true
  /** Schema path relative to the feature schema path */
  key: string
  value?: ClientField[]
}

export type FeatureClientSchemaMapSource = {
  [featureKey: string]: {
    entries: FeatureClientSchemaMapSourceEntry[]
    featureSchemaPath: string
  }
}

type BlocksMap = Record<string, ClientBlock>

/**
 * Derives the feature client schema map, including the entries of all sub-fields, from its source.
 * The derived entries follow the same paths and order as the field schema map.
 */
export function expandFeatureClientSchemaMap({
  blocksMap,
  source,
}: {
  blocksMap: BlocksMap
  source: FeatureClientSchemaMapSource
}): FeatureClientSchemaMap {
  const featureClientSchemaMap: FeatureClientSchemaMap = {}

  for (const [featureKey, featureSource] of Object.entries(source)) {
    let expandedByBlocksMap = expandedFeatureSources.get(featureSource)

    if (!expandedByBlocksMap) {
      expandedByBlocksMap = new WeakMap()
      expandedFeatureSources.set(featureSource, expandedByBlocksMap)
    }

    let expanded = expandedByBlocksMap.get(blocksMap)

    if (!expanded) {
      expanded = expandFeatureSource({ blocksMap, featureSource })
      expandedByBlocksMap.set(blocksMap, expanded)
    }

    featureClientSchemaMap[featureKey] = expanded
  }

  return featureClientSchemaMap
}

/**
 * Editors sharing a source (e.g. repeated blocks with the same editor) share the derived schema map
 */
const expandedFeatureSources = new WeakMap<
  FeatureClientSchemaMapSource[string],
  WeakMap<BlocksMap, SingleFeatureClientSchemaMap>
>()

function expandFeatureSource({
  blocksMap,
  featureSource,
}: {
  blocksMap: BlocksMap
  featureSource: FeatureClientSchemaMapSource[string]
}): SingleFeatureClientSchemaMap {
  const schemaMap: SingleFeatureClientSchemaMap = {}

  for (const { blockSlug, hasSubFields, key, value } of featureSource.entries) {
    const schemaPath = `${featureSource.featureSchemaPath}.${key}`
    const registeredBlock = blockSlug ? blocksMap[blockSlug] : undefined

    if (blockSlug && !registeredBlock) {
      throw new Error(`Block "${blockSlug}" of "${schemaPath}" is missing in the client config`)
    }

    // Like a map deserialized from the server, each derived map gets its own block objects: the blocks feature
    // relies on new block objects to refresh nested editors, and must not mutate the client config's blocks.
    const block = registeredBlock && { ...registeredBlock, fields: [...registeredBlock.fields] }

    let fields: ClientField[]

    if (!value) {
      fields = block!.fields
    } else if (block) {
      fields = [{ ...value[0], blocks: [block] } as ClientField]
    } else {
      fields = value
    }

    // Sub-field entries precede their parent entry, like in the field schema map
    if (hasSubFields) {
      addSubFieldEntries({
        blocksMap,
        fields,
        parentIndexPath: '',
        parentSchemaPath: schemaPath,
        schemaMap,
      })
    }

    schemaMap[schemaPath] = fields
  }

  return schemaMap
}

/**
 * Mirrors the field schema map's traversal (`buildFieldSchemaMap/traverseFields`) for client fields.
 * Rich text sub-fields belong to the nested editor and are not added.
 */
function addSubFieldEntries({
  blocksMap,
  fields,
  parentIndexPath,
  parentSchemaPath,
  schemaMap,
}: {
  blocksMap: BlocksMap
  fields: (ClientField | TabAsFieldClient)[]
  parentIndexPath: string
  parentSchemaPath: string
  schemaMap: SingleFeatureClientSchemaMap
}) {
  for (const [index, field] of fields.entries()) {
    const { indexPath, schemaPath } = getFieldPaths({
      field,
      index,
      parentIndexPath,
      parentSchemaPath,
    })

    schemaMap[schemaPath] = toEntryValue(field)

    const addChildren = (children: (ClientField | TabAsFieldClient)[], childIndexPath: string) =>
      addSubFieldEntries({
        blocksMap,
        fields: children,
        parentIndexPath: childIndexPath,
        parentSchemaPath: schemaPath,
        schemaMap,
      })

    switch (field.type) {
      case 'array':
        addChildren(field.fields, '')
        break

      case 'blocks':
        for (const blockOrSlug of field.blockReferences ?? field.blocks) {
          const block = typeof blockOrSlug === 'string' ? blocksMap[blockOrSlug] : blockOrSlug

          if (!block) {
            throw new Error(`Block "${String(blockOrSlug)}" is missing in the client config`)
          }

          const blockSchemaPath = `${schemaPath}.${block.slug}`

          schemaMap[blockSchemaPath] = block.fields
          addSubFieldEntries({
            blocksMap,
            fields: block.fields,
            parentIndexPath: '',
            parentSchemaPath: blockSchemaPath,
            schemaMap,
          })
        }
        break

      case 'collapsible':
      case 'row':
        addChildren(field.fields, indexPath)
        break

      case 'group':
        addChildren(field.fields, fieldAffectsData(field) ? '' : indexPath)
        break

      case 'tab':
        addChildren(field.fields, tabHasName(field) ? '' : indexPath)
        break

      case 'tabs':
        addChildren(
          field.tabs.map((tab) => ({ ...tab, type: 'tab' }) as TabAsFieldClient),
          indexPath,
        )
        break
    }
  }
}

function toEntryValue(field: ClientField | TabAsFieldClient): ClientField[] {
  // A tab's schema is converted to a client field without its sub-fields
  if (field.type === 'tab') {
    const { fields: _fields, ...tab } = field
    return [tab as unknown as ClientField]
  }

  return 'fields' in field ? field.fields : [field as ClientField]
}
