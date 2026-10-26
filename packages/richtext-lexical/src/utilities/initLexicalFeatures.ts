import type { I18nClient } from '@payloadcms/translations'
import type {
  BlocksFieldClient,
  ClientBlock,
  ClientField,
  ClientFieldSchemaMap,
  FieldSchemaMap,
  Payload,
} from 'payload'

import { createClientBlocks } from 'payload'
import { getFromImportMap } from 'payload/shared'

import type {
  BaseClientFeatureProps,
  FeatureProviderProviderClient,
} from '../features/typesClient.js'
import type { SanitizedServerEditorConfig } from '../lexical/config/types.js'
import type {
  FeatureClientSchemaMap,
  LexicalRichTextFieldProps,
  SingleFeatureClientSchemaMap,
} from '../types.js'
import type {
  FeatureClientSchemaMapSource,
  FeatureClientSchemaMapSourceEntry,
} from './featureClientSchemaMapSource.js'

import { expandFeatureClientSchemaMap } from './featureClientSchemaMapSource.js'
import { getFeatureEntryPaths, getRegisteredBlockSlug } from './featureSchemaMapEntries.js'
type Args = {
  clientFieldSchemaMap: ClientFieldSchemaMap
  fieldSchemaMap: FieldSchemaMap
  i18n: I18nClient
  path: string
  payload: Payload
  sanitizedEditorConfig: SanitizedServerEditorConfig
  schemaPath: string
}

export function initLexicalFeatures(args: Args): {
  clientFeatures: LexicalRichTextFieldProps['clientFeatures']
  featureClientImportMap: Record<string, any>
  featureClientSchemaMap: FeatureClientSchemaMap
  /** Compact form of `featureClientSchemaMap` to send to the client */
  featureClientSchemaMapSource: FeatureClientSchemaMapSource
} {
  const clientFeatures: LexicalRichTextFieldProps['clientFeatures'] = {}

  // turn args.resolvedFeatureMap into an array of [key, value] pairs, ordered by value.order, lowest order first:
  const resolvedFeatureMapArray = [...args.sanitizedEditorConfig.resolvedFeatureMap].sort(
    (a, b) => a[1].order - b[1].order,
  )

  const featureClientSchemaMap: FeatureClientSchemaMap = {}
  const featureClientSchemaMapSource: FeatureClientSchemaMapSource = {}

  /**
   * All modules added to the import map, keyed by the provided key, if feature.componentImports with type object is used
   */
  const featureClientImportMap: Record<string, any> | undefined = {}

  for (const [featureKey, resolvedFeature] of resolvedFeatureMapArray) {
    clientFeatures[featureKey] = {}

    /**
     * Handle client features
     */
    const ClientFeaturePayloadComponent = resolvedFeature.ClientFeature

    if (ClientFeaturePayloadComponent) {
      const clientFeatureProvider = getFromImportMap<FeatureProviderProviderClient>({
        importMap: args.payload.importMap,
        PayloadComponent: ClientFeaturePayloadComponent,
        schemaPath: 'lexical-clientComponent',
        silent: true,
      })

      if (!clientFeatureProvider) {
        continue
      }

      const clientFeatureProps: BaseClientFeatureProps<Record<string, any>> =
        resolvedFeature.clientFeatureProps ?? {}
      clientFeatureProps.featureKey = resolvedFeature.key
      clientFeatureProps.order = resolvedFeature.order
      if (
        typeof ClientFeaturePayloadComponent === 'object' &&
        ClientFeaturePayloadComponent.clientProps
      ) {
        clientFeatureProps.clientProps = ClientFeaturePayloadComponent.clientProps
      }
      // As clientFeatureProvider is a client function, we cannot execute it on the server here. Thus, the client will have to execute clientFeatureProvider with its props
      clientFeatures[featureKey] = { clientFeatureProps, clientFeatureProvider }
    }

    /**
     * Handle sub-fields (formstate of those)
     */
    // The args.fieldSchemaMap generated before in buildFormState should contain all of lexical features' sub-field schemas
    // as well, as it already called feature.generateSchemaMap for each feature.
    // We will check for the existance resolvedFeature.generateSchemaMap to skip unnecessary loops for constructing featureSchemaMap, but we don't run it here
    if (resolvedFeature.generateSchemaMap) {
      const featureSchemaPath = `${args.schemaPath}.lexical_internal_feature.${featureKey}`

      featureClientSchemaMap[featureKey] = getFeatureClientSchemaMap({
        clientFieldSchemaMap: args.clientFieldSchemaMap,
        featureSchemaPath,
      })
      featureClientSchemaMapSource[featureKey] = getFeatureClientSchemaMapSource({
        clientFieldSchemaMap: args.clientFieldSchemaMap,
        featureClientSchemaMap: featureClientSchemaMap[featureKey],
        featureSchemaPath,
        fieldSchemaMap: args.fieldSchemaMap,
        i18n: args.i18n,
        payload: args.payload,
      })
    }

    if (
      resolvedFeature.componentImports &&
      typeof resolvedFeature.componentImports === 'object' &&
      !Array.isArray(resolvedFeature.componentImports)
    ) {
      for (const [key, payloadComponent] of Object.entries(resolvedFeature.componentImports)) {
        const resolvedComponent = getFromImportMap({
          importMap: args.payload.importMap,
          PayloadComponent: payloadComponent,
          schemaPath: 'lexical-clientComponent',
          silent: true,
        })

        featureClientImportMap[`${resolvedFeature.key}.${key}`] = resolvedComponent
      }
    }
  }
  return {
    clientFeatures,
    featureClientImportMap,
    featureClientSchemaMap,
    featureClientSchemaMapSource,
  }
}

const nestedEditorPathSegment = '.lexical_internal_feature.'

const featureClientSchemaMapCache = new WeakMap<
  ClientFieldSchemaMap,
  Map<string, SingleFeatureClientSchemaMap>
>()

const wrappedEntryCache = new WeakMap<object, ClientField[]>()

/**
 * Collects the client schemas of a feature's sub-fields.
 *
 * Entries of rich text editors nested inside this feature (e.g. a rich text field in a block) are excluded:
 * nested editors are rendered with their own feature client schema map.
 *
 * The result only depends on the (cached) client field schema map and the feature schema path, so every
 * instance of the same editor shares one object. This lets React Flight send it once per response.
 */
function getFeatureClientSchemaMap({
  clientFieldSchemaMap,
  featureSchemaPath,
}: {
  clientFieldSchemaMap: ClientFieldSchemaMap
  featureSchemaPath: string
}): SingleFeatureClientSchemaMap {
  let cachedByFeatureSchemaPath = featureClientSchemaMapCache.get(clientFieldSchemaMap)

  if (!cachedByFeatureSchemaPath) {
    cachedByFeatureSchemaPath = new Map()
    featureClientSchemaMapCache.set(clientFieldSchemaMap, cachedByFeatureSchemaPath)
  }

  const cachedFeatureClientSchemaMap = cachedByFeatureSchemaPath.get(featureSchemaPath)

  if (cachedFeatureClientSchemaMap) {
    return cachedFeatureClientSchemaMap
  }

  const featureClientSchemaMap: SingleFeatureClientSchemaMap = {}

  for (const [key, entry] of clientFieldSchemaMap.entries()) {
    if (
      !key.startsWith(`${featureSchemaPath}.`) ||
      key.indexOf(nestedEditorPathSegment, featureSchemaPath.length) !== -1
    ) {
      continue
    }

    if ('fields' in entry) {
      featureClientSchemaMap[key] = entry.fields
      continue
    }

    let wrappedEntry = wrappedEntryCache.get(entry)

    if (!wrappedEntry) {
      wrappedEntry = [entry as ClientField]
      wrappedEntryCache.set(entry, wrappedEntry)
    }

    featureClientSchemaMap[key] = wrappedEntry
  }

  cachedByFeatureSchemaPath.set(featureSchemaPath, featureClientSchemaMap)

  return featureClientSchemaMap
}

const featureClientSchemaMapSourceCache = new WeakMap<
  ClientFieldSchemaMap,
  Map<string, FeatureClientSchemaMapSource[string]>
>()

/**
 * Creates the compact form of a feature client schema map that is sent to the client:
 * - only the entries the feature generated directly are sent; the client derives their sub-field entries
 * - schemas of blocks registered in the config are taken from the client config instead of being sent
 *
 * The client derives exactly the same feature client schema map, so features can rely on all of its entries.
 * If that cannot be verified, the full feature client schema map is sent instead.
 */
function getFeatureClientSchemaMapSource({
  clientFieldSchemaMap,
  featureClientSchemaMap,
  featureSchemaPath,
  fieldSchemaMap,
  i18n,
  payload,
}: {
  clientFieldSchemaMap: ClientFieldSchemaMap
  featureClientSchemaMap: SingleFeatureClientSchemaMap
  featureSchemaPath: string
  fieldSchemaMap: FieldSchemaMap
  i18n: I18nClient
  payload: Payload
}): FeatureClientSchemaMapSource[string] {
  let cachedByFeatureSchemaPath = featureClientSchemaMapSourceCache.get(clientFieldSchemaMap)

  if (!cachedByFeatureSchemaPath) {
    cachedByFeatureSchemaPath = new Map()
    featureClientSchemaMapSourceCache.set(clientFieldSchemaMap, cachedByFeatureSchemaPath)
  }

  const cachedSource = cachedByFeatureSchemaPath.get(featureSchemaPath)

  if (cachedSource) {
    return cachedSource
  }

  const source = getCompactFeatureClientSchemaMapSource({
    clientFieldSchemaMap,
    featureClientSchemaMap,
    featureSchemaPath,
    fieldSchemaMap,
    i18n,
    payload,
  }) ?? {
    entries: Object.entries(featureClientSchemaMap).map(([schemaPath, value]) => ({
      key: schemaPath.slice(featureSchemaPath.length + 1),
      value,
    })),
    featureSchemaPath,
  }

  cachedByFeatureSchemaPath.set(featureSchemaPath, source)

  return source
}

/**
 * Returns `undefined` if the client cannot derive exactly the same feature client schema map
 */
function getCompactFeatureClientSchemaMapSource({
  clientFieldSchemaMap,
  featureClientSchemaMap,
  featureSchemaPath,
  fieldSchemaMap,
  i18n,
  payload,
}: {
  clientFieldSchemaMap: ClientFieldSchemaMap
  featureClientSchemaMap: SingleFeatureClientSchemaMap
  featureSchemaPath: string
  fieldSchemaMap: FieldSchemaMap
  i18n: I18nClient
  payload: Payload
}): FeatureClientSchemaMapSource[string] | undefined {
  const featureEntryPaths = getFeatureEntryPaths(fieldSchemaMap)

  if (!featureEntryPaths) {
    return undefined
  }

  const keyPrefix = `${featureSchemaPath}.`
  const entries: FeatureClientSchemaMapSourceEntry[] = []

  for (const [schemaPath, value] of Object.entries(featureClientSchemaMap)) {
    if (!featureEntryPaths.has(schemaPath)) {
      continue
    }

    const schema = fieldSchemaMap.get(schemaPath)!
    const key = schemaPath.slice(keyPrefix.length)
    const hasSubFields = 'fields' in schema ? true : undefined
    const blockSlug = getRegisteredBlockSlug(schema)

    if (!blockSlug) {
      entries.push({ hasSubFields, key, value })
    } else if (hasSubFields) {
      entries.push({ blockSlug, hasSubFields, key })
    } else {
      entries.push({
        blockSlug,
        key,
        value: [getBlocksFieldWithoutBlocks(value[0] as BlocksFieldClient)],
      })
    }
  }

  const source = { entries, featureSchemaPath }

  return isSameAfterExpansion({
    blocksMap: getRegisteredClientBlocks({ clientFieldSchemaMap, i18n, payload }),
    featureClientSchemaMap,
    source,
  })
    ? source
    : undefined
}

function isSameAfterExpansion({
  blocksMap,
  featureClientSchemaMap,
  source,
}: {
  blocksMap: Record<string, ClientBlock>
  featureClientSchemaMap: SingleFeatureClientSchemaMap
  source: FeatureClientSchemaMapSource[string]
}): boolean {
  try {
    const expanded = expandFeatureClientSchemaMap({ blocksMap, source: { feature: source } })

    return JSON.stringify(expanded.feature) === JSON.stringify(featureClientSchemaMap)
  } catch {
    return false
  }
}

const blocksFieldWithoutBlocksCache = new WeakMap<BlocksFieldClient, ClientField>()

function getBlocksFieldWithoutBlocks(field: BlocksFieldClient): ClientField {
  let fieldWithoutBlocks = blocksFieldWithoutBlocksCache.get(field)

  if (!fieldWithoutBlocks) {
    fieldWithoutBlocks = { ...field, blocks: [] }
    blocksFieldWithoutBlocksCache.set(field, fieldWithoutBlocks)
  }

  return fieldWithoutBlocks
}

const registeredClientBlocksCache = new WeakMap<ClientFieldSchemaMap, Record<string, ClientBlock>>()

/**
 * The client blocks of `config.blocks`, as the client config contains them
 */
function getRegisteredClientBlocks({
  clientFieldSchemaMap,
  i18n,
  payload,
}: {
  clientFieldSchemaMap: ClientFieldSchemaMap
  i18n: I18nClient
  payload: Payload
}): Record<string, ClientBlock> {
  let blocksMap = registeredClientBlocksCache.get(clientFieldSchemaMap)

  if (!blocksMap) {
    blocksMap = {}

    for (const block of createClientBlocks({
      blocks: payload.config.blocks ?? [],
      defaultIDType: payload.config.db.defaultIDType,
      i18n,
      importMap: payload.importMap,
    })) {
      if (typeof block !== 'string') {
        blocksMap[block.slug] = block
      }
    }

    registeredClientBlocksCache.set(clientFieldSchemaMap, blocksMap)
  }

  return blocksMap
}
