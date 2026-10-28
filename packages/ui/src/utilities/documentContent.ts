import type {
  ClientCollectionConfig,
  ClientGlobalConfig,
  Data,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
} from 'payload'

import { dequal } from 'dequal/lite'

/**
 * Document fields that change on every save or publish without the user editing them.
 */
export const getIgnoredContentPaths = (
  config:
    | ClientCollectionConfig
    | ClientGlobalConfig
    | SanitizedCollectionConfig
    | SanitizedGlobalConfig
    | undefined,
): string[] =>
  config && 'timestamps' in config && config.timestamps === false
    ? ['_status']
    : ['_status', 'createdAt', 'updatedAt']

/**
 * Whether two versions of a document have the same content, ignoring the given top-level paths and
 * values that are visually empty. Both must have the same representation, e.g. both from the API
 * or both from form state.
 */
export const isSameDocumentContent = ({
  a,
  b,
  ignoredPaths,
}: {
  a: Data
  b: Data
  ignoredPaths: string[]
}): boolean =>
  isSameContent(getDocumentContent(a, ignoredPaths), getDocumentContent(b, ignoredPaths))

/**
 * Whether a document read with `locale: 'all'` or a single locale is published in all of its locales.
 */
export const isPublishedStatus = (status: unknown): boolean =>
  status === 'published' ||
  (Boolean(status) &&
    typeof status === 'object' &&
    Object.values(status).every((localeStatus) => localeStatus === 'published'))

/**
 * Returns the content of a document without the given top-level paths and without empty values.
 * Nested values are shared with the given document.
 */
export const getDocumentContent = (doc: Data, ignoredPaths: string[]): Data => {
  const content = { ...doc }

  for (const path of ignoredPaths) {
    delete content[path]
  }

  return (withoutEmptyValues(content) as Data) ?? {}
}

/**
 * Compares content returned by `getDocumentContent`.
 */
export const isSameContent = (a: Data, b: Data): boolean => {
  // `dequal` considers any two File objects equal, so a newly selected file must be compared by reference
  if (
    ((typeof File !== 'undefined' && a.file instanceof File) ||
      (typeof File !== 'undefined' && b.file instanceof File)) &&
    a.file !== b.file
  ) {
    return false
  }

  return dequal(a, b)
}

/**
 * A rich text editor with no content, which is equivalent to an empty value.
 */
const isEmptyRichText = (value: Record<string, unknown>): boolean => {
  const root = value.root as { children?: unknown; type?: unknown } | undefined

  if (!root || typeof root !== 'object' || root.type !== 'root' || !Array.isArray(root.children)) {
    return false
  }

  const [paragraph, ...rest] = root.children as { children?: unknown[]; type?: unknown }[]

  return (
    !paragraph ||
    (rest.length === 0 && paragraph.type === 'paragraph' && !paragraph.children?.length)
  )
}

/**
 * Removes values that are visually empty, so that e.g. clearing a field that had no value,
 * or undoing all input in an empty rich text editor, is not a change.
 * Returns the same references for values that contain nothing empty.
 */
const withoutEmptyValues = (value: unknown): unknown => {
  if (value === null || value === undefined || value === '') {
    return undefined
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined
    }

    let result: undefined | unknown[]

    value.forEach((item, index) => {
      // Array items keep their position, so empty items become `null` rather than being removed
      const normalized = withoutEmptyValues(item) ?? null

      if (normalized !== item) {
        result ??= [...value]
        result[index] = normalized
      }
    })

    return result ?? value
  }

  if (
    typeof value !== 'object' ||
    (typeof File !== 'undefined' && value instanceof File) ||
    value instanceof Date
  ) {
    return value
  }

  if (isEmptyRichText(value as Record<string, unknown>)) {
    return undefined
  }

  let result: Record<string, unknown> | undefined

  for (const [key, item] of Object.entries(value)) {
    const normalized = withoutEmptyValues(item)

    if (normalized !== item) {
      result ??= { ...value }

      if (normalized === undefined) {
        delete result[key]
      } else {
        result[key] = normalized
      }
    }
  }

  return result ?? value
}
