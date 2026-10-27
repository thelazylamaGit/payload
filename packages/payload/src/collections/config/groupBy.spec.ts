import type { CollectionConfig } from './types.js'

import { describe, expect, it } from 'vitest'

import { InvalidConfiguration } from '../../errors/InvalidConfiguration.js'
import { getGroupByConfig, isGroupByAllowed, validateGroupBy } from './groupBy.js'

describe('getGroupByConfig', () => {
  it('should be disabled when groupBy is omitted or false', () => {
    expect(getGroupByConfig({ groupBy: undefined })).toEqual({ isEnabled: false })
    expect(getGroupByConfig({ groupBy: false })).toEqual({ isEnabled: false })
  })

  it('should allow every field without a default when groupBy is true', () => {
    expect(getGroupByConfig({ groupBy: true })).toEqual({ isEnabled: true })
  })

  it('should use a string as the default', () => {
    expect(getGroupByConfig({ groupBy: '-status' })).toEqual({
      defaultGroupBy: '-status',
      isEnabled: true,
    })
  })

  it('should use an array as the allowed options', () => {
    expect(getGroupByConfig({ groupBy: ['status', 'priority'] })).toEqual({
      isEnabled: true,
      options: ['status', 'priority'],
    })
  })

  it('should read the default and options from an object', () => {
    expect(getGroupByConfig({ groupBy: { default: 'status', options: ['status'] } })).toEqual({
      defaultGroupBy: 'status',
      isEnabled: true,
      options: ['status'],
    })
  })
})

describe('isGroupByAllowed', () => {
  it('should allow any field without options', () => {
    expect(isGroupByAllowed({ groupBy: 'title' })).toBe(true)
  })

  it('should only allow listed fields, ignoring the descending prefix', () => {
    expect(isGroupByAllowed({ groupBy: '-status', options: ['status'] })).toBe(true)
    expect(isGroupByAllowed({ groupBy: 'title', options: ['status'] })).toBe(false)
  })
})

describe('validateGroupBy', () => {
  const withGroupBy = (groupBy: NonNullable<CollectionConfig['admin']>['groupBy']) =>
    ({ slug: 'posts', admin: { groupBy }, fields: [] }) as CollectionConfig

  it('should accept a default that is one of the options', () => {
    expect(() =>
      validateGroupBy(withGroupBy({ default: '-status', options: ['status', 'priority'] })),
    ).not.toThrow()
  })

  it('should throw when the default is not one of the options', () => {
    expect(() =>
      validateGroupBy(withGroupBy({ default: 'title', options: ['status', 'priority'] })),
    ).toThrow(InvalidConfiguration)
  })
})
