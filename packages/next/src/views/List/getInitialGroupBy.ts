import type { CollectionPreferences, QueryPreset, SanitizedCollectionConfig } from 'payload'

/**
 * Resolves the group-by field for the initial list query.
 * Precedence: URL query → query preset → saved preferences → `admin.groupBy` default.
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
}): string | undefined =>
  groupByFromQuery ??
  queryPreset?.groupBy ??
  collectionPreferences?.groupBy ??
  (typeof collectionConfig.admin?.groupBy === 'string' ? collectionConfig.admin.groupBy : undefined)
