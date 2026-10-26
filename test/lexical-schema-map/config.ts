import { fileURLToPath } from 'node:url'
import path from 'path'

import { buildConfigWithDefaults } from '../buildConfigWithDefaults.js'
import { devUser } from '../credentials.js'
import { allBlocks, minimalEditor } from './blocks.js'
import { buildSeedOrdinaryPage, buildSeedPage } from './seed.js'
import { blockSlugs, ordinaryPagesSlug, pagesSlug } from './shared.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfigWithDefaults({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  blocks: allBlocks,
  collections: [
    {
      slug: pagesSlug,
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'layout',
          type: 'blocks',
          blockReferences: [
            blockSlugs.richTextSection,
            blockSlugs.contentWithMedia,
            blockSlugs.accordion,
          ],
          blocks: [],
        },
      ],
      versions: { drafts: { autosave: true } },
    },
    {
      slug: ordinaryPagesSlug,
      admin: { useAsTitle: 'title' },
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'layout',
          type: 'blocks',
          blockReferences: [blockSlugs.plainSection],
          blocks: [],
        },
      ],
    },
  ],
  editor: minimalEditor,
  localization: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
  },
  onInit: async (payload) => {
    if ((await payload.count({ collection: 'users' })).totalDocs) {
      return
    }

    await payload.create({
      collection: 'users',
      data: {
        email: devUser.email,
        password: devUser.password,
      },
    })

    await payload.create({ collection: pagesSlug, data: buildSeedPage() as any })
    await payload.create({ collection: ordinaryPagesSlug, data: buildSeedOrdinaryPage() as any })
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
