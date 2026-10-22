import type {
  ClipboardCopyActionArgs,
  ClipboardPasteActionArgs,
  ClipboardPasteActionValidateArgs,
  ClipboardPasteData,
} from './types.js'

import { isClipboardDataValid } from './isClipboardDataValid.js'

const localStorageClipboardKey = '_payloadClipboard'

/**
 * @note This function doesn't use the Clipboard API, but localStorage. See rationale in #11513
 */
export function clipboardCopy(args: ClipboardCopyActionArgs): string | true {
  const { getDataToCopy, t, ...rest } = args

  const dataToWrite = {
    data: getDataToCopy(),
    ...rest,
  }

  try {
    localStorage.setItem(localStorageClipboardKey, JSON.stringify(dataToWrite))
    return true
  } catch (_err) {
    return t('error:unableToCopy')
  }
}

/**
 * @note This function doesn't use the Clipboard API, but localStorage. See rationale in #11513
 */
export function clipboardPaste({
  blockInsertion,
  canPaste,
  onPaste,
  path: fieldPath,
  t,
  ...args
}: ClipboardPasteActionArgs): string | true {
  let dataToPaste: ClipboardPasteData

  try {
    const jsonFromClipboard = localStorage.getItem(localStorageClipboardKey)

    if (!jsonFromClipboard) {
      return t('error:invalidClipboardData')
    }

    dataToPaste = JSON.parse(jsonFromClipboard)
  } catch (_err) {
    return t('error:invalidClipboardData')
  }

  if (blockInsertion) {
    if (
      dataToPaste?.type !== 'blocks' ||
      !Number.isInteger(dataToPaste.rowIndex) ||
      dataToPaste.rowIndex < 0
    ) {
      return t('error:blockClipboardRequired')
    }
  }

  const dataToValidate = {
    ...dataToPaste,
    ...args,
    fieldPath,
  } as ClipboardPasteActionValidateArgs

  let isValid = false
  try {
    isValid = isClipboardDataValid(dataToValidate)
  } catch (_err) {
    return t('error:invalidClipboardData')
  }
  if (!isValid) {
    return t('error:invalidClipboardData')
  }

  const availability = canPaste?.(dataToPaste)
  if (typeof availability === 'string') {
    return availability
  }

  try {
    onPaste(dataToPaste)
  } catch (error) {
    if (blockInsertion) {
      return t('error:invalidClipboardData')
    }
    throw error
  }

  return true
}
