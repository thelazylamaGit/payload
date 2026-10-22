import type { ClientBlock } from 'payload'

import { describe, expect, it } from 'vitest'

import { compactClipboardBlockSchema } from './compactClipboardBlockSchema.js'

const child: ClientBlock = {
  slug: 'child',
  fields: [{ name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] }],
}

describe('rich-text clipboard structural schemas', () => {
  it('should retain structural paths while omitting display config and nonstructural fields', () => {
    const original: ClientBlock = {
      slug: 'embedded',
      labels: { singular: 'Embedded', plural: 'Embedded' },
      fields: [
        { name: 'reference', type: 'relationship', relationTo: 'pages' },
        { name: 'upload', type: 'upload', relationTo: 'media' },
        { name: 'title', type: 'text', admin: { description: 'x'.repeat(4096) } },
        {
          name: 'settings',
          type: 'group',
          fields: [{ name: 'body', type: 'richText', admin: { description: 'x'.repeat(4096) } }],
        },
        {
          type: 'row',
          fields: [{ name: 'items', type: 'array', fields: [{ name: 'text', type: 'text' }] }],
        },
        {
          name: 'nested',
          type: 'blocks',
          blocks: [child],
          blockReferences: ['global-child', child],
        },
        {
          type: 'tabs',
          tabs: [
            { label: 'Content', fields: [{ name: 'body', type: 'richText' }] },
            {
              name: 'settings',
              label: 'Settings',
              fields: [{ name: 'items', type: 'array', fields: [] }],
            },
          ],
        },
      ],
    }
    const before = structuredClone(original)
    const compacted = compactClipboardBlockSchema(original)

    expect(compacted).toEqual({
      slug: 'embedded',
      fields: [
        { name: 'settings', type: 'group', fields: [{ name: 'body', type: 'richText' }] },
        { type: 'row', fields: [{ name: 'items', type: 'array', fields: [] }] },
        {
          name: 'nested',
          type: 'blocks',
          blocks: [{ slug: 'child', fields: [{ name: 'items', type: 'array', fields: [] }] }],
          blockReferences: [
            'global-child',
            { slug: 'child', fields: [{ name: 'items', type: 'array', fields: [] }] },
          ],
        },
        {
          type: 'tabs',
          tabs: [
            { fields: [{ name: 'body', type: 'richText' }] },
            { name: 'settings', fields: [{ name: 'items', type: 'array', fields: [] }] },
          ],
        },
      ],
    })
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(original).length / 4)
    expect(original).toEqual(before)
  })
})
