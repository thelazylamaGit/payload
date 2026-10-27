import type { Data, FormState } from 'payload'

import { dequal } from 'dequal/lite'
import { deepCopyObjectSimpleWithoutReactComponents, reduceFieldsToValues } from 'payload/shared'

export type DocumentPublicationState = {
  otherLocalesHaveChanges: boolean
  published: Data | null
}

export const getIgnoredDocumentFields = (config: {
  slug: string
  timestamps?: unknown
  upload?: unknown
}): string[] => [
  '_status',
  ...(config && 'upload' in config && config.upload ? ['file'] : []),
  ...(!config || !('timestamps' in config) || config.timestamps !== false
    ? ['createdAt', 'updatedAt']
    : []),
]

/** Cache submitted values, rather than validation, row UI state, or mutable field objects. */
export const getFormContentSnapshot = (fields: FormState, ignoredFields: string[] = []): Data =>
  deepCopyObjectSimpleWithoutReactComponents(getFormContent(fields, ignoredFields))

export const hasFormContentChanges = (
  fields: FormState,
  savedContent: Data,
  ignoredFields: string[] = [],
): boolean => {
  // A newly selected file or a row awaiting its fields must be allowed to submit.
  // In particular, dequal/lite cannot distinguish File objects by their contents.
  if (
    (fields?.file?.value instanceof File && fields.file.value !== savedContent.file) ||
    Object.values(fields || {}).some((field) => field.rows?.some((row) => row.isLoading))
  ) {
    return true
  }

  return !dequal(getFormContent(fields, ignoredFields), savedContent)
}

const getFormContent = (fields: FormState, ignoredFields: string[]): Data => {
  const data = reduceFieldsToValues(fields, true)

  // The upload control can register an empty file field after initialisation.
  if (data.file === undefined) {
    delete data.file
  }

  for (const field of ignoredFields) {
    if (field !== 'file' || !(data.file instanceof File)) {
      delete data[field]
    }
  }

  return data
}
