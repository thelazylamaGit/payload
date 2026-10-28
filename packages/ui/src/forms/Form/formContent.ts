import type { Data, FormState } from 'payload'

import { dequal } from 'dequal/lite'
import { reduceFieldsToValues } from 'payload/shared'

import { requests } from '../../utilities/api.js'
import { getDocumentContent, isPublishedStatus } from '../../utilities/documentContent.js'

export {
  getIgnoredContentPaths,
  isSameContent as isSameFormContent,
} from '../../utilities/documentContent.js'

/**
 * Returns the values the form would submit, without form metadata (validation, collapsed rows, etc.),
 * without the given top-level paths and without empty values. Nested values are shared with the form state.
 */
export const getFormContent = ({
  fields,
  ignoredPaths,
}: {
  fields: FormState
  ignoredPaths: string[]
}): Data => getDocumentContent(reduceFieldsToValues(fields, true), ignoredPaths)

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

      return (await res.json()) as Data
    }),
  )

  return (
    isPublishedStatus(published._status) &&
    dequal(getDocumentContent(draft, ignoredPaths), getDocumentContent(published, ignoredPaths))
  )
}
