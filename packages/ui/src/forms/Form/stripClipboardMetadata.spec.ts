import type { ClientBlock, FormState } from 'payload'

import { describe, expect, it } from 'vitest'

import type { RichTextClipboardMetadata } from '../../elements/ClipboardAction/types.js'

import { reduceFormStateByPath } from '../../elements/ClipboardAction/mergeFormStateFromClipboard.js'
import { reduceToSerializableFields } from './reduceToSerializableFields.js'
import {
  stripClipboardMetadata,
  stripClipboardMetadataFromRequest,
} from './stripClipboardMetadata.js'

const schema: ClientBlock = {
  slug: 'embedded',
  fields: [{ name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] }],
}

function currentFields(): FormState {
  const body = {
    root: {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Unsaved bold', format: 1 }] },
        {
          type: 'block',
          fields: {
            id: 'block-id',
            blockType: 'embedded',
            items: [{ id: 'item-id', text: 'unsaved item' }],
            reference: { id: 'external-id' },
          },
        },
      ],
    },
  }

  return {
    'layout.0.body': {
      initialValue: body,
      value: body,
      valid: true,
      ...{ clipboardBlocks: [schema] },
    },
    'layout.0.settings': {
      value: { theme: 'dark', clipboardBlocks: 'user-authored value' },
      valid: true,
    },
    'layout.0.items': { value: 1, rows: [{ id: 'row-id' }], valid: true },
    'layout.0.items.0.id': { value: 'row-id', valid: true },
    'layout.0.upload': { value: { id: 'upload-id' }, valid: true },
  }
}

describe('clipboard metadata on form requests', () => {
  it('should omit only field-level clipboard schemas and preserve all document values and IDs', () => {
    const fields = currentFields()
    const before = structuredClone(fields)
    const result = stripClipboardMetadata(fields)

    expect(result['layout.0.body']).not.toHaveProperty('clipboardBlocks')
    expect(result['layout.0.body'].value).toEqual(fields['layout.0.body'].value)
    expect(result['layout.0.body'].initialValue).toEqual(fields['layout.0.body'].initialValue)
    expect(result['layout.0.settings']).toEqual(fields['layout.0.settings'])
    expect(result['layout.0.items']).toEqual(fields['layout.0.items'])
    expect(result['layout.0.items.0.id']).toEqual(fields['layout.0.items.0.id'])
    expect(result['layout.0.upload']).toEqual(fields['layout.0.upload'])
    expect(fields).toEqual(before)
  })

  it('should keep clipboard schemas locally for subsequent copying after a request', () => {
    const fields = currentFields()

    stripClipboardMetadataFromRequest({ formState: fields })

    const copy = reduceFormStateByPath({ formState: fields, path: 'layout', rowIndex: 0 })

    expect((copy['layout.0.body'] as RichTextClipboardMetadata).clipboardBlocks).toEqual([schema])
  })

  it.each(['formState', 'documentFormState', 'initialBlockFormState', 'initialState'] as const)(
    'should sanitize the %s request slot used by native and nested forms',
    (key) => {
      const fields = currentFields()
      const result = stripClipboardMetadataFromRequest({
        [key]: fields,
        data: { clipboardBlocks: 'keep data' },
        schemaPath: 'pages.layout.content',
      })

      expect(result[key]['layout.0.body']).not.toHaveProperty('clipboardBlocks')
      expect(result.data).toEqual({ clipboardBlocks: 'keep data' })
      expect(result.schemaPath).toBe('pages.layout.content')
      expect(fields['layout.0.body']).toHaveProperty('clipboardBlocks')
    },
  )

  it('should preserve absent optional request slots and ordinary form fields', () => {
    expect(stripClipboardMetadataFromRequest({ formState: undefined })).toEqual({
      formState: undefined,
    })
    expect(stripClipboardMetadata(undefined)).toBeUndefined()
    expect(stripClipboardMetadata({ text: { valid: true, value: 'unchanged' } })).toEqual({
      text: { valid: true, value: 'unchanged' },
    })
  })

  it('should exclude clipboard schemas from the existing serializable form helper', () => {
    const fields = currentFields()
    const result = reduceToSerializableFields(fields)

    expect(result['layout.0.body']).not.toHaveProperty('clipboardBlocks')
    expect(result['layout.0.body'].value).toEqual(fields['layout.0.body'].value)
    expect(fields['layout.0.body']).toHaveProperty('clipboardBlocks')
  })

  it('should eliminate schema-only request growth beyond the default 1 MiB limit', () => {
    const largeSchema: ClientBlock = {
      slug: 'embedded',
      fields: Array.from({ length: 16 }, (_, index) => ({
        name: `field${index}`,
        type: 'text',
        admin: { description: 'x'.repeat(4096) },
      })),
    }
    const fields: FormState = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [
        `layout.${index}.body`,
        {
          valid: true,
          value: {
            root: {
              type: 'root',
              children: [{ type: 'text', text: 'Keep all this content', format: 1 }],
            },
          },
          clipboardBlocks: [structuredClone(largeSchema)],
        },
      ]),
    )
    const request = { formState: fields }
    const serializedBefore = JSON.stringify(request)
    const sanitized = stripClipboardMetadataFromRequest(request)
    const serializedAfter = JSON.stringify(sanitized)

    expect(Buffer.byteLength(serializedBefore)).toBeGreaterThan(1024 * 1024)
    expect(Buffer.byteLength(serializedAfter)).toBeLessThan(4 * 1024)
    expect(Object.values(sanitized.formState).map((field) => field.value)).toEqual(
      Object.values(fields).map((field) => field.value),
    )
  })
})
