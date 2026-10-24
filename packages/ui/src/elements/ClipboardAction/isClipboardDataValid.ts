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
    !path ||
    !args.type ||
    (rowIndex !== undefined && (!Number.isInteger(rowIndex) || rowIndex < 0))
  ) {
    return false
  }

  if (args.type === 'blocks') {
    if (
      !Array.isArray(args.blocks) ||
      args.blocks.some((block) => !block || typeof block.slug !== 'string')
    ) {
      return false
    }
    let blocksFromClipboard = args.blocks

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
  if (!fieldsFromConfig || fieldsFromClipboard.length !== fieldsFromConfig?.length) {
    return false
  }

  return fieldsFromClipboard.every((clipboardField, i) => {
    const configField = fieldsFromConfig[i]

    if (clipboardField.type !== configField.type) {
      return false
    }

    const affectsData = fieldAffectsData(clipboardField) && fieldAffectsData(configField)
    if (affectsData && clipboardField.name !== configField.name) {
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
