import type { QueryPreset, SanitizedCollectionConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { getInitialGroupBy } from './getInitialGroupBy.js'

const withGroupBy = (groupBy?: boolean | string) =>
  ({ admin: { groupBy } }) as unknown as SanitizedCollectionConfig

describe('getInitialGroupBy', () => {
  it('should use the configured default when nothing else is set', () => {
    expect(getInitialGroupBy({ collectionConfig: withGroupBy('status') })).toBe('status')
  })

  it('should keep a descending configured default', () => {
    expect(getInitialGroupBy({ collectionConfig: withGroupBy('-status') })).toBe('-status')
  })

  it('should not group by default when groupBy is true', () => {
    expect(getInitialGroupBy({ collectionConfig: withGroupBy(true) })).toBeUndefined()
  })

  it('should not group by default when groupBy is false or omitted', () => {
    expect(getInitialGroupBy({ collectionConfig: withGroupBy(false) })).toBeUndefined()
    expect(getInitialGroupBy({ collectionConfig: withGroupBy() })).toBeUndefined()
  })

  it('should prefer the URL query over the default', () => {
    expect(
      getInitialGroupBy({ collectionConfig: withGroupBy('status'), groupByFromQuery: 'category' }),
    ).toBe('category')
  })

  it('should prefer the query preset over the default', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy('status'),
        queryPreset: { groupBy: 'category' } as QueryPreset,
      }),
    ).toBe('category')
  })

  it('should prefer saved preferences over the default', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy('status'),
        collectionPreferences: { groupBy: 'category' },
      }),
    ).toBe('category')
  })

  it('should keep grouping cleared when the user saved an empty groupBy preference', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy('status'),
        collectionPreferences: { groupBy: '' },
      }),
    ).toBe('')
  })

  it('should keep grouping cleared when the URL query has an empty groupBy', () => {
    expect(
      getInitialGroupBy({ collectionConfig: withGroupBy('status'), groupByFromQuery: '' }),
    ).toBe('')
  })
})
