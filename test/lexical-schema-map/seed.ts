import { blockSlugs } from './shared.js'

let idCounter = 0

const nextID = () => (idCounter++).toString(16).padStart(24, '0')

const text = (value: string) => ({
  type: 'text',
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const paragraph = (...children: Record<string, unknown>[]) => ({
  type: 'paragraph',
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  textStyle: '',
  version: 1,
})

const richText = (...children: Record<string, unknown>[]) => ({
  root: {
    type: 'root',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

const lexicalBlock = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'block',
  fields: { id: nextID(), blockName: '', blockType, ...fields },
  format: '',
  version: 2,
})

const inlineBadge = (label: string) => ({
  type: 'inlineBlock',
  fields: { id: nextID(), blockName: '', blockType: blockSlugs.inlineBadge, label },
  version: 1,
})

const buttonRow = (label: string) => ({
  blockType: blockSlugs.buttonRow,
  buttons: [{ label, url: '/' }],
})

const textColumns = () => ({
  blockType: blockSlugs.textColumns,
  columns: [
    {
      content: richText(
        paragraph(text('column one'), inlineBadge('new')),
        lexicalBlock(blockSlugs.buttonRow, { buttons: [{ label: 'Column CTA', url: '/' }] }),
      ),
    },
    { content: richText(paragraph(text('column two'))) },
  ],
})

const textPanel = () => ({
  content: richText(
    paragraph(text('text panel')),
    lexicalBlock(blockSlugs.grid, {
      panels: [
        {
          blockType: blockSlugs.gridPanel,
          heading: 'Grid panel',
          items: [textColumns(), buttonRow('Grid CTA')],
        },
      ],
    }),
  ),
  heading: 'Text panel',
})

const contentWithMedia = () => ({
  caption: 'caption',
  content: richText(
    paragraph(text('content with media'), inlineBadge('hot')),
    lexicalBlock(blockSlugs.textPanel, textPanel()),
  ),
  showCaption: true,
})

/**
 * Mirrors the reported practitioner route: 3 RichTextSection editors, nested ContentWithMedia and
 * TextPanel editors, and an Accordion with 5 item editors.
 */
export const buildSeedPage = () => {
  idCounter = 1

  return {
    layout: [
      {
        blockType: blockSlugs.richTextSection,
        content: richText(
          paragraph(text('Section one')),
          lexicalBlock(blockSlugs.panel, {
            items: [{ blockType: blockSlugs.contentWithMedia, ...contentWithMedia() }],
            title: 'Panel',
          }),
        ),
      },
      {
        blockType: blockSlugs.richTextSection,
        content: richText(
          paragraph(text('Section two')),
          lexicalBlock(blockSlugs.textPanel, textPanel()),
        ),
      },
      {
        blockType: blockSlugs.richTextSection,
        content: richText(paragraph(text('Section three'))),
      },
      { blockType: blockSlugs.contentWithMedia, ...contentWithMedia() },
      {
        blockType: blockSlugs.accordion,
        items: Array.from({ length: 5 }, (_, index) => ({
          content: richText(paragraph(text(`Accordion item ${index}`))),
          title: `Item ${index}`,
        })),
      },
    ],
    title: 'Schema map reproduction',
  }
}

export const buildSeedOrdinaryPage = () => ({
  layout: [
    {
      blockType: blockSlugs.plainSection,
      items: [
        {
          blockType: blockSlugs.plainGrid,
          panels: [
            {
              blockType: blockSlugs.plainPanel,
              heading: 'Plain panel',
              items: [
                { blockType: blockSlugs.plainColumns, columns: [{ text: 'a' }, { text: 'b' }] },
                buttonRow('Plain CTA'),
              ],
            },
          ],
        },
      ],
    },
  ],
  title: 'Ordinary blocks control',
})
