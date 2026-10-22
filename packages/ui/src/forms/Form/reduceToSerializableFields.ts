import { type FormField, type FormState } from 'payload'

import { stripClipboardMetadata } from './stripClipboardMetadata.js'

type BlacklistedKeys = 'customComponents' | 'validate'
const blacklistedKeys: BlacklistedKeys[] = ['validate', 'customComponents']

const sanitizeField = (incomingField: FormField): FormField => {
  const field = { ...incomingField } // shallow copy, as we only need to remove top-level keys

  for (const key of blacklistedKeys) {
    delete field[key]
  }

  return field
}

/**
 * Takes in FormState and removes fields that are not serializable.
 * Returns FormState without blacklisted keys.
 */
export const reduceToSerializableFields = (
  fields: FormState,
): {
  [key: string]: Omit<FormField, BlacklistedKeys>
} => {
  const result: Record<string, Omit<FormField, BlacklistedKeys>> = {}

  const fieldsWithoutClipboardMetadata = stripClipboardMetadata(fields)

  for (const key in fieldsWithoutClipboardMetadata) {
    result[key] = sanitizeField(fieldsWithoutClipboardMetadata[key])
  }

  return result
}
