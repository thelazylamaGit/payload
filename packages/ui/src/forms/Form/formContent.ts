import type { Data, FormState } from 'payload'

import { dequal } from 'dequal/lite'
import { deepCopyObjectSimpleWithoutReactComponents, reduceFieldsToValues } from 'payload/shared'

/** Cache submitted values, rather than validation, row UI state, or mutable field objects. */
export const getFormContentSnapshot = (fields: FormState): Data =>
  deepCopyObjectSimpleWithoutReactComponents(getFormContent(fields))

export const hasFormContentChanges = (fields: FormState, savedContent: Data): boolean => {
  // A newly selected file or a row awaiting its fields must be allowed to submit.
  // In particular, dequal/lite cannot distinguish File objects by their contents.
  if (
    (fields?.file?.value instanceof File && fields.file.value !== savedContent.file) ||
    Object.values(fields || {}).some((field) => field.rows?.some((row) => row.isLoading))
  ) {
    return true
  }

  return !dequal(getFormContent(fields), savedContent)
}

const getFormContent = (fields: FormState): Data => {
  const data = reduceFieldsToValues(fields, true)

  // The upload control can register an empty file field after initialisation.
  if (data.file === undefined) {
    delete data.file
  }

  return data
}
