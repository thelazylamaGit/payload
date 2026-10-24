/* eslint payload/no-relative-monorepo-imports: "off" -- This fixture needs private clipboard helpers; the public client barrel is mocked for server-only execution. */
import type { Block, Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { BlocksFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildFormState } from '@payloadcms/ui/utilities/buildFormState'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildConfig, createLocalReq, getPayload } from 'payload'
import { reduceFieldsToValues } from 'payload/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  clipboardCopy,
  clipboardPaste,
} from '../../packages/ui/src/elements/ClipboardAction/clipboardUtilities.js'
import { reduceFormStateByPath } from '../../packages/ui/src/elements/ClipboardAction/mergeFormStateFromClipboard.js'
import { fieldReducer } from '../../packages/ui/src/forms/Form/fieldReducer.js'

vi.mock('../../packages/ui/src/exports/client/index.js', () => ({
  FieldDescription: () => null,
  WatchCondition: () => null,
}))

const nested: Block = { slug: 'nested', fields: [{ name: 'text', type: 'text' }] }
const panel: Block = {
  slug: 'panel',
  fields: [
    { name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] },
    { name: 'children', type: 'blocks', blockReferences: ['nested'], blocks: [] },
    { name: 'reference', type: 'relationship', relationTo: 'links' },
    { name: 'settings', type: 'group', fields: [{ name: 'id', type: 'text' }] },
  ],
}
const accordion: Block = {
  slug: 'accordion',
  fields: [
    { name: 'text', type: 'text' },
    {
      name: 'body',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [...defaultFeatures, BlocksFeature({ blocks: [panel] })],
      }),
    },
    { name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] },
  ],
}
const richText = (reference: number) => ({
  root: {
    type: 'root',
    children: [
      {
        type: 'block',
        fields: {
          id: '0123456789abcdef01234568',
          blockType: 'panel',
          children: [{ blockType: 'nested', text: 'nested block' }],
          items: [{ text: 'nested array' }],
          reference,
          settings: { id: '0123456789abcdef01234567' },
        },
        format: '',
        version: 2,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
})

let payload: Payload
let directory: string
const created: { collection: string; id: number | string }[] = []
async function create(collection: string, data: any) {
  const doc = await payload.create({ collection, data, depth: 0 })
  created.push({ id: doc.id, collection })
  return doc
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'payload-clipboard-save-'))
  const config = await buildConfig({
    blocks: [nested],
    collections: [
      { slug: 'links', fields: [{ name: 'text', type: 'text' }] },
      {
        slug: 'source',
        fields: [
          { name: 'blocks', type: 'blocks', blocks: [accordion, { slug: 'image', fields: [] }] },
        ],
      },
      {
        slug: 'destination',
        fields: [
          { name: 'blocks', type: 'blocks', blocks: [accordion, { slug: 'video', fields: [] }] },
        ],
      },
    ],
    db: sqliteAdapter({ client: { url: `file:${join(directory, 'test.db')}` } }),
    editor: lexicalEditor(),
    secret: 'clipboard-isolated-regression',
    telemetry: false,
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config, key: 'clipboard-save-regression' })
}, 60000)

afterAll(async () => {
  if (payload) {
    for (const doc of created.toReversed()) {
      await payload.delete({ id: doc.id, collection: doc.collection })
    }
    await payload.destroy()
  }
  if (directory) {
    await rm(directory, { force: true, recursive: true })
  }
})

describe('native clipboard through real SQLite save and reload', () => {
  it('should preserve cross-collection content and references with fresh structural IDs', async () => {
    const link = await create('links', { text: 'external relationship' })
    const source = await create('source', {
      blocks: [
        {
          blockType: 'accordion',
          body: richText(link.id),
          items: [{ text: 'outer array' }],
          text: 'saved source',
        },
      ],
    })
    const target = await create('destination', {
      blocks: [{ blockType: 'accordion', text: 'keep destination' }],
    })
    const sourceBefore = structuredClone(
      (await payload.findByID({ id: source.id, collection: 'source', depth: 0 })).blocks,
    )
    const req = await createLocalReq({}, payload)
    const sourceState = (
      await buildFormState({
        collectionSlug: 'source',
        data: source,
        docPermissions: { fields: true },
        docPreferences: { fields: {} },
        mockRSCs: true,
        operation: 'update',
        renderAllFields: true,
        req,
        schemaPath: 'source',
        skipClientConfigAuth: true,
      })
    ).state
    sourceState['blocks.0.text'].value = 'unsaved source copy'
    const nativeSourceSchema = payload.collections.source.config.fields.find(
      (field) => 'name' in field && field.name === 'blocks',
    ) as any
    const nativeTargetSchema = payload.collections.destination.config.fields.find(
      (field) => 'name' in field && field.name === 'blocks',
    ) as any
    const { createClientField } = await import('payload')
    const client = (field: any) =>
      createClientField({ defaultIDType: 'number', field, i18n: req.i18n, importMap: {} }) as any
    let clipboard: string
    vi.stubGlobal('localStorage', {
      getItem: () => clipboard,
      setItem: (_key, value) => {
        clipboard = value
      },
    })
    const t = ((key) => key) as any
    expect(
      clipboardCopy({
        type: 'blocks',
        blocks: client(nativeSourceSchema).blocks,
        getDataToCopy: () =>
          reduceFormStateByPath({ formState: sourceState, path: 'blocks', rowIndex: 0 }),
        path: 'blocks',
        rowIndex: 0,
        t,
      }),
    ).toBe(true)
    let copied: any
    expect(
      clipboardPaste({
        blockInsertion: true,
        onPaste: (value) => {
          copied = value
        },
        path: 'blocks',
        schemaBlocks: client(nativeTargetSchema).blocks,
        t,
      }),
    ).toBe(true)
    const data = reduceFieldsToValues(
      Object.fromEntries(
        Object.entries(copied.data).map(([key, field]) => [key.slice('blocks.0.'.length), field]),
      ) as any,
      true,
    )
    const prepared = await buildFormState({
      clipboard: true,
      collectionSlug: 'destination',
      data,
      docPermissions: { fields: true },
      docPreferences: { fields: {} },
      operation: 'update',
      renderAllFields: true,
      req,
      schemaPath: 'destination.blocks.accordion',
      skipClientConfigAuth: true,
    })
    expect(Object.values(prepared.state).some((field) => field.customComponents)).toBe(false)
    const current = (
      await buildFormState({
        collectionSlug: 'destination',
        data: target,
        docPermissions: { fields: true },
        docPreferences: { fields: {} },
        mockRSCs: true,
        operation: 'update',
        renderAllFields: true,
        req,
        schemaPath: 'destination',
        skipClientConfigAuth: true,
      })
    ).state
    const before = structuredClone(reduceFieldsToValues(current, true))
    const next = fieldReducer(current, {
      type: 'PASTE_ROW',
      blockType: 'accordion',
      path: ['blocks'],
      position: 'end',
      subFieldState: prepared.state,
    })
    const values: any = reduceFieldsToValues(next, true)
    expect(values.blocks[0]).toEqual(before.blocks[0])
    expect(values.blocks[1].text).toBe('unsaved source copy')
    expect(values.blocks[1].id).not.toBe(source.blocks[0].id)
    const old = source.blocks[0].body.root.children[0].fields
    const pasted = values.blocks[1].body.root.children[0].fields
    expect(pasted.id).not.toBe(old.id)
    expect(pasted.items[0].id).not.toBe(old.items[0].id)
    expect(pasted.children[0].id).not.toBe(old.children[0].id)
    expect(pasted.reference).toBe(link.id)
    expect(pasted.settings.id).toBe('0123456789abcdef01234567')
    // Native debounced form-state initialization finishes at the committed path,
    // while every content value was already available for autosave immediately.
    const initialized = await buildFormState({
      collectionSlug: 'destination',
      data: { ...target, blocks: values.blocks },
      docPermissions: { fields: true },
      docPreferences: { fields: {} },
      formState: next,
      mockRSCs: true,
      operation: 'update',
      renderAllFields: false,
      req,
      schemaPath: 'destination',
      skipClientConfigAuth: true,
    })
    const ready = fieldReducer(next, {
      type: 'MERGE_SERVER_STATE',
      prevStateRef: { current: next },
      serverState: initialized.state,
    })
    expect(ready.blocks.rows[1].isLoading).toBe(false)
    expect(ready['blocks.1.body'].customComponents.Field).toBe('Mock')
    expect(reduceFieldsToValues(ready, true)).toEqual(values)
    await payload.update({
      id: target.id,
      collection: 'destination',
      data: { blocks: values.blocks },
    })
    const reloaded = await payload.findByID({ id: target.id, collection: 'destination', depth: 0 })
    expect(reloaded.blocks).toHaveLength(2)
    expect(reloaded.blocks[0]).toEqual(target.blocks[0])
    expect(reloaded.blocks[1].text).toBe('unsaved source copy')
    expect(reloaded.blocks[1].id).toBe(values.blocks[1].id)
    expect(reloaded.blocks[1].items[0].id).toBe(values.blocks[1].items[0].id)
    expect(reloaded.blocks[1].body.root.children[0].fields).toEqual(pasted)
    expect(reloaded.blocks[1].body.root.children[0].fields.reference).toBe(link.id)
    expect(
      (await payload.findByID({ id: source.id, collection: 'source', depth: 0 })).blocks,
    ).toEqual(sourceBefore)
  }, 60000)
})
