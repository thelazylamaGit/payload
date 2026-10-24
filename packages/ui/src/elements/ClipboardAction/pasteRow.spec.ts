import type { FormState } from 'payload'

import { describe, expect, it } from 'vitest'

import { fieldReducer } from '../../forms/Form/fieldReducer.js'
import { captureRowPath } from './rowIdentity.js'

const prepared: FormState = {
  id: { value: 'prepared-id', valid: true },
  blockType: { value: 'accordion', valid: true },
  text: { value: 'unsaved source text', valid: true },
  'settings.id': { value: '0123456789abcdef01234567', valid: true },
  reference: { value: { id: 'relationship-id' }, valid: true },
  items: { value: 1, rows: [{ id: 'new-item' }], valid: true },
  'items.0.id': { value: 'new-item', valid: true },
}
function state(count = 3): FormState {
  return {
    layout: {
      value: count,
      rows: Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, blockType: 'accordion' })),
      valid: true,
    },
    ...Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        [`layout.${i}.id`, { value: `row-${i}`, valid: true }],
        [`layout.${i}.text`, { value: `keep-${i}`, valid: true }],
      ]).flat(),
    ),
    unrelated: { value: 'unchanged', valid: true },
  }
}
const action = (position: 'start' | 'end' | { after: string } | { replace: string }) => ({
  type: 'PASTE_ROW' as const,
  path: ['layout'],
  position,
  subFieldState: prepared,
  blockType: 'accordion',
})

describe('native row creation and clipboard paste lifecycle', () => {
  it('should demonstrate that native Add Row alone publishes an incomplete loading row', () => {
    const added = fieldReducer(state(0), {
      type: 'ADD_ROW',
      path: 'layout',
      blockType: 'accordion',
    })
    expect(added.layout.rows[0].isLoading).toBe(true)
    expect(added['layout.0.text']).toBeUndefined()
  })

  it.each([
    { count: 0, position: 'end' as const, index: 0 },
    { count: 3, position: 'start' as const, index: 0 },
    { count: 3, position: { after: 'row-0' }, index: 1 },
    { count: 3, position: { after: 'row-1' }, index: 2 },
    { count: 3, position: 'end' as const, index: 3 },
  ])(
    'should atomically insert at $index with $count existing rows',
    ({ count, position, index }) => {
      const before = state(count)
      const snapshot = structuredClone(before)
      const source = structuredClone(prepared)
      const result = fieldReducer(before, action(position))
      expect(before).toEqual(snapshot)
      expect(prepared).toEqual(source)
      expect(result.layout.rows).toHaveLength(count + 1)
      expect(result.layout.rows[index].isLoading).toBe(true)
      expect(result[`layout.${index}.text`].value).toBe('unsaved source text')
      expect(result[`layout.${index}.id`].value).toBe(result.layout.rows[index].id)
      expect(result[`layout.${index}.settings.id`].value).toBe(source['settings.id'].value)
      expect(result[`layout.${index}.reference`].value).toEqual(source.reference.value)
      expect(result[`layout.${index}.items`].rows[0].id).toBe(
        result[`layout.${index}.items.0.id`].value,
      )
      for (let i = 0; i < count; i++) {
        const moved = i >= index ? i + 1 : i
        expect(result.layout.rows[moved]).toEqual(before.layout.rows[i])
        expect(result[`layout.${moved}.text`]).toEqual(before[`layout.${i}.text`])
      }
      expect(result.unrelated).toBe(before.unrelated)
    },
  )

  it.each([true, false])(
    'should replace an existing row, empty=%s, retaining its identity',
    (empty) => {
      const before = state()
      if (empty) {
        delete before['layout.1.text']
      }
      before['layout.1.staleChild'] = { value: 'remove stale data', valid: true }
      const result = fieldReducer(before, action({ replace: 'row-1' }))
      expect(result.layout.rows).toHaveLength(3)
      expect(result.layout.rows[1].id).toBe('row-1')
      expect(result['layout.1.id'].value).toBe('row-1')
      expect(result['layout.1.text'].value).toBe('unsaved source text')
      expect(result['layout.1.staleChild']).toBeUndefined()
      expect(result['layout.0.text']).toBe(before['layout.0.text'])
    },
  )

  it('should follow the anchor after reordering during delayed preparation', async () => {
    const before = state()
    let complete: () => void
    const ready = new Promise<void>((resolve) => {
      complete = resolve
    })
    const transaction = action({ after: 'row-0' })
    const waiting = ready.then(() => fieldReducer(current, transaction))
    let current = fieldReducer(before, {
      type: 'MOVE_ROW',
      path: 'layout',
      moveFromIndex: 0,
      moveToIndex: 2,
    })
    complete()
    const result = await waiting
    expect(result.layout.rows[2].id).toBe('row-0')
    expect(result['layout.3.text'].value).toBe('unsaved source text')
  })

  it('should follow reordered ancestor rows rather than a stale numeric parent path', () => {
    const before = state()
    before['layout.0.children'] = { valid: true, value: 0, rows: [] }
    const path = captureRowPath({ path: 'layout.0.children', state: before })
    const moved = fieldReducer(before, {
      type: 'MOVE_ROW',
      path: 'layout',
      moveFromIndex: 0,
      moveToIndex: 2,
    })
    const result = fieldReducer(moved, { ...action('end'), path })
    expect(result['layout.2.children'].rows).toHaveLength(1)
    expect(result['layout.2.children.0.text'].value).toBe('unsaved source text')
    expect(result['layout.0.children']).toBeUndefined()
  })

  it('should apply repeated completed pastes to current state with distinct row identities', () => {
    const first = fieldReducer(state(0), action('end'))
    const second = fieldReducer(first, action('end'))
    expect(second.layout.rows).toHaveLength(2)
    expect(new Set(second.layout.rows.map((row) => row.id)).size).toBe(2)
  })

  it('should leave state untouched if the anchor or an ancestor was deleted', () => {
    const before = state()
    expect(fieldReducer(before, action({ after: 'deleted' }))).toBe(before)
    expect(
      fieldReducer(before, {
        ...action('end'),
        path: ['layout', { rowID: 'deleted' }, 'children'],
      }),
    ).toBe(before)
  })

  it('should recheck maxRows and dynamic restrictions at commit time', () => {
    const before = state()
    expect(fieldReducer(before, { ...action('end'), maxRows: 3 })).toBe(before)
    before.layout.blocksFilterOptions = ['video']
    expect(fieldReducer(before, action('end'))).toBe(before)
  })

  it('should permit native replacement at maxRows but reject changing the row type', () => {
    const before = state()
    expect(fieldReducer(before, { ...action({ replace: 'row-1' }), maxRows: 3 })).not.toBe(before)
    expect(fieldReducer(before, { ...action({ replace: 'row-1' }), blockType: 'video' })).toBe(
      before,
    )
  })
  it('should cancel an insertion if the destination condition no longer passes', () => {
    const before = state()
    before.layout.passesCondition = false
    expect(fieldReducer(before, action('end'))).toBe(before)
  })
})
