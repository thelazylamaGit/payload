import type { FormState } from 'payload'

import type { RichTextClipboardMetadata } from '../../elements/ClipboardAction/types.js'

type FormStateRequest = {
  documentFormState?: FormState
  formState?: FormState
  initialBlockFormState?: FormState
  initialState?: FormState
}

/** Clipboard schemas stay in client form state; the server already has its own schemas. */
export function stripClipboardMetadata(formState: FormState): FormState {
  if (!formState) {
    return formState
  }

  return Object.fromEntries(
    Object.entries(formState).map(([path, field]) => {
      if (!field || !Object.hasOwn(field, 'clipboardBlocks')) {
        return [path, field]
      }

      const { clipboardBlocks: _, ...rest } = field as RichTextClipboardMetadata & typeof field

      return [path, rest]
    }),
  )
}

/** Covers the document and nested Lexical form states sent through the shared provider. */
export function stripClipboardMetadataFromRequest<T extends FormStateRequest>(args: T): T {
  const result = { ...args }

  for (const key of [
    'documentFormState',
    'formState',
    'initialBlockFormState',
    'initialState',
  ] as const) {
    if (args[key]) {
      result[key] = stripClipboardMetadata(args[key])
    }
  }

  return result
}
