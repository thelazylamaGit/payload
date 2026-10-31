import type { ClientConfig, ClientField, Data, FormState } from 'payload'

import { requests } from '../../utilities/api.js'
import {
  isEmptyValue,
  isPublishedStatus,
  isSameDocumentContent,
} from '../../utilities/documentContent.js'

export {
  getIgnoredContentPaths,
  isSameContent as isSameFormContent,
} from '../../utilities/documentContent.js'

/**
 * Returns the non-empty values the form would submit by path, without form metadata
 * (validation, collapsed rows, etc.) and without the given top-level paths.
 */
export const getFormContent = ({
  fields,
  ignoredPaths,
}: {
  fields: FormState
  ignoredPaths: string[]
}): Data => {
  const content: Data = {}

  for (const [path, field] of Object.entries(fields || {})) {
    if (
      field &&
      !field.disableFormData &&
      !ignoredPaths.includes(path) &&
      !isEmptyValue(field.value)
    ) {
      content[path] = field.value
    }
  }

  return content
}

/**
 * Whether the latest draft of a document has the same content as its published version.
 * Both are read through the same API, so their representations can be compared directly.
 */
export const getIsDraftSameAsPublished = async ({
  config,
  fields,
  ignoredPaths,
  signal,
  url,
}: {
  config: ClientConfig
  fields: ClientField[]
  ignoredPaths: string[]
  signal: AbortSignal
  url: string
}): Promise<boolean> => {
  const localeCodes = config.localization ? config.localization.localeCodes : undefined

  const [draft, published] = await Promise.all(
    [true, false].map(async (draft) => {
      const res = await requests.get(url, {
        params: { depth: 0, draft, ...(localeCodes ? { locale: 'all' } : {}) },
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
    isSameDocumentContent({
      a: draft,
      b: published,
      blocks: config.blocksMap,
      fields: fields as Parameters<typeof isSameDocumentContent>[0]['fields'],
      ignoredPaths,
      localeCodes,
    })
  )
}
