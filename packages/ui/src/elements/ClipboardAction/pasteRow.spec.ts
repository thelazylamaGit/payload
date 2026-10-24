import type { FormState } from 'payload'

import { describe, expect, it } from 'vitest'

import type { PastePosition } from '../../forms/Form/types.js'
import type { ClipboardPasteData } from './types.js'

import { fieldReducer } from '../../forms/Form/fieldReducer.js'

function clipboard(): ClipboardPasteData {
  return {
    type: 'blocks',
    blocks: [],
    path: 'source',
    rowIndex: 0,
    data: {
      'source.0.id': { value: '0123456789abcdef01234560', valid: true },
      'source.0.blockType': { value: 'accordion', valid: true },
      'source.0.text': { value: 'unsaved source text', valid: true },
      'source.0.reference': { value: { id: 'external-reference' }, valid: true },
      'source.0.body': {
        value: {
          root: {
            children: [
              { type: 'block', fields: { id: 'native-rich-text-id', blockType: 'panel' } },
            ],
          },
        },
        valid: true,
      },
      'source.0.items': { value: 1, rows: [{ id: '0123456789abcdef01234561' }], valid: true },
      'source.0.items.0.id': { value: '0123456789abcdef01234561', valid: true },
    },
  }
}
function state(count = 3): FormState {
  return {
    layout: {
      value: count,
      valid: true,
      rows: Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, blockType: 'accordion' })),
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
const action = (position: PastePosition) => ({
  type: 'PASTE_ROW' as const,
  path: 'layout',
  position,
  dataFromClipboard: clipboard(),
})

describe('native creation and paste in one reducer transition', () => {
  it.each([
    { count: 0, position: 'end' as const, index: 0 },
    { count: 3, position: 'start' as const, index: 0 },
    { count: 3, position: { after: 'row-0' }, index: 1 },
    { count: 3, position: { after: 'row-1' }, index: 2 },
    { count: 3, position: 'end' as const, index: 3 },
  ])(
    'should insert complete content at $index with $count existing rows',
    ({ count, position, index }) => {
      const before = state(count)
      const snapshot = structuredClone(before)
      const result = fieldReducer(before, action(position))
      expect(before).toEqual(snapshot)
      expect(result.layout.rows).toHaveLength(count + 1)
      expect(result[`layout.${index}.text`].value).toBe('unsaved source text')
      expect(result[`layout.${index}.id`].value).toBe(result.layout.rows[index].id)
      expect(result[`layout.${index}.id`].value).not.toBe('0123456789abcdef01234560')
      expect(result[`layout.${index}.items.0.id`].value).not.toBe('0123456789abcdef01234561')
      expect(result[`layout.${index}.items`].rows[0].id).toBe(
        result[`layout.${index}.items.0.id`].value,
      )
      expect(result[`layout.${index}.reference`].value).toEqual({ id: 'external-reference' })
      // Rich-text JSON follows stock paste behavior: no extra ID traversal.
      expect(result[`layout.${index}.body`].value).toEqual(clipboard().data['source.0.body'].value)
      for (let i = 0; i < count; i++) {
        const moved = i >= index ? i + 1 : i
        expect(result.layout.rows[moved]).toEqual(before.layout.rows[i])
        expect(result[`layout.${moved}.text`]).toEqual(before[`layout.${i}.text`])
      }
      expect(result.unrelated).toBe(before.unrelated)
    },
  )

  it('should follow the anchor if an earlier queued action reordered it', () => {
    const moved = fieldReducer(state(), {
      type: 'MOVE_ROW',
      path: 'layout',
      moveFromIndex: 0,
      moveToIndex: 2,
    })
    const result = fieldReducer(moved, action({ after: 'row-0' }))
    expect(result.layout.rows[2].id).toBe('row-0')
    expect(result['layout.3.text'].value).toBe('unsaved source text')
  })

  it('should leave state untouched if the anchor was deleted', () => {
    const before = state()
    expect(fieldReducer(before, action({ after: 'deleted' }))).toBe(before)
  })

  it('should enforce maxRows and dynamic restrictions at commit', () => {
    const before = state()
    expect(fieldReducer(before, { ...action('end'), maxRows: 3 })).toBe(before)
    before.layout.blocksFilterOptions = ['video']
    expect(fieldReducer(before, action('end'))).toBe(before)
  })

  it('should reject a destination whose condition no longer passes', () => {
    const before = state()
    before.layout.passesCondition = false
    expect(fieldReducer(before, action('end'))).toBe(before)
  })
})
