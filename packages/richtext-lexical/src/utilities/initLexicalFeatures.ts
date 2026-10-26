import type { I18nClient } from '@payloadcms/translations'

import {
  type ClientField,
  type ClientFieldSchemaMap,
  type FieldSchemaMap,
  type Payload,
} from 'payload'
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
} {
  const clientFeatures: LexicalRichTextFieldProps['clientFeatures'] = {}

  // turn args.resolvedFeatureMap into an array of [key, value] pairs, ordered by value.order, lowest order first:
  const resolvedFeatureMapArray = [...args.sanitizedEditorConfig.resolvedFeatureMap].sort(
    (a, b) => a[1].order - b[1].order,
  )

  const featureClientSchemaMap: FeatureClientSchemaMap = {}

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
      !key.startsWith(featureSchemaPath) ||
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
