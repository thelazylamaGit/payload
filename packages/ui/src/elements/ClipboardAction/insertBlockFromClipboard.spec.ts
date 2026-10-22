import type { ClientBlock, FormState } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClipboardPasteData } from './types.js'

import { clipboardCopy, clipboardPaste } from './clipboardUtilities.js'
import { canInsertBlock, insertBlockFromClipboard } from './insertBlockFromClipboard.js'
import {
  mergeFormStateFromClipboard,
  reduceFormStateByPath,
} from './mergeFormStateFromClipboard.js'

const content: ClientBlock = {
  slug: 'content',
  fields: [
    { name: 'body', type: 'richText' },
    { name: 'settings', type: 'group', fields: [{ name: 'theme', type: 'text' }] },
    {
      name: 'items',
      type: 'array',
      fields: [{ name: 'link', type: 'relationship', relationTo: 'pages' }],
    },
  ],
}
const hero: ClientBlock = { slug: 'hero', fields: [{ name: 'title', type: 'text' }] }
const embedded: ClientBlock = {
  slug: 'embedded',
  fields: [
    {
      name: 'items',
      type: 'array',
      fields: [{ name: 'upload', type: 'upload', relationTo: 'media' }],
    },
    { name: 'reference', type: 'relationship', relationTo: 'pages' },
  ],
}
const richText = {
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Unsaved bold text', format: 1 }] },
      {
        type: 'block',
        fields: {
          id: 'embedded-old',
          blockType: 'embedded',
          items: [{ id: 'embedded-item-old', upload: { id: 'external-upload' } }],
          reference: { id: 'external-document' },
        },
      },
      { type: 'upload', value: { id: 'external-lexical-upload' } },
    ],
  },
}

function copied(): ClipboardPasteData {
  return {
    type: 'blocks',
    path: 'source',
    rowIndex: 1,
    // Legacy row copies carried unrelated allowed blocks, too.
    blocks: [content, hero],
    data: {
      'source.1.id': { value: 'copied-old', valid: true },
      'source.1.blockType': { value: 'content', valid: true },
      'source.1.body': {
        value: structuredClone(richText),
        valid: true,
        ...{ clipboardBlocks: [embedded] },
      },
      'source.1.settings.theme': { value: 'dark-unsaved', valid: true },
      'source.1.settings.id': { value: 'user-defined-id', valid: true },
      'source.1.items': { value: 1, valid: true, rows: [{ id: 'array-old' }] },
      'source.1.items.0.id': { value: 'array-old', valid: true },
      'source.1.items.0.link': { value: { id: 'external-relationship' }, valid: true },
    },
  }
}

function destination(count: number): FormState {
  const fields: FormState = {
    target: { value: count, valid: true, rows: [] },
    unrelated: { value: 'keep me', valid: true },
  }
  for (let i = 0; i < count; i++) {
    fields.target.rows.push({ id: `existing-${i}`, blockType: 'content' })
    fields[`target.${i}.id`] = { value: `existing-${i}`, valid: true }
    fields[`target.${i}.body`] = { value: `unsaved-${i}`, valid: true }
  }
  return fields
}

const t = ((key: string) => key) as any

function paste(overrides: Record<string, unknown> = {}) {
  return clipboardPaste({
    blockInsertion: true,
    path: 'target',
    schemaBlocks: [content],
    t,
    onPaste: vi.fn(),
    ...overrides,
  })
}

function write(data = copied()) {
  localStorage.setItem('_payloadClipboard', JSON.stringify(data))
}

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('native block insertion', () => {
  it('should accept a legacy row copy despite unrelated source block types', () => {
    write()
    const onPaste = vi.fn()
    expect(paste({ onPaste })).toBe(true)
    expect(onPaste.mock.calls[0][0].data).toEqual(copied().data)
  })

  it('should copy the latest unsaved state through the existing clipboard', () => {
    const data = copied()
    const state = data.data as FormState
    expect(
      clipboardCopy({
        type: 'blocks',
        blocks: [content],
        path: 'source',
        rowIndex: 1,
        t,
        getDataToCopy: () =>
          reduceFormStateByPath({ formState: state, path: 'source', rowIndex: 1 }),
      }),
    ).toBe(true)
    const onPaste = vi.fn()
    expect(paste({ onPaste })).toBe(true)
    expect(onPaste.mock.calls[0][0].data).toEqual(data.data)
  })

  it('should reject disallowed blocks', () => {
    write()
    expect(paste({ schemaBlocks: [hero] })).toBe('error:invalidClipboardData')
  })

  it('should reject incompatible selected schemas', () => {
    write()
    expect(
      paste({ schemaBlocks: [{ ...content, fields: [{ name: 'body', type: 'text' }] }] }),
    ).toBe('error:invalidClipboardData')
  })

  it('should apply the destination dynamic block filter', () => {
    write()
    expect(paste({ schemaBlocks: [] })).toBe('error:invalidClipboardData')
  })

  it.each([
    { name: 'row limit', fieldState: destination(2).target, maxRows: 2 },
    { name: 'read only', readOnly: true },
    { name: 'disabled', disabled: true },
    {
      name: 'dynamic restriction',
      fieldState: { value: 0, valid: true, blocksFilterOptions: ['hero'] },
    },
  ])('should honor insertion availability: $name', (options) => {
    write()
    const onPaste = vi.fn()
    expect(
      paste({
        canPaste: () =>
          canInsertBlock({ blockType: 'content', ...options })
            ? true
            : 'error:blockPasteUnavailable',
        onPaste,
      }),
    ).toBe('error:blockPasteUnavailable')
    expect(onPaste).not.toHaveBeenCalled()
  })

  it('should permit insertion below the limit and with no dynamic restriction', () => {
    expect(
      canInsertBlock({ blockType: 'content', fieldState: destination(1).target, maxRows: 2 }),
    ).toBe(true)
    expect(canInsertBlock({ blockType: 'content', fieldState: destination(0).target })).toBe(true)
  })

  it('should direct whole-field clipboard data to Paste Field', () => {
    const data = copied()
    delete data.rowIndex
    write(data)
    expect(paste()).toBe('error:blockClipboardRequired')
  })

  it('should report missing and malformed clipboard data', () => {
    expect(paste()).toBe('error:invalidClipboardData')
    localStorage.setItem('_payloadClipboard', '{')
    expect(paste()).toBe('error:invalidClipboardData')
  })

  it.each([
    { count: 0, index: 0 },
    { count: 3, index: 3 },
    { count: 3, index: 1 },
    { count: 3, index: 2 },
  ])(
    'should insert at $index among $count rows without changing destination content or IDs',
    ({ count, index }) => {
      const formState = destination(count)
      const before = structuredClone(formState)
      const data = copied()
      const copiedBefore = structuredClone(data)
      const result = insertBlockFromClipboard({
        blocksMap: {},
        dataFromClipboard: data,
        formState,
        path: 'target',
        rowIndex: index,
      })
      expect(formState).toEqual(before)
      expect(data).toEqual(copiedBefore)
      expect(result.target.rows).toHaveLength(count + 1)
      expect(result.target.rows[index].blockType).toBe('content')
      expect(result.target.rows[index].isLoading).toBe(false)
      expect(result.unrelated).toEqual(before.unrelated)
      for (let i = 0; i < count; i++) {
        const moved = i >= index ? i + 1 : i
        expect(result.target.rows[moved]).toEqual(before.target.rows[i])
        expect(result[`target.${moved}.id`]).toEqual(before[`target.${i}.id`])
        expect(result[`target.${moved}.body`]).toEqual(before[`target.${i}.body`])
      }
      expect(result[`target.${index}.settings.theme`].value).toBe('dark-unsaved')
      const body = result[`target.${index}.body`].value as typeof richText
      expect(body.root.children[0]).toEqual(richText.root.children[0])
      expect(result[`target.${index}.id`].value).not.toBe('copied-old')
      expect(result[`target.${index}.id`].value).toBe(result.target.rows[index].id)
      expect(result[`target.${index}.items.0.id`].value).not.toBe('array-old')
      expect(result[`target.${index}.items.0.id`].value).toBe(
        result[`target.${index}.items`].rows[0].id,
      )
      expect(result[`target.${index}.items.0.link`].value).toEqual({ id: 'external-relationship' })
      expect(result[`target.${index}.settings.id`].value).toBe('user-defined-id')
      expect(body.root.children[1].fields.id).not.toBe('embedded-old')
      expect(body.root.children[1].fields.items[0].id).not.toBe('embedded-item-old')
      expect(body.root.children[1].fields.items[0].upload).toEqual({ id: 'external-upload' })
      expect(body.root.children[1].fields.reference).toEqual({ id: 'external-document' })
      expect(body.root.children[2]).toEqual(richText.root.children[2])
    },
  )

  it.each(['blockReferences', 'blocks'] as const)(
    'should resolve nested slug references from %s when regenerating embedded structural IDs',
    (referenceList) => {
      const data = copied()
      const nested: ClientBlock = {
        slug: 'nested',
        fields: [{ name: 'reference', type: 'relationship', relationTo: 'pages' }],
      }
      const schema = structuredClone(embedded)
      schema.fields = [
        { name: 'nested', type: 'blocks', [referenceList]: ['nested'] },
      ] as ClientBlock['fields']
      const body = {
        root: {
          type: 'root',
          children: [
            {
              type: 'inlineBlock',
              fields: {
                id: 'old-inline',
                blockType: 'embedded',
                nested: [
                  { id: 'old-nested', blockType: 'nested', reference: { id: 'keep-reference' } },
                ],
              },
            },
          ],
        },
      }
      data.data['source.1.body'] = {
        value: body,
        valid: true,
        ...{ clipboardBlocks: [schema] },
      }
      const result = insertBlockFromClipboard({
        blocksMap: { nested },
        dataFromClipboard: data,
        formState: destination(0),
        path: 'target',
        rowIndex: 0,
      })
      const value = result['target.0.body'].value as typeof body
      expect(value.root.children[0].fields.id).not.toBe('old-inline')
      expect(value.root.children[0].fields.nested[0].id).not.toBe('old-nested')
      expect(value.root.children[0].fields.nested[0].reference.id).toBe('keep-reference')
    },
  )

  it('should preserve JSON and settings exactly when rich text has no structural nodes', () => {
    const data = copied()
    const value = {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            format: 'center',
            indent: 2,
            children: [
              { type: 'text', text: 'Bold italic', format: 3, style: 'color: red' },
              {
                type: 'link',
                fields: { linkType: 'internal', doc: { relationTo: 'pages', value: 'external' } },
                children: [{ type: 'text', text: 'Link', format: 0 }],
              },
            ],
          },
        ],
      },
    }
    data.data['source.1.body'].value = value
    const result = insertBlockFromClipboard({
      blocksMap: {},
      dataFromClipboard: data,
      formState: destination(0),
      path: 'target',
      rowIndex: 0,
    })
    expect(result['target.0.body'].value).toEqual(value)
    expect(result['target.0.settings.theme'].value).toBe('dark-unsaved')
  })

  it('should refresh ordinary nested blockReferences and their arrays', () => {
    const data = copied()
    const nested: ClientBlock = {
      slug: 'nested',
      fields: [{ name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] }],
    }
    data.blocks = [
      {
        ...content,
        fields: [
          ...content.fields,
          { name: 'nested', type: 'blocks', blockReferences: ['nested'], blocks: [] },
        ],
      },
    ]
    Object.assign(data.data, {
      'source.1.nested': {
        value: 1,
        valid: true,
        rows: [{ id: 'nested-old', blockType: 'nested' }],
      },
      'source.1.nested.0.id': { value: 'nested-old', valid: true },
      'source.1.nested.0.blockType': { value: 'nested', valid: true },
      'source.1.nested.0.items': { value: 1, valid: true, rows: [{ id: 'nested-array-old' }] },
      'source.1.nested.0.items.0.id': { value: 'nested-array-old', valid: true },
      'source.1.nested.0.items.0.text': { value: 'nested-unsaved', valid: true },
    })
    const result = insertBlockFromClipboard({
      blocksMap: { nested },
      dataFromClipboard: data,
      formState: destination(0),
      path: 'target',
      rowIndex: 0,
    })
    expect(result['target.0.nested.0.id'].value).not.toBe('nested-old')
    expect(result['target.0.nested.0.items.0.id'].value).not.toBe('nested-array-old')
    expect(result['target.0.nested.0.items.0.text'].value).toBe('nested-unsaved')
  })

  it('should report corrupt individual block state without modifying the destination', () => {
    const data = copied()
    data.data['source.1.invalid'] = null
    write(data)
    const formState = destination(1)
    const before = structuredClone(formState)
    expect(
      paste({
        onPaste: (dataFromClipboard) =>
          insertBlockFromClipboard({
            blocksMap: {},
            dataFromClipboard,
            formState,
            path: 'target',
            rowIndex: 1,
          }),
      }),
    ).toBe('error:invalidClipboardData')
    expect(formState).toEqual(before)
  })

  it('should retain whole-field compatibility checks for Paste Field', () => {
    const data = copied()
    delete data.rowIndex
    write(data)
    expect(paste({ blockInsertion: false })).toBe('error:invalidClipboardData')
    expect(paste({ blockInsertion: false, schemaBlocks: [content, hero] })).toBe(true)
  })

  it('should retain Array Paste Row replacement and the target row identity', () => {
    const data: ClipboardPasteData = {
      type: 'array',
      path: 'source',
      rowIndex: 0,
      fields: [{ name: 'text', type: 'text' }],
      data: {
        'source.0.id': { value: 'source-id', valid: true },
        'source.0.text': { value: 'copied text', valid: true },
      },
    }
    const formState: FormState = {
      target: { value: 2, valid: true, rows: [{ id: 'first' }, { id: 'second' }] },
      'target.0.id': { value: 'first', valid: true },
      'target.0.text': { value: 'keep first', valid: true },
      'target.1.id': { value: 'second', valid: true },
      'target.1.text': { value: 'replace second', valid: true },
    }
    const result = mergeFormStateFromClipboard({
      dataFromClipboard: data,
      formState,
      path: 'target',
      rowIndex: 1,
    })
    expect(result.target.rows).toHaveLength(2)
    expect(result['target.0.text'].value).toBe('keep first')
    expect(result['target.1.text'].value).toBe('copied text')
    expect(result['target.1.id'].value).toBe('second')
  })

  it('should retain ordinary Array clipboard validation and row data', () => {
    const data: ClipboardPasteData = {
      type: 'array',
      path: 'array',
      rowIndex: 0,
      fields: [{ name: 'text', type: 'text' }],
      data: { 'array.0.text': { value: 'unsaved', valid: true } },
    }
    write(data)
    const onPaste = vi.fn()
    expect(clipboardPaste({ path: 'other', schemaFields: data.fields, t, onPaste })).toBe(true)
    expect(onPaste).toHaveBeenCalledWith(data)
    expect(paste()).toBe('error:blockClipboardRequired')
  })
})
