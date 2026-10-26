import type { I18n } from '@payloadcms/translations'
import type {
  ClientBlock,
  ClientConfig,
  ClientField,
  ClientFieldSchemaMap,
  FieldSchemaMap,
  Payload,
  TabAsFieldClient,
} from 'payload'

import { createClientBlocks, createClientFields } from 'payload'
import { fieldAffectsData, getFieldPaths, tabHasName } from 'payload/shared'

/**
 * Rich text sub-field schemas converted to client schemas, keyed by their server schema.
 * The same server schema can be placed at many schema paths (e.g. a block referenced by several editors),
 * so it is converted once and the client schema object is shared, which lets React Flight deduplicate it.
 */
type ClientSchemaCache = WeakMap<ServerSchema, ClientSchema>

type ClientSchema = ClientFieldSchemaMap extends Map<string, infer V> ? V : never
type ServerSchema = FieldSchemaMap extends Map<string, infer V> ? V : never

type Args = {
  clientSchemaCache?: ClientSchemaCache
  clientSchemaMap: ClientFieldSchemaMap
  config: ClientConfig
  fields: (ClientField | TabAsFieldClient)[]
  i18n: I18n<any, any>
  parentIndexPath: string
  parentSchemaPath: string
  payload: Payload
  schemaMap: FieldSchemaMap
}

export const traverseFields = ({
  clientSchemaCache = new WeakMap(),
  clientSchemaMap,
  config,
  fields,
  i18n,
  parentIndexPath,
  parentSchemaPath,
  payload,
  schemaMap,
}: Args) => {
  for (const [index, field] of fields.entries()) {
    const { indexPath, schemaPath } = getFieldPaths({
      field,
      index,
      parentIndexPath,
      parentSchemaPath,
    })

    clientSchemaMap.set(schemaPath, field)

    switch (field.type) {
      case 'array': {
        traverseFields({
          clientSchemaCache,
          clientSchemaMap,
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: '',
          parentSchemaPath: schemaPath,
          payload,
          schemaMap,
        })

        break
      }

      case 'blocks':
        ;(field.blockReferences ?? field.blocks).map((_block) => {
          const block =
            typeof _block === 'string'
              ? config.blocksMap
                ? config.blocksMap[_block]
                : config.blocks.find((block) => typeof block !== 'string' && block.slug === _block)
              : _block

          const blockSchemaPath = `${schemaPath}.${block.slug}`

          clientSchemaMap.set(blockSchemaPath, block)
          traverseFields({
            clientSchemaCache,
            clientSchemaMap,
            config,
            fields: block.fields,
            i18n,
            parentIndexPath: '',
            parentSchemaPath: schemaPath + '.' + block.slug,
            payload,
            schemaMap,
          })
        })

        break

      case 'collapsible':
      case 'row': {
        traverseFields({
          clientSchemaCache,
          clientSchemaMap,
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: indexPath,
          parentSchemaPath: schemaPath,
          payload,
          schemaMap,
        })
        break
      }

      case 'group': {
        if (fieldAffectsData(field)) {
          traverseFields({
            clientSchemaCache,
            clientSchemaMap,
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: '',
            parentSchemaPath: schemaPath,
            payload,
            schemaMap,
          })
        } else {
          traverseFields({
            clientSchemaCache,
            clientSchemaMap,
            config,
            fields: field.fields,
            i18n,
            parentIndexPath: indexPath,
            parentSchemaPath: schemaPath,
            payload,
            schemaMap,
          })
        }
        break
      }

      case 'richText': {
        // richText sub-fields are not part of the ClientConfig or the Config.
        // They only exist in the field schema map.
        // Thus, we need to
        // 1. get them from the field schema map
        // 2. convert them to client fields
        // 3. add them to the client schema map

        // So these would basically be all fields that are not part of the client config already
        const richTextFieldSchemaMap: FieldSchemaMap =
          getRichTextSubFieldsByPath({ schemaMap }).get(schemaPath) ?? new Map()

        // Now loop through them, convert each entry to a client field and add it to the client schema map.
        for (const [path, subField] of richTextFieldSchemaMap.entries()) {
          clientSchemaMap.set(
            path,
            getClientSchema({ cache: clientSchemaCache, i18n, payload, schema: subField }),
          )
        }
        break
      }

      case 'tab': {
        const isNamedTab = tabHasName(field)

        traverseFields({
          clientSchemaCache,
          clientSchemaMap,
          config,
          fields: field.fields,
          i18n,
          parentIndexPath: isNamedTab ? '' : indexPath,
          parentSchemaPath: schemaPath,
          payload,
          schemaMap,
        })

        break
      }

      case 'tabs': {
        traverseFields({
          clientSchemaCache,
          clientSchemaMap,
          config,
          fields: field.tabs.map((tab) => ({ ...tab, type: 'tab' })),
          i18n,
          parentIndexPath: indexPath,
          parentSchemaPath: schemaPath,
          payload,
          schemaMap,
        })

        break
      }
    }
  }
}

/**
 * Converts a rich text sub-field schema map value to its client counterpart.
 * Schema map values are a union: Block | Field | Tab | { fields: Field[] }.
 * Each variant needs different conversion to strip server-only properties.
 */
function getClientSchema({
  cache,
  i18n,
  payload,
  schema,
}: {
  cache: ClientSchemaCache
  i18n: I18n<any, any>
  payload: Payload
  schema: ServerSchema
}): ClientSchema {
  const cachedClientSchema = cache.get(schema)

  if (cachedClientSchema) {
    return cachedClientSchema
  }

  let clientSchema: ClientSchema

  if ('slug' in schema) {
    clientSchema = createClientBlocks({
      blocks: [schema],
      defaultIDType: payload.config.db.defaultIDType,
      i18n,
      importMap: payload.importMap,
    })[0] as ClientBlock
  } else if ('type' in schema) {
    clientSchema = createClientFields({
      defaultIDType: payload.config.db.defaultIDType,
      disableAddingID: true,
      fields: [schema],
      i18n,
      importMap: payload.importMap,
    })[0]!
  } else if ('fields' in schema) {
    clientSchema = {
      fields: schema.fields.map(
        (field) => getClientSchema({ cache, i18n, payload, schema: field }) as ClientField,
      ),
    }
  } else {
    return schema satisfies never
  }

  cache.set(schema, clientSchema)

  return clientSchema
}

const richTextSubFieldsCache = new WeakMap<FieldSchemaMap, Map<string, FieldSchemaMap>>()

/**
 * Groups the schema map entries by the rich text field they belong to,
 * so each rich text field does not have to scan the whole schema map.
 */
function getRichTextSubFieldsByPath({
  schemaMap,
}: {
  schemaMap: FieldSchemaMap
}): Map<string, FieldSchemaMap> {
  const cachedSubFieldsByPath = richTextSubFieldsCache.get(schemaMap)

  if (cachedSubFieldsByPath) {
    return cachedSubFieldsByPath
  }

  const subFieldsByPath = new Map<string, FieldSchemaMap>()

  for (const [path, field] of schemaMap) {
    if ('type' in field && field.type === 'richText') {
      subFieldsByPath.set(path, new Map())
    }
  }

  for (const [path, field] of schemaMap) {
    let separatorIndex = path.indexOf('.')

    // A sub-field of a nested rich text field belongs to each of its rich text ancestors
    while (separatorIndex !== -1) {
      subFieldsByPath.get(path.slice(0, separatorIndex))?.set(path, field)
      separatorIndex = path.indexOf('.', separatorIndex + 1)
    }
  }

  richTextSubFieldsCache.set(schemaMap, subFieldsByPath)

  return subFieldsByPath
}
