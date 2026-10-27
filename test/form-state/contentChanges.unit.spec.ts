/* eslint payload/no-relative-monorepo-imports: "off" -- Exercise private UI comparison helpers against real persisted documents. */
import type { Payload } from 'payload'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildConfig, createLocalReq, getPayload, restoreVersionOperation } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { fieldSchemasToFormState } from '../../packages/ui/src/forms/fieldSchemasToFormState/index.js'
import {
  getFormContentSnapshot,
  getIgnoredDocumentFields,
} from '../../packages/ui/src/forms/Form/formContent.js'
import { getDocumentPublicationState } from '../../packages/ui/src/utilities/getDocumentPublicationState.js'

vi.mock('../../packages/ui/src/exports/client/index.js', () => ({
  FieldDescription: () => null,
  WatchCondition: () => null,
}))

const collectionSlug = 'comparison-documents'
const referencesSlug = 'comparison-references'
const globalSlug = 'comparison-global'
const created: { collection: string; id: number | string }[] = []
let payload: Payload
let directory: string

const richText = (text: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          { type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' },
        ],
      },
    ],
  },
})

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'payload-content-comparison-'))
  payload = await getPayload({
    key: 'content-comparison-audit',
    config: await buildConfig({
      collections: [
        {
          slug: referencesSlug,
          access: { read: () => true },
          fields: [{ name: 'title', type: 'text' }],
        },
        {
          slug: collectionSlug,
          access: { read: ({ req }) => req.context.denyRead !== true },
          versions: { drafts: { localizeStatus: true } },
          fields: [
            { name: 'title', type: 'text', localized: true },
            { name: 'shared', type: 'text' },
            { name: 'body', type: 'richText', editor: lexicalEditor() },
            { name: 'related', type: 'relationship', relationTo: referencesSlug },
            {
              name: 'group',
              type: 'group',
              localized: true,
              fields: [{ name: 'text', type: 'text' }],
            },
            {
              name: 'rows',
              type: 'array',
              fields: [
                { name: 'text', type: 'text', localized: true },
                { name: 'shared', type: 'text' },
              ],
            },
            {
              name: 'blocks',
              type: 'blocks',
              blocks: [{ slug: 'panel', fields: [{ name: 'text', type: 'text' }] }],
            },
          ],
        },
      ],
      globals: [
        {
          slug: globalSlug,
          access: { read: () => true },
          versions: { drafts: true },
          fields: [{ name: 'title', type: 'text', localized: true }],
        },
      ],
      localization: {
        defaultLocale: 'en',
        locales: ['en', 'fr'],
        filterAvailableLocales: ({ locales, req }) =>
          req.context.onlyEnglish
            ? locales.filter((locale) =>
                typeof locale === 'string' ? locale === 'en' : locale.code === 'en',
              )
            : locales,
      },
      experimental: { localizeStatus: true },
      db: sqliteAdapter({ client: { url: `file:${join(directory, 'test.db')}` } }),
      secret: 'content-comparison-isolated-audit',
      telemetry: false,
      typescript: { autoGenerate: false },
    }),
  })
}, 60000)

afterEach(async () => {
  for (const resource of created.splice(0).reverse()) {
    await payload.delete(resource)
  }
})

afterAll(async () => {
  await payload.destroy()
  await rm(directory, { force: true, recursive: true })
})

const createPublished = async () => {
  const reference = await payload.create({
    collection: referencesSlug,
    data: { title: 'Reference' },
  })
  created.push({ collection: referencesSlug, id: reference.id })
  const doc = await payload.create({
    collection: collectionSlug,
    locale: 'en',
    data: {
      title: 'Original',
      shared: 'Shared',
      body: richText('Original'),
      related: reference.id,
      group: { text: 'English group' },
      rows: [
        { text: 'English row', shared: 'Shared row' },
        { text: 'English second', shared: 'Shared second' },
      ],
      blocks: [{ blockType: 'panel', text: 'Original block' }],
      _status: 'published',
    },
  })
  created.push({ collection: collectionSlug, id: doc.id })
  await payload.update({
    collection: collectionSlug,
    id: doc.id,
    locale: 'fr',
    publishSpecificLocale: 'fr',
    data: {
      title: 'Bonjour',
      group: { text: 'French group' },
      _status: 'published',
    },
  })
  return doc.id
}

const baseline = async (id: number | string, locale = 'en', context = {}) =>
  getDocumentPublicationState({
    id,
    collectionSlug,
    docPermissions: { fields: true },
    docPreferences: { fields: {} },
    operation: 'update',
    renderAllFields: false,
    schemaPath: collectionSlug,
    req: await createLocalReq({ locale, context }, payload),
  })

const editorContent = async (id: number | string, locale = 'en') => {
  const req = await createLocalReq({ locale }, payload)
  const config = payload.collections[collectionSlug].config
  const data = await payload.findByID({
    collection: collectionSlug,
    id,
    locale,
    depth: 1,
    draft: true,
    fallbackLocale: false,
  })
  const state = await fieldSchemasToFormState({
    id,
    collectionSlug,
    data,
    fields: config.fields,
    fieldSchemaMap: undefined,
    operation: 'update',
    permissions: true,
    preferences: { fields: {} },
    renderAllFields: false,
    req,
    schemaPath: collectionSlug,
    skipValidation: true,
  })
  return getFormContentSnapshot(state, getIgnoredDocumentFields(config))
}

describe('publication baselines through real SQLite persistence', () => {
  it('should match initial published content across rich text, groups, blocks, arrays, and populated relationships', async () => {
    const id = await createPublished()
    const state = await baseline(id)

    expect(state.published).toEqual(await editorContent(id))
    expect(state.otherLocalesHaveChanges).toBe(false)
  })

  it('should distinguish a saved draft from published content and recognise a reverted identical draft', async () => {
    const id = await createPublished()
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'en',
      draft: true,
      data: { title: 'Saved draft', _status: 'draft' },
    })
    const state = await baseline(id)

    expect(state.published.title).toBe('Original')
    expect((await editorContent(id)).title).toBe('Saved draft')
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'en',
      draft: true,
      data: { title: 'Original', _status: 'draft' },
    })
    expect((await baseline(id)).published).toEqual(await editorContent(id))
  })

  it('should identify never-published drafts without requiring readVersions permission', async () => {
    const doc = await payload.create({
      collection: collectionSlug,
      draft: true,
      data: { title: 'Draft', _status: 'draft' },
    })
    created.push({ collection: collectionSlug, id: doc.id })

    expect((await baseline(doc.id)).published).toBeNull()
  })

  it('should detect changes in another locale and ignore generated timestamps/status', async () => {
    const id = await createPublished()
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'fr',
      draft: true,
      data: { title: 'Modifié', _status: 'draft' },
    })

    expect((await baseline(id, 'en')).otherLocalesHaveChanges).toBe(true)
    expect((await baseline(id, 'en')).published.title).toBe('Original')
  })

  it('should not count shared-field draft changes twice when comparing other locales', async () => {
    const id = await createPublished()
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'en',
      draft: true,
      data: { shared: 'Shared draft', _status: 'draft' },
    })

    expect((await baseline(id)).otherLocalesHaveChanges).toBe(false)
    expect((await editorContent(id)).shared).toBe('Shared draft')
  })

  it('should exclude shared row reordering from other-locale content differences', async () => {
    const id = await createPublished()
    const doc = await payload.findByID({ collection: collectionSlug, id, locale: 'en', depth: 0 })
    const rows = doc.rows.map((row, index) => ({ ...row, text: `French ${index}` }))

    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'fr',
      publishSpecificLocale: 'fr',
      data: { rows, _status: 'published' },
    })
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'fr',
      draft: true,
      data: { rows, _status: 'draft' },
    })
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'en',
      draft: true,
      data: { rows: [...doc.rows].reverse(), _status: 'draft' },
    })

    expect((await baseline(id)).otherLocalesHaveChanges).toBe(false)
  })

  it('should respect filtered available locales', async () => {
    const id = await createPublished()
    await payload.update({
      collection: collectionSlug,
      id,
      locale: 'fr',
      draft: true,
      data: { title: 'Modifié', _status: 'draft' },
    })

    expect((await baseline(id, 'en', { onlyEnglish: true })).otherLocalesHaveChanges).toBe(false)
  })

  it.each([true, false])(
    'should refresh comparisons after restoring a version (as draft: %s)',
    async (draft) => {
      const id = await createPublished()
      const original = await payload.findVersions({
        collection: collectionSlug,
        locale: 'en',
        limit: 1,
        where: { parent: { equals: id } },
        sort: '-updatedAt',
      })

      await payload.update({
        collection: collectionSlug,
        id,
        locale: 'en',
        data: { title: 'New published', _status: 'published' },
      })
      await restoreVersionOperation({
        collection: payload.collections[collectionSlug],
        id: original.docs[0].id,
        draft,
        overrideAccess: true,
        req: await createLocalReq({ locale: 'en' }, payload),
      })
      const state = await baseline(id)

      expect((await editorContent(id)).title).toBe('Original')
      expect(state.published.title).toBe(draft ? 'New published' : 'Original')
    },
  )

  it('should enforce document read access when obtaining publication baselines', async () => {
    const id = await createPublished()

    await expect(baseline(id, 'en', { denyRead: true })).rejects.toThrow()
  })

  it('should not write documents or create versions while obtaining baselines', async () => {
    const id = await createPublished()
    const before = await payload.countVersions({
      collection: collectionSlug,
      where: { parent: { equals: id } },
    })
    const original = await payload.findByID({ collection: collectionSlug, id })

    await baseline(id)
    await baseline(id, 'fr')
    const after = await payload.countVersions({
      collection: collectionSlug,
      where: { parent: { equals: id } },
    })

    expect(after.totalDocs).toBe(before.totalDocs)
    expect((await payload.findByID({ collection: collectionSlug, id })).updatedAt).toBe(
      original.updatedAt,
    )
  })

  it('should establish a published baseline for globals', async () => {
    await payload.updateGlobal({
      slug: globalSlug,
      locale: 'en',
      data: { title: 'Global original', _status: 'published' },
    })
    await payload.updateGlobal({
      slug: globalSlug,
      locale: 'en',
      draft: true,
      data: { title: 'Global draft', _status: 'draft' },
    })
    const state = await getDocumentPublicationState({
      globalSlug,
      docPermissions: { fields: true },
      docPreferences: { fields: {} },
      operation: 'update',
      renderAllFields: false,
      schemaPath: globalSlug,
      req: await createLocalReq({ locale: 'en' }, payload),
    })

    expect(state.published.title).toBe('Global original')
    expect((await payload.findGlobal({ slug: globalSlug, locale: 'en', draft: true })).title).toBe(
      'Global draft',
    )
  })
})
