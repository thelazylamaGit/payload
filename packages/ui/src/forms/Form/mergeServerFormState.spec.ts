import type { FormState } from 'payload'

import { describe, expect, it } from 'vitest'

import { fieldReducer } from './fieldReducer.js'
import { mergeServerFormState } from './mergeServerFormState.js'

const field = (value: unknown) => ({ value })
const state: FormState = {
  rows: { value: 2, disableFormData: true, rows: [{ id: 'one' }, { id: 'two' }] },
  'rows.0.id': field('one'),
  'rows.0.text': field('First'),
  'rows.1.id': field('two'),
  'rows.1.text': field('Second'),
  slug: field('original'),
}

describe('merging successful document submissions', () => {
  it('should preserve multiple fields changed during autosave, not just the last modified field', () => {
    const submitted = { first: field('A'), second: field('B') }
    const current = { first: field('Edited A'), second: { ...field('Edited B'), isModified: true } }
    const result = mergeServerFormState({
      acceptValues: { overrideLocalChanges: false },
      submittedState: submitted,
      currentState: current,
      incomingState: submitted,
    })

    expect(result.first.value).toBe('Edited A')
    expect(result.second.value).toBe('Edited B')
  })

  it('should accept server normalisation of fields that were not edited during the request', () => {
    const result = mergeServerFormState({
      acceptValues: true,
      submittedState: state,
      currentState: { ...state, slug: { ...field('original'), isModified: true } },
      incomingState: { ...state, slug: field('normalised') },
    })

    expect(result.slug.value).toBe('normalised')
  })

  it('should preserve a local row reorder and avoid overwriting a different row at an old index', () => {
    const current = fieldReducer(state, {
      type: 'MOVE_ROW',
      path: 'rows',
      moveFromIndex: 0,
      moveToIndex: 1,
    })
    const result = mergeServerFormState({
      acceptValues: true,
      submittedState: state,
      currentState: current,
      incomingState: { ...state, 'rows.0.text': field('Server first') },
    })

    expect(result.rows.rows.map(({ id }) => id)).toEqual(['two', 'one'])
    expect(result['rows.0.text'].value).toBe('Second')
    expect(result['rows.1.text'].value).toBe('First')
  })

  it('should retain deleted rows as deleted while the request is pending', () => {
    const current = fieldReducer(state, { type: 'REMOVE_ROW', path: 'rows', rowIndex: 0 })
    const result = mergeServerFormState({
      acceptValues: true,
      submittedState: state,
      currentState: current,
      incomingState: state,
    })

    expect(result.rows.rows.map(({ id }) => id)).toEqual(['two'])
    expect(result['rows.0.text'].value).toBe('Second')
    expect(result['rows.1.text']).toBeUndefined()
  })

  it('should remove stale descendant fields when the server removes a row without concurrent edits', () => {
    const incoming = fieldReducer(state, { type: 'REMOVE_ROW', path: 'rows', rowIndex: 1 })
    const result = mergeServerFormState({
      acceptValues: true,
      submittedState: state,
      currentState: state,
      incomingState: incoming,
    })

    expect(result.rows.rows).toHaveLength(1)
    expect(result['rows.1.text']).toBeUndefined()
    expect(result['rows.1.id']).toBeUndefined()
  })

  it('should keep edited row values attached to the same row if the server reorders rows', () => {
    const incoming = fieldReducer(state, {
      type: 'MOVE_ROW',
      path: 'rows',
      moveFromIndex: 0,
      moveToIndex: 1,
    })
    const current = { ...state, 'rows.0.text': field('Typed in first row') }
    const result = mergeServerFormState({
      acceptValues: true,
      submittedState: state,
      currentState: current,
      incomingState: incoming,
    })

    expect(result.rows.rows.map(({ id }) => id)).toEqual(['one', 'two'])
    expect(result['rows.0.text'].value).toBe('Typed in first row')
    expect(result['rows.1.text'].value).toBe('Second')
  })
})
