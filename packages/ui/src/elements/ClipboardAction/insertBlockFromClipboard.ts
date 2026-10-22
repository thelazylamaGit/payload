import type { ClientBlock, ClientField, FormState } from 'payload'

import ObjectIdImport from 'bson-objectid'

import type { ClipboardPasteData, RichTextClipboardMetadata } from './types.js'

import { fieldReducer } from '../../forms/Form/fieldReducer.js'

const ObjectId = 'default' in ObjectIdImport ? ObjectIdImport.default : ObjectIdImport
const freshID = () => new ObjectId().toHexString()

export function canInsertBlock({
  blockType,
  disabled,
  fieldState,
  maxRows,
  readOnly,
}: {
  blockType: string
  disabled?: boolean
  fieldState?: FormState[string]
  maxRows?: number
  readOnly?: boolean
}): boolean {
  return (
    !readOnly &&
    !disabled &&
    (!maxRows || (fieldState?.rows?.length ?? 0) < maxRows) &&
    (!Array.isArray(fieldState?.blocksFilterOptions) ||
      fieldState.blocksFilterOptions.includes(blockType))
  )
}

/** Insert serialized current form state using the same row shifting as the native Add Block action. */
export function insertBlockFromClipboard({
  blocksMap,
  dataFromClipboard,
  formState,
  path,
  rowIndex,
}: {
  blocksMap: Record<string, ClientBlock>
  dataFromClipboard: ClipboardPasteData
  formState: FormState
  path: string
  rowIndex: number
}): FormState {
  const prefix = `${dataFromClipboard.path}.${dataFromClipboard.rowIndex}.`
  const subFieldState: FormState = {}

  for (const [key, state] of Object.entries(dataFromClipboard.data)) {
    if (key.startsWith(prefix)) {
      subFieldState[key.slice(prefix.length)] = structuredClone(state)
    }
  }

  const richTextBlocksMap = {
    ...blocksMap,
    ...Object.fromEntries(
      Object.values(subFieldState).flatMap((state) =>
        ((state as RichTextClipboardMetadata).clipboardBlocks ?? []).map((block) => [
          block.slug,
          block,
        ]),
      ),
    ),
  }
  const blockType = subFieldState.blockType.value as string
  const block =
    dataFromClipboard.type === 'blocks'
      ? dataFromClipboard.blocks.find((block) => block.slug === blockType)
      : undefined

  // Only structural row IDs are replaced. A relationship/upload value (even a populated
  // object with an id) and user-defined fields called id retain their values.
  const setID = (key: string, id: string) => {
    subFieldState[key] = { ...subFieldState[key], initialValue: id, valid: true, value: id }
  }
  setID('id', freshID())
  for (const [key, state] of Object.entries(subFieldState)) {
    if (Array.isArray(state.rows)) {
      state.rows = state.rows.map((row, index) => {
        const id = freshID()
        setID(`${key}.${index}.id`, id)
        return { ...row, id, isLoading: false }
      })
    }
  }

  const regenerateRichText = (value: unknown): void => {
    if (!value || typeof value !== 'object') {
      return
    }
    const node = value as {
      children?: unknown[]
      fields?: Record<string, unknown>
      root?: unknown
      type?: string
    }
    if ((node.type === 'block' || node.type === 'inlineBlock') && node.fields) {
      node.fields.id = freshID()
      const schema =
        typeof node.fields.blockType === 'string'
          ? richTextBlocksMap[node.fields.blockType]
          : undefined
      if (schema) {
        regenerateData(node.fields, schema.fields)
      }
    }
    // Follow only Lexical's tree, never relationship/upload payloads.
    if (node.root) {
      regenerateRichText(node.root)
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(regenerateRichText)
    }
  }
  const regenerateData = (data: Record<string, unknown>, fields: ClientField[]): void => {
    for (const field of fields) {
      if (field.type === 'tabs') {
        for (const tab of field.tabs) {
          regenerateData(
            ('name' in tab ? (data[tab.name] ?? {}) : data) as Record<string, unknown>,
            tab.fields,
          )
        }
      } else if ('name' in field) {
        const value = data[field.name]
        if (field.type === 'array' && Array.isArray(value)) {
          for (const row of value) {
            row.id = freshID()
            regenerateData(row, field.fields)
          }
        } else if (field.type === 'blocks' && Array.isArray(value)) {
          for (const row of value) {
            row.id = freshID()
            const schema = resolveBlock(field, row.blockType, richTextBlocksMap)
            if (schema) {
              regenerateData(row, schema.fields)
            }
          }
        } else if (field.type === 'richText') {
          regenerateRichText(value)
        } else if ('fields' in field && value && typeof value === 'object') {
          regenerateData(value as Record<string, unknown>, field.fields)
        }
      } else if ('fields' in field) {
        regenerateData(data, field.fields)
      }
    }
  }
  const visitFields = (fields: ClientField[], prefix = ''): void => {
    for (const field of fields) {
      if (field.type === 'tabs') {
        for (const tab of field.tabs) {
          visitFields(tab.fields, 'name' in tab ? `${prefix}${tab.name}.` : prefix)
        }
      } else {
        const key = 'name' in field ? `${prefix}${field.name}` : prefix.slice(0, -1)
        if (field.type === 'richText' && subFieldState[key]) {
          regenerateRichText(subFieldState[key].value)
          regenerateRichText(subFieldState[key].initialValue)
        } else if (field.type === 'array' || field.type === 'blocks') {
          subFieldState[key]?.rows?.forEach((row, index) => {
            const fields =
              field.type === 'array'
                ? field.fields
                : resolveBlock(field, row.blockType, blocksMap)?.fields
            if (fields) {
              visitFields(fields, `${key}.${index}.`)
            }
          })
        } else if ('fields' in field) {
          visitFields(field.fields, 'name' in field ? `${key}.` : prefix)
        }
      }
    }
  }
  if (block) {
    visitFields(block.fields)
  }

  const result = fieldReducer(formState, {
    type: 'ADD_ROW',
    blockType,
    path,
    rowIndex,
    subFieldState,
  })
  result[path].rows[rowIndex].isLoading = false
  return result
}

function resolveBlock(
  field: Extract<ClientField, { type: 'blocks' }>,
  slug: string,
  blocksMap: Record<string, ClientBlock>,
): ClientBlock | undefined {
  const blocks = field.blockReferences ?? field.blocks
  const block = blocks.find((block) =>
    typeof block === 'string' ? block === slug : block.slug === slug,
  )
  return typeof block === 'string' ? blocksMap[block] : block
}
