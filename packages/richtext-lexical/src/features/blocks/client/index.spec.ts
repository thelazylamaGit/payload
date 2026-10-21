import type { LexicalEditor } from 'lexical'
import type { ClientConfig } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import type { FeatureClientSchemaMap } from '../../../types.js'
import type { BlocksFeatureProps } from '../server/index.js'

import { BlocksFeatureClient } from './index.js'
import { INSERT_BLOCK_COMMAND, INSERT_INLINE_BLOCK_COMMAND } from './plugin/commands.js'

vi.mock('./nodes/BlocksNode.js', () => ({ BlockNode: class {} }))
vi.mock('./nodes/InlineBlocksNode.js', () => ({ InlineBlockNode: class {} }))
vi.mock('./plugin/index.js', () => ({ BlocksPlugin: () => null }))
vi.mock('./markdown/markdownTransformer.js', () => ({ getBlockMarkdownTransformers: () => [] }))
vi.mock('./getBlockImageComponent.js', () => ({ getBlockImageComponent: () => () => null }))

function resolveFeature({
  schemaPath = 'content',
  toolbarPlacement,
}: {
  schemaPath?: string
  toolbarPlacement?: BlocksFeatureProps['toolbarPlacement']
} = {}) {
  const feature = BlocksFeatureClient({ featureKey: 'blocks', order: 0, toolbarPlacement }).feature
  const field = (slug: string) => [{ blocks: [{ fields: [], slug }], type: 'blocks' }]
  const featureClientSchemaMap = {
    blocks: {
      'content.lexical_internal_feature.blocks.lexical_blocks.hero': field('hero'),
      'content.lexical_internal_feature.blocks.lexical_inline_blocks.badge': field('badge'),
      'nested.lexical_internal_feature.blocks.lexical_blocks.callout': field('callout'),
    },
  } as unknown as FeatureClientSchemaMap

  if (typeof feature !== 'function') {
    throw new Error('Expected a BlocksFeature client factory')
  }

  return feature({
    config: { blocksMap: {} } as ClientConfig,
    featureClientImportMap: {},
    featureClientSchemaMap,
    featureProviderMap: new Map(),
    resolvedFeatures: new Map(),
    schemaPath,
    unSanitizedEditorConfig: { features: [] },
  })
}

describe('BlocksFeature toolbar placement', () => {
  it.each([undefined, 'toolbar'] as const)(
    'should preserve top-level groups with placement %s',
    (toolbarPlacement) => {
      const feature = resolveFeature({ toolbarPlacement })

      expect(feature.toolbarFixed?.groups.map((group) => group.key)).toEqual([
        'blocks',
        'inlineBlocks',
      ])
    },
  )

  it('should register two categories inside Add rather than flattening their choices', () => {
    const feature = resolveFeature({ toolbarPlacement: 'add' })
    const groups = feature.toolbarFixed!.groups

    expect(groups.map((group) => group.key)).toEqual(['add'])
    expect(groups[0]!.items.map((item) => item.key)).toEqual(['blocks', 'inlineBlocks'])
    expect(groups[0]!.items.map((item) => item.submenu?.items.map((child) => child.key))).toEqual([
      ['block-hero'],
      ['inlineBlock-badge'],
    ])
  })

  it('should omit toolbar groups in none mode', () => {
    const feature = resolveFeature({ toolbarPlacement: 'none' })

    expect(feature.toolbarFixed?.groups).toEqual([])
  })

  it.each(['toolbar', 'add', 'none'] as const)(
    'should preserve slash choices with placement %s',
    (toolbarPlacement) => {
      const feature = resolveFeature({ toolbarPlacement })

      expect(
        feature.slashMenu?.groups?.map((group) => group.items.map((item) => item.key)),
      ).toEqual([['block-hero'], ['inlineBlocks-badge']])
    },
  )

  it('should use each editor schema and omit unavailable categories', () => {
    const feature = resolveFeature({ schemaPath: 'nested', toolbarPlacement: 'add' })
    const categories = feature.toolbarFixed!.groups[0]!.items

    expect(categories.map((item) => item.key)).toEqual(['blocks'])
    expect(categories[0]!.submenu!.items.map((item) => item.key)).toEqual(['block-callout'])
  })

  it('should omit Add when the editor has no allowed blocks', () => {
    const feature = resolveFeature({ schemaPath: 'empty', toolbarPlacement: 'add' })

    expect(feature.toolbarFixed?.groups).toEqual([])
  })

  it('should dispatch the existing insertion commands from category choices', () => {
    const feature = resolveFeature({ toolbarPlacement: 'add' })
    const dispatchCommand = vi.fn()
    const editor = { dispatchCommand } as unknown as LexicalEditor

    for (const category of feature.toolbarFixed!.groups[0]!.items) {
      category.submenu!.items[0]!.onSelect!({ editor, isActive: false })
    }

    expect(dispatchCommand.mock.calls).toEqual([
      [INSERT_BLOCK_COMMAND, { blockName: '', blockType: 'hero' }],
      [INSERT_INLINE_BLOCK_COMMAND, { blockName: '', blockType: 'badge' }],
    ])
  })
})
