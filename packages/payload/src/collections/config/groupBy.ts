import type { CollectionAdminOptions, CollectionConfig } from './types.js'

import { InvalidConfiguration } from '../../errors/InvalidConfiguration.js'

export type GroupByConfig = {
  /** Field to group by when no URL param, query preset or saved preference applies */
  defaultGroupBy?: string
  isEnabled: boolean
  /** When set, only these fields can be grouped by */
  options?: string[]
}

/**
 * Normalizes every accepted shape of `admin.groupBy` into a single config object.
 */
export const getGroupByConfig = ({
  groupBy,
}: {
  groupBy: CollectionAdminOptions['groupBy']
}): GroupByConfig => {
  if (!groupBy) {
    return { isEnabled: false }
  }

  if (groupBy === true) {
    return { isEnabled: true }
  }

  if (typeof groupBy === 'string') {
    return { defaultGroupBy: groupBy, isEnabled: true }
  }

  if (Array.isArray(groupBy)) {
    return { isEnabled: true, options: groupBy }
  }

  return { defaultGroupBy: groupBy.default, isEnabled: true, options: groupBy.options }
}

/**
 * Returns whether `groupBy` (optionally prefixed with `-`) may be used with the given options.
 */
export const isGroupByAllowed = ({
  groupBy,
  options,
}: {
  groupBy: string
  options?: string[]
}): boolean => !options || options.includes(groupBy.replace(/^-/, ''))

export const validateGroupBy = (config: CollectionConfig): void => {
  const { defaultGroupBy, options } = getGroupByConfig({ groupBy: config.admin?.groupBy })

  if (defaultGroupBy && !isGroupByAllowed({ groupBy: defaultGroupBy, options })) {
    throw new InvalidConfiguration(
      `The default "${defaultGroupBy}" specified in "admin.groupBy" is not one of its options in the collection "${config.slug}"`,
    )
  }
}
