import type { ClientCollectionConfig, ClientGlobalConfig, Data, FormState } from 'payload'

import { dequal } from 'dequal/lite'
import { deepCopyObjectSimpleWithoutReactComponents, reduceFieldsToValues } from 'payload/shared'

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
 * Returns a detached copy of the values the form would submit, without form metadata
 * (validation, collapsed rows, etc.) and without the given top-level paths.
 */
export const getFormContent = ({
  fields,
  ignoredPaths,
}: {
  fields: FormState
  ignoredPaths: string[]
}): Data => {
  const content = deepCopyObjectSimpleWithoutReactComponents(reduceFieldsToValues(fields, true))

  for (const path of ignoredPaths) {
    delete content[path]
  }

  return content
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

      return doc
    }),
  )

  return dequal(draft, published)
}
