import type { ClientBlock, ClientField } from 'payload'

import { fieldAffectsData, fieldHasSubFields } from 'payload/shared'

import type { ClipboardPasteActionValidateArgs } from './types.js'

/**
 * Validates whether clipboard data is compatible with the target schema.
 * For this to be true, the copied field and the target to be pasted must
 * be structurally equivalent (same schema)
 *
 * @returns True if the clipboard data is valid and can be pasted, false otherwise
 */
export function isClipboardDataValid({
  data,
  path,
  rowIndex,
  ...args
}: ClipboardPasteActionValidateArgs) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    typeof path !== 'string' ||
    !path ||
    !['array', 'blocks'].includes(args.type) ||
    (rowIndex !== undefined && (!Number.isInteger(rowIndex) || rowIndex < 0))
  ) {
    return false
  }

  if (args.type === 'blocks') {
    let blocksFromClipboard = args.blocks

    if (
      !Array.isArray(args.blocks) ||
      args.blocks.some((block) => !block || typeof block.slug !== 'string')
    ) {
      return false
    }

    if (typeof rowIndex === 'number') {
      const blockType = data?.[`${path}.${rowIndex}.blockType`]?.value
      const selectedBlock = args.blocks?.find((block) => block.slug === blockType)

      if (!selectedBlock) {
        return false
      }

      blocksFromClipboard = [selectedBlock]
    }

    return isClipboardBlocksValid({
      blocksFromClipboard,
      blocksFromConfig: args.schemaBlocks,
    })
  } else {
    return isClipboardFieldsValid({
      fieldsFromClipboard: args.fields,
      fieldsFromConfig: args.schemaFields,
    })
  }
}

function isClipboardFieldsValid({
  fieldsFromClipboard,
  fieldsFromConfig,
}: {
  fieldsFromClipboard: ClientField[]
  fieldsFromConfig?: ClientField[]
}): boolean {
  if (
    !Array.isArray(fieldsFromClipboard) ||
    !Array.isArray(fieldsFromConfig) ||
    fieldsFromClipboard.length !== fieldsFromConfig.length
  ) {
    return false
  }

  return fieldsFromClipboard.every((clipboardField, i) => {
    const configField = fieldsFromConfig[i]

    if (!clipboardField || !configField || clipboardField.type !== configField.type) {
      return false
    }

    const affectsData = fieldAffectsData(clipboardField) && fieldAffectsData(configField)
    if (affectsData && clipboardField.name !== configField.name) {
      return false
    }

    if (clipboardField.type === 'tabs' && configField.type === 'tabs') {
      return (
        Array.isArray(clipboardField.tabs) &&
        clipboardField.tabs.length === configField.tabs.length &&
        clipboardField.tabs.every((tab, index) => {
          const target = configField.tabs[index]
          return (
            ('name' in tab ? tab.name : undefined) ===
              ('name' in target ? target.name : undefined) &&
            isClipboardFieldsValid({
              fieldsFromClipboard: tab.fields,
              fieldsFromConfig: target.fields,
            })
          )
        })
      )
    }
    if (clipboardField.type === 'blocks' && configField.type === 'blocks') {
      const source = clipboardField.blockReferences ?? clipboardField.blocks ?? []
      const target = configField.blockReferences ?? configField.blocks ?? []
      return (
        Array.isArray(source) &&
        source.length === target.length &&
        source.every((block) => {
          if (typeof block === 'string') {
            return target.includes(block)
          }
          const destination = target.find(
            (entry) => typeof entry !== 'string' && entry.slug === block.slug,
          )
          return (
            destination &&
            typeof destination !== 'string' &&
            isClipboardBlocksValid({
              blocksFromClipboard: [block],
              blocksFromConfig: [destination],
            })
          )
        })
      )
    }
    if ('hasMany' in clipboardField || 'hasMany' in configField) {
      if (Boolean(clipboardField['hasMany']) !== Boolean(configField['hasMany'])) {
        return false
      }
    }
    if (
      'relationTo' in clipboardField &&
      'relationTo' in configField &&
      JSON.stringify(clipboardField.relationTo) !== JSON.stringify(configField.relationTo)
    ) {
      return false
    }

    const hasNestedFieldsConfig = fieldHasSubFields(configField)
    const hasNestedFieldsClipboard = fieldHasSubFields(clipboardField)
    if (hasNestedFieldsClipboard !== hasNestedFieldsConfig) {
      return false
    }

    if (hasNestedFieldsClipboard && hasNestedFieldsConfig) {
      return isClipboardFieldsValid({
        fieldsFromClipboard: clipboardField.fields,
        fieldsFromConfig: configField.fields,
      })
    }

    return true
  })
}

function isClipboardBlocksValid({
  blocksFromClipboard,
  blocksFromConfig,
}: {
  blocksFromClipboard: ClientBlock[]
  blocksFromConfig?: ClientBlock[]
}) {
  if (
    !Array.isArray(blocksFromClipboard) ||
    !Array.isArray(blocksFromConfig) ||
    blocksFromClipboard.some((block) => !block || typeof block.slug !== 'string')
  ) {
    return false
  }
  const configBlockMap = new Map(blocksFromConfig?.map((block) => [block.slug, block]))

  if (!configBlockMap.size) {
    return false
  }

  const checkedSlugs = new Set<string>()

  for (const currBlock of blocksFromClipboard) {
    const currSlug = currBlock.slug

    if (!checkedSlugs.has(currSlug)) {
      const configBlock = configBlockMap.get(currSlug)
      if (!configBlock) {
        return false
      }

      if (
        !isClipboardFieldsValid({
          fieldsFromClipboard: currBlock.fields,
          fieldsFromConfig: configBlock.fields,
        })
      ) {
        return false
      }

      checkedSlugs.add(currSlug)
    }
  }
  return true
}
