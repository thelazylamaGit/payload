import type { FormState } from 'payload'

import { describe, expect, it } from 'vitest'

import { fieldReducer } from './fieldReducer.js'
import {
  getFormContentSnapshot,
  getIgnoredDocumentFields,
  hasFormContentChanges,
} from './formContent.js'

const field = <T>(value: T) => ({ initialValue: value, value })

const initialRichText = {
  root: { children: [{ text: 'Hello', type: 'text' }], type: 'root' },
}

const initialState: FormState = {
  title: field('Original'),
  richText: field(initialRichText),
  blocks: { disableFormData: true, rows: [{ id: 'one' }, { id: 'two' }], value: 2 },
  'blocks.0.id': field('one'),
  'blocks.0.blockType': field('content'),
  'blocks.0.content': field('First'),
  'blocks.1.id': field('two'),
  'blocks.1.blockType': field('content'),
  'blocks.1.content': field('Second'),
  relationship: field({ relationTo: 'posts', value: 12 }),
  upload: field(24),
}

describe('form content comparison', () => {
  it('should ignore system timestamps and publication status while keeping nested metadata meaningful', () => {
    const ignored = getIgnoredDocumentFields({ slug: 'posts' })
    const original = {
      title: field('Original'),
      updatedAt: field('old'),
      _status: field('published'),
      'group.updatedAt': field('content date'),
    }
    const saved = getFormContentSnapshot(original, ignored)

    expect(
      hasFormContentChanges(
        { ...original, updatedAt: field('new'), _status: field('draft') },
        saved,
        ignored,
      ),
    ).toBe(false)
    expect(
      hasFormContentChanges(
        { ...original, 'group.updatedAt': field('edited content date') },
        saved,
        ignored,
      ),
    ).toBe(true)
  })

  it('should preserve a custom timestamp field when system timestamps are disabled', () => {
    const ignored = getIgnoredDocumentFields({ slug: 'posts', timestamps: false })
    const original = { updatedAt: field('meaningful date') }

    expect(
      hasFormContentChanges(
        { updatedAt: field('edited date') },
        getFormContentSnapshot(original, ignored),
        ignored,
      ),
    ).toBe(true)
  })

  it('should detect and undo an edit to actual Lexical text JSON', () => {
    const saved = getFormContentSnapshot(initialState)
    const changed = structuredClone(initialRichText)

    changed.root.children[0].text = 'Edited text'

    expect(hasFormContentChanges({ ...initialState, richText: field(changed) }, saved)).toBe(true)
    changed.root.children[0].text = 'Hello'
    expect(hasFormContentChanges({ ...initialState, richText: field(changed) }, saved)).toBe(false)
  })

  it.each(['title', 'richText', 'blocks.0.content', 'relationship', 'upload'])(
    'should clear unsaved changes when %s is edited and restored',
    (path) => {
      const snapshot = getFormContentSnapshot(initialState)
      const edited = { ...initialState, [path]: field('Changed') }

      expect(hasFormContentChanges(edited, snapshot)).toBe(true)
      expect(hasFormContentChanges({ ...edited, [path]: initialState[path] }, snapshot)).toBe(false)
    },
  )

  it('should ignore validation and collapsed row metadata', () => {
    const snapshot = getFormContentSnapshot(initialState)
    const fields = {
      ...initialState,
      title: { ...initialState.title, errorMessage: 'Required', valid: false, isModified: true },
      blocks: { ...initialState.blocks, rows: [{ id: 'one', collapsed: true }, { id: 'two' }] },
    }

    expect(hasFormContentChanges(fields, snapshot)).toBe(false)
  })

  it('should ignore object key order while preserving rich text metadata', () => {
    const fields = { json: field({ text: 'Hello', format: 1 }) }
    const snapshot = getFormContentSnapshot(fields)

    expect(hasFormContentChanges({ json: field({ format: 1, text: 'Hello' }) }, snapshot)).toBe(
      false,
    )
    expect(hasFormContentChanges({ json: field({ format: 0, text: 'Hello' }) }, snapshot)).toBe(
      true,
    )
  })

  it('should detect array reordering and clear changes when order is restored', () => {
    const snapshot = getFormContentSnapshot(initialState)
    const moved = fieldReducer(initialState, {
      type: 'MOVE_ROW',
      path: 'blocks',
      moveFromIndex: 0,
      moveToIndex: 1,
    })
    const restored = fieldReducer(moved, {
      type: 'MOVE_ROW',
      path: 'blocks',
      moveFromIndex: 1,
      moveToIndex: 0,
    })

    expect(hasFormContentChanges(moved, snapshot)).toBe(true)
    expect(hasFormContentChanges(restored, snapshot)).toBe(false)
  })

  it('should detect deleted rows', () => {
    const snapshot = getFormContentSnapshot(initialState)
    const fields = fieldReducer(initialState, { type: 'REMOVE_ROW', path: 'blocks', rowIndex: 0 })

    expect(hasFormContentChanges(fields, snapshot)).toBe(true)
  })

  it('should retain a snapshot when a field value is mutated in place', () => {
    const fields = { json: field({ nested: { text: 'Original' } }) }
    const snapshot = getFormContentSnapshot(fields)

    fields.json.value.nested.text = 'Changed'

    expect(hasFormContentChanges(fields, snapshot)).toBe(true)
  })

  it('should allow a pending row to submit before its fields arrive', () => {
    const fields = {
      blocks: { ...initialState.blocks, rows: [{ id: 'one', isLoading: true }] },
    }
    const snapshot = getFormContentSnapshot(fields)

    expect(hasFormContentChanges(fields, snapshot)).toBe(true)
  })

  it('should allow a selected file even when File objects appear equal to dequal/lite', () => {
    const fields = { file: field(new File(['content'], 'upload.txt')) }
    const snapshot = getFormContentSnapshot({})

    expect(hasFormContentChanges(fields, snapshot)).toBe(true)
  })

  it('should distinguish a new file from a successfully saved file', () => {
    const fields = { file: field(new File(['content'], 'upload.txt')) }
    const snapshot = getFormContentSnapshot(fields)

    expect(hasFormContentChanges(fields, snapshot)).toBe(false)
    expect(
      hasFormContentChanges({ file: field(new File(['other'], 'upload.txt')) }, snapshot),
    ).toBe(true)
  })

  it('should ignore an empty upload control registered after initialisation', () => {
    expect(hasFormContentChanges({ file: field(undefined) }, getFormContentSnapshot({}))).toBe(
      false,
    )
  })

  it('should compare a large document with nested blocks and rich text', () => {
    const fields: FormState = { blocks: { disableFormData: true, value: 1000 } }

    for (let i = 0; i < 1000; i++) {
      fields[`blocks.${i}.id`] = field(String(i))
      fields[`blocks.${i}.content`] = field({ root: { children: [{ text: `Block ${i}` }] } })
      fields[`blocks.${i}.nested.0.text`] = field(`Nested ${i}`)
    }

    const snapshot = getFormContentSnapshot(fields)

    expect(hasFormContentChanges(fields, snapshot)).toBe(false)

    fields['blocks.999.nested.0.text'] = field('Changed')

    expect(hasFormContentChanges(fields, snapshot)).toBe(true)
  })
})
