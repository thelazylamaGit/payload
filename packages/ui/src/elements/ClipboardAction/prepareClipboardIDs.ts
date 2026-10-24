import type { Data, Field, FieldSchemaMap, SanitizedConfig } from 'payload'

import ObjectIdImport from 'bson-objectid'
import { traverseFields } from 'payload'

const ObjectId = 'default' in ObjectIdImport ? ObjectIdImport.default : ObjectIdImport
const freshID = () => new ObjectId().toHexString()

/** Runs only on paste, against native server schemas. Never serializes those schemas. */
export function prepareClipboardIDs({
  config,
  data,
  fields,
  schemaMap,
}: {
  config: SanitizedConfig
  data: Data
  fields: Field[]
  schemaMap: FieldSchemaMap
}): Data {
  const result = structuredClone(data)
  const fieldPaths = new Map([...schemaMap].map(([path, field]) => [field, path]))

  const visitFields = (value: Data, fields: Field[]): void => {
    traverseFields({
      callback: ({ field, ref }) => {
        if (!ref || typeof ref !== 'object' || !('name' in field)) {
          return
        }
        const value: unknown = ref[field.name]
        if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
          for (const row of value) {
            row.id = freshID()
          }
        } else if (field.type === 'richText') {
          visitLexical(value, fieldPaths.get(field))
        }
      },
      config,
      fields,
      fillEmpty: false,
      ref: value,
    })
  }

  const visitLexical = (value: unknown, path: string | undefined): void => {
    if (!value || typeof value !== 'object') {
      return
    }
    const node = value as { children?: unknown[]; fields?: Data; root?: unknown; type?: string }
    if ((node.type === 'block' || node.type === 'inlineBlock') && node.fields) {
      const kind = node.type === 'block' ? 'lexical_blocks' : 'lexical_inline_blocks'
      const schema = schemaMap.get(
        `${path}.lexical_internal_feature.blocks.${kind}.${node.fields.blockType}.fields`,
      )
      if (!schema || !('fields' in schema)) {
        throw new Error('The destination editor does not support this embedded block')
      }
      node.fields.id = freshID()
      visitFields(node.fields, schema.fields)
    }
    if (node.root) {
      visitLexical(node.root, path)
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => visitLexical(child, path))
    }
  }

  result.id = freshID()
  visitFields(result, fields)
  return result
}
