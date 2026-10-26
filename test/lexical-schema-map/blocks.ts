import type { Block } from 'payload'

import {
  BlocksFeature,
  BoldFeature,
  ItalicFeature,
  lexicalEditor,
  ParagraphFeature,
} from '@payloadcms/richtext-lexical'

import { blockSlugs } from './shared.js'

/**
 * Centrally registered blocks, referenced by slug everywhere (blockReferences).
 *
 * Representative finite nesting path (no circular references):
 * RichTextSection.content (Lexical)
 * → Panel.items (ordinary blocks)
 * → ContentWithMedia.content (Lexical)
 * → TextPanel.content (Lexical)
 * → Grid.panels (ordinary blocks)
 * → GridPanel.items (ordinary blocks)
 * → TextColumns.columns.content (Lexical)
 * → ButtonRow
 */

const textOnlyFeatures = [ParagraphFeature(), BoldFeature(), ItalicFeature()]

const editorWithBlocks = ({
  blocks,
  inlineBlocks,
}: {
  blocks: string[]
  inlineBlocks?: string[]
}) =>
  lexicalEditor({
    features: [...textOnlyFeatures, BlocksFeature({ blocks, inlineBlocks })],
  })

export const minimalEditor = lexicalEditor({ features: textOnlyFeatures })

export const buttonOnlyEditor = editorWithBlocks({
  blocks: [blockSlugs.buttonRow],
  inlineBlocks: [blockSlugs.inlineBadge],
})

export const InlineBadge: Block = {
  slug: blockSlugs.inlineBadge,
  fields: [{ name: 'label', type: 'text', required: true }],
}

export const ButtonRow: Block = {
  slug: blockSlugs.buttonRow,
  fields: [
    {
      name: 'buttons',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', localized: true, required: true },
        { name: 'url', type: 'text' },
        {
          name: 'variant',
          type: 'select',
          defaultValue: 'primary',
          options: ['primary', 'secondary', 'link'],
        },
      ],
    },
  ],
}

export const TextColumns: Block = {
  slug: blockSlugs.textColumns,
  fields: [
    {
      name: 'columns',
      type: 'array',
      fields: [{ name: 'content', type: 'richText', editor: buttonOnlyEditor }],
    },
  ],
}

export const GridPanel: Block = {
  slug: blockSlugs.gridPanel,
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'items',
      type: 'blocks',
      blockReferences: [blockSlugs.textColumns, blockSlugs.buttonRow],
      blocks: [],
    },
  ],
}

export const Grid: Block = {
  slug: blockSlugs.grid,
  fields: [
    {
      name: 'panels',
      type: 'blocks',
      blockReferences: [blockSlugs.gridPanel],
      blocks: [],
    },
  ],
}

export const TextPanel: Block = {
  slug: blockSlugs.textPanel,
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'content',
      type: 'richText',
      editor: editorWithBlocks({ blocks: [blockSlugs.grid, blockSlugs.buttonRow] }),
    },
  ],
}

export const ContentWithMedia: Block = {
  slug: blockSlugs.contentWithMedia,
  fields: [
    { name: 'showCaption', type: 'checkbox' },
    {
      name: 'caption',
      type: 'text',
      admin: { condition: (_, siblingData) => Boolean(siblingData?.showCaption) },
      localized: true,
    },
    {
      name: 'content',
      type: 'richText',
      editor: editorWithBlocks({
        blocks: [blockSlugs.textPanel, blockSlugs.buttonRow],
        inlineBlocks: [blockSlugs.inlineBadge],
      }),
    },
  ],
}

export const Panel: Block = {
  slug: blockSlugs.panel,
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'items',
      type: 'blocks',
      blockReferences: [blockSlugs.contentWithMedia, blockSlugs.textPanel],
      blocks: [],
    },
  ],
}

export const Accordion: Block = {
  slug: blockSlugs.accordion,
  fields: [
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'content',
          type: 'richText',
          editor: editorWithBlocks({ blocks: [blockSlugs.buttonRow] }),
        },
      ],
    },
  ],
}

export const RichTextSection: Block = {
  slug: blockSlugs.richTextSection,
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: editorWithBlocks({
        blocks: [
          blockSlugs.panel,
          blockSlugs.contentWithMedia,
          blockSlugs.textPanel,
          blockSlugs.accordion,
          blockSlugs.buttonRow,
        ],
        inlineBlocks: [blockSlugs.inlineBadge],
      }),
    },
  ],
}

/**
 * Control group: same nesting depth and branching, ordinary blocks only.
 */
export const PlainColumns: Block = {
  slug: blockSlugs.plainColumns,
  fields: [{ name: 'columns', type: 'array', fields: [{ name: 'text', type: 'textarea' }] }],
}

export const PlainPanel: Block = {
  slug: blockSlugs.plainPanel,
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'items',
      type: 'blocks',
      blockReferences: [blockSlugs.plainColumns, blockSlugs.buttonRow],
      blocks: [],
    },
  ],
}

export const PlainGrid: Block = {
  slug: blockSlugs.plainGrid,
  fields: [
    { name: 'panels', type: 'blocks', blockReferences: [blockSlugs.plainPanel], blocks: [] },
  ],
}

export const PlainSection: Block = {
  slug: blockSlugs.plainSection,
  fields: [
    {
      name: 'items',
      type: 'blocks',
      blockReferences: [blockSlugs.plainGrid, blockSlugs.buttonRow],
      blocks: [],
    },
  ],
}

export const allBlocks: Block[] = [
  InlineBadge,
  ButtonRow,
  TextColumns,
  GridPanel,
  Grid,
  TextPanel,
  ContentWithMedia,
  Panel,
  Accordion,
  RichTextSection,
  PlainColumns,
  PlainPanel,
  PlainGrid,
  PlainSection,
]
