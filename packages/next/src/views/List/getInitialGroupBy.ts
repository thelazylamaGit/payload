import type { CollectionPreferences, QueryPreset, SanitizedCollectionConfig } from 'payload'

import { getGroupByConfig, isGroupByAllowed } from 'payload/shared'

/**
 * Resolves the group-by field for the initial list query.
 * Precedence: URL query → query preset → saved preferences → `admin.groupBy` default.
 * Values outside the configured `admin.groupBy` options are skipped.
 * An empty string means the user cleared grouping, so it is kept rather than replaced by the default.
 */
export const getInitialGroupBy = ({
  collectionConfig,
  collectionPreferences,
  groupByFromQuery,
  queryPreset,
}: {
  collectionConfig: SanitizedCollectionConfig
  collectionPreferences?: CollectionPreferences
  groupByFromQuery?: string
  queryPreset?: QueryPreset
}): string | undefined => {
  const { defaultGroupBy, options } = getGroupByConfig({
    groupBy: collectionConfig.admin?.groupBy,
  })

  return [
    groupByFromQuery,
    queryPreset?.groupBy,
    collectionPreferences?.groupBy,
    defaultGroupBy,
  ].find(
    (groupBy) =>
      typeof groupBy === 'string' && (groupBy === '' || isGroupByAllowed({ groupBy, options })),
  )
}
