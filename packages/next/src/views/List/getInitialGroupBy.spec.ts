import type { QueryPreset, SanitizedCollectionConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { getInitialGroupBy } from './getInitialGroupBy.js'

const withGroupBy = (groupBy?: SanitizedCollectionConfig['admin']['groupBy']) =>
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

  it('should use the default from an object config', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy({ default: 'status', options: ['status', 'priority'] }),
      }),
    ).toBe('status')
  })

  it('should not group by default when only options are configured', () => {
    expect(
      getInitialGroupBy({ collectionConfig: withGroupBy(['status', 'priority']) }),
    ).toBeUndefined()
  })

  it('should keep an allowed URL query', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy({ default: 'status', options: ['status', 'priority'] }),
        groupByFromQuery: '-priority',
      }),
    ).toBe('-priority')
  })

  it('should skip a URL query outside the options and fall back to the default', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy({ default: 'status', options: ['status', 'priority'] }),
        groupByFromQuery: 'title',
      }),
    ).toBe('status')
  })

  it('should skip a query preset outside the options and use the next allowed value', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy(['status', 'priority']),
        collectionPreferences: { groupBy: 'priority' },
        queryPreset: { groupBy: 'author' } as QueryPreset,
      }),
    ).toBe('priority')
  })

  it('should not group when every value is outside the options and there is no default', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy(['status', 'priority']),
        collectionPreferences: { groupBy: 'title' },
      }),
    ).toBeUndefined()
  })

  it('should keep grouping cleared when options are configured', () => {
    expect(
      getInitialGroupBy({
        collectionConfig: withGroupBy({ default: 'status', options: ['status'] }),
        collectionPreferences: { groupBy: '' },
      }),
    ).toBe('')
  })
})
