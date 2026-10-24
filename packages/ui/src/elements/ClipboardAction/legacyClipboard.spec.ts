import { afterEach, describe, expect, it, vi } from 'vitest'

import { clipboardPaste } from './clipboardUtilities.js'

const block = { slug: 'content', fields: [{ name: 'body', type: 'richText' as const }] }
afterEach(() => vi.unstubAllGlobals())

describe('older fork clipboard data', () => {
  it.each([0, undefined])(
    'should discard obsolete metadata on row or whole-field paste, row=%s',
    (rowIndex) => {
      const clipboard = {
        type: 'blocks',
        blocks: [block],
        path: 'source',
        rowIndex,
        data: {
          'source.0.blockType': { value: 'content', valid: true },
          'source.0.body': {
            value: { root: { children: [] }, clipboardBlocks: 'user content' },
            valid: true,
            clipboardBlocks: [{ slug: 'obsolete', fields: [] }],
          },
        },
      }
      vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(clipboard) })
      const onPaste = vi.fn()
      expect(
        clipboardPaste({
          onPaste,
          path: 'destination',
          schemaBlocks: [block],
          t: ((key) => key) as any,
        }),
      ).toBe(true)
      const data = onPaste.mock.calls[0][0].data
      expect(data['source.0.body']).not.toHaveProperty('clipboardBlocks')
      expect(data['source.0.body'].value.clipboardBlocks).toBe('user content')
      expect(clipboard.data['source.0.body']).toHaveProperty('clipboardBlocks')
    },
  )
})
