import type { ClientCollectionConfig, ClientGlobalConfig, Data, FormState } from 'payload'

import { dequal } from 'dequal/lite'
import { reduceFieldsToValues } from 'payload/shared'

import { requests } from '../../utilities/api.js'

/**
 * Document fields that change on every save or publish without the user editing them.
 */
export const getIgnoredContentPaths = (
  docConfig: ClientCollectionConfig | ClientGlobalConfig | undefined,
): string[] =>
  docConfig && 'timestamps' in docConfig && docConfig.timestamps === false
    ? ['_status']
    : ['_status', 'createdAt', 'updatedAt']

/**
 * Returns the values the form would submit, without form metadata (validation, collapsed rows, etc.)
 * and without the given top-level paths. Nested values are shared with the form state.
 */
export const getFormContent = ({
  fields,
  ignoredPaths,
}: {
  fields: FormState
  ignoredPaths: string[]
}): Data => {
  const content = reduceFieldsToValues(fields, true)

  for (const path of ignoredPaths) {
    delete content[path]
  }

  return (withoutEmptyValues(content) as Data) ?? {}
}

export const isSameFormContent = (a: Data, b: Data): boolean => {
  // `dequal` considers any two File objects equal, so a newly selected file must be compared by reference
  if ((a.file instanceof File || b.file instanceof File) && a.file !== b.file) {
    return false
  }

  return dequal(a, b)
}

/**
 * Whether the latest draft of a document has the same content as its published version.
 * Both are read through the same API, so their representations can be compared directly.
 */
export const getIsDraftSameAsPublished = async ({
  ignoredPaths,
  isLocalized,
  signal,
  url,
}: {
  ignoredPaths: string[]
  isLocalized: boolean
  signal: AbortSignal
  url: string
}): Promise<boolean> => {
  const [draft, published] = await Promise.all(
    [true, false].map(async (draft) => {
      const res = await requests.get(url, {
        params: { depth: 0, draft, ...(isLocalized ? { locale: 'all' } : {}) },
        signal,
      })

      if (!res.ok) {
        throw new Error(res.statusText)
      }

      const doc: Data = await res.json()

      for (const path of ignoredPaths) {
        delete doc[path]
      }

      return withoutEmptyValues(doc) as Data
    }),
  )

  return dequal(draft, published)
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

  if (typeof value !== 'object' || value instanceof File || value instanceof Date) {
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
