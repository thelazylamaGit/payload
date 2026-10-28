import type {
  Data,
  Payload,
  PayloadRequest,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
  TypedUser,
} from 'payload'

import {
  getIgnoredContentPaths,
  isPublishedStatus,
  isSameDocumentContent,
} from '@payloadcms/ui/shared'

type Args = {
  payload: Payload
  req?: PayloadRequest
  user?: TypedUser
}

/**
 * Of the given documents with newer drafts, returns the IDs of those whose latest draft has the
 * same content as their published version, in all locales. Such documents have no changes to publish.
 */
export const getCollectionDraftsSameAsPublished = async ({
  collectionConfig,
  ids,
  payload,
  req,
  user,
}: {
  collectionConfig: SanitizedCollectionConfig
  ids: (number | string)[]
} & Args): Promise<Set<number | string>> => {
  const result = new Set<number | string>()

  if (!ids.length) {
    return result
  }

  const find = async (draft: boolean): Promise<Data[]> =>
    (
      await payload.find({
        collection: collectionConfig.slug,
        depth: 0,
        draft,
        locale: payload.config.localization ? 'all' : undefined,
        overrideAccess: false,
        pagination: false,
        req,
        trash: true,
        user,
        where: { id: { in: ids } },
      })
    ).docs

  // Sequential, as parallel queries are slower with some database adapters
  const drafts = await find(true)
  const published = new Map((await find(false)).map((doc) => [doc.id, doc]))
  const ignoredPaths = getIgnoredContentPaths(collectionConfig)

  for (const draft of drafts) {
    const publishedDoc = published.get(draft.id)

    if (
      publishedDoc &&
      isPublishedStatus(publishedDoc._status) &&
      isSameDocumentContent({ a: draft, b: publishedDoc, ignoredPaths })
    ) {
      result.add(draft.id)
    }
  }

  return result
}

/**
 * Whether the latest draft of a global has the same content as its published version, in all locales.
 */
export const getIsGlobalDraftSameAsPublished = async ({
  globalConfig,
  payload,
  req,
  user,
}: {
  globalConfig: SanitizedGlobalConfig
} & Args): Promise<boolean> => {
  const find = (draft: boolean): Promise<Data> =>
    payload.findGlobal({
      slug: globalConfig.slug,
      depth: 0,
      draft,
      locale: payload.config.localization ? 'all' : undefined,
      overrideAccess: false,
      req,
      user,
    })

  const draft = await find(true)
  const published = await find(false)

  return (
    isPublishedStatus(published?._status) &&
    isSameDocumentContent({
      a: draft,
      b: published,
      ignoredPaths: getIgnoredContentPaths(globalConfig),
    })
  )
}
