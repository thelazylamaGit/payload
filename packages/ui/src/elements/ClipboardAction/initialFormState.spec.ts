import type { FieldSchemaMap, FormState } from 'payload'

import { initI18n } from '@payloadcms/translations'
import { en } from '@payloadcms/translations/languages/en'
import { performance } from 'node:perf_hooks'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'

import { renderField } from '../../forms/fieldSchemasToFormState/renderField.js'

vi.mock('../../exports/client/index.js', () => ({
  FieldDescription: () => null,
  WatchCondition: () => null,
}))

/** 219 possible embedded types per editor, representative of the reported regression. */
function schemas(): FieldSchemaMap {
  const map: FieldSchemaMap = new Map()
  for (let index = 0; index < 219; index++) {
    map.set(`pages.body.lexical_internal_feature.blocks.lexical_blocks.type${index}`, {
      name: `type${index}`,
      type: 'blocks',
      blocks: [
        {
          slug: `type${index}`,
          fields: [{ name: 'text', type: 'text', admin: { description: 'x'.repeat(2048) } }],
        },
      ],
    })
  }
  return map
}

describe('unused clipboard initial form-state overhead', () => {
  it.each([1, 8, 20])(
    'should attach no clipboard schemas to %s rich-text editors',
    async (count) => {
      const i18n = await initI18n({
        config: { fallbackLanguage: 'en', supportedLanguages: { en } },
      })
      const schemaMap = schemas()
      const iterator = vi.spyOn(schemaMap, Symbol.iterator)
      const state: FormState = {}
      const field = {
        name: 'body',
        type: 'richText',
        admin: {},
        editor: { FieldComponent: () => null },
      } as any
      const req = {
        i18n,
        payload: { config: { db: { defaultIDType: 'number' } }, importMap: {} },
      } as any
      const clientFieldSchemaMap = new Map([
        ['pages.body', { name: 'body', type: 'richText' }],
      ]) as any
      const start = performance.now()
      for (let index = 0; index < count; index++) {
        const path = `layout.${index}.body`
        state[path] = { valid: true, value: { root: { type: 'root', children: [] } } }
        renderField({
          clientFieldSchemaMap,
          collectionSlug: 'pages',
          data: {},
          fieldConfig: field,
          fieldSchemaMap: schemaMap,
          fieldState: state[path],
          formState: state,
          indexPath: '',
          lastRenderedPath: '',
          mockRSCs: true,
          operation: 'update',
          parentPath: '',
          parentSchemaPath: '',
          path,
          permissions: true,
          preferences: { fields: {} },
          previousFieldState: undefined,
          renderAllFields: true,
          req,
          schemaPath: 'pages.body',
          siblingData: {},
        })
      }
      const elapsed = performance.now() - start
      const json = JSON.stringify(state)
      console.info(
        JSON.stringify({
          editors: count,
          bytes: Buffer.byteLength(json),
          gzipBytes: gzipSync(json).byteLength,
          renderPreparationMs: elapsed,
        }),
      )
      for (const field of Object.values(state)) {
        expect(field).not.toHaveProperty('clipboardBlocks')
      }
      // Each small text value + mocked component should stay below 200 bytes/editor.
      // The reported regression adds roughly 499 KB/editor, and fails this by orders of magnitude.
      expect(Buffer.byteLength(json)).toBeLessThan(count * 200)
      expect(json).not.toContain('lexical_blocks')
      expect(iterator).not.toHaveBeenCalled()
      expect(gzipSync(json).byteLength).toBeLessThan(1024)
    },
  )
})
