// @vitest-environment jsdom

import type { ClientConfig } from 'payload'

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  createEditor,
} from 'lexical'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import type { FeatureClientSchemaMap } from '../../../../types.js'
import type { EditorConfigContextType } from '../../../../lexical/config/client/EditorConfigProvider.js'
import type { ToolbarDropdownGroup } from '../../types.js'

import { getEditorInteractionHandlers } from '../../../../lexical/utils/editorInteractions.js'
import { BlocksFeatureClient } from '../../../blocks/client/index.js'
import { BlockNode } from '../../../blocks/client/nodes/BlocksNode.js'
import { InlineBlockNode } from '../../../blocks/client/nodes/InlineBlocksNode.js'
import { BlocksPlugin } from '../../../blocks/client/plugin/index.js'
import { ToolbarDropdown } from './index.js'

vi.mock('@payloadcms/ui', async () => {
  const { Button } = await import('../../../../../../ui/src/elements/Button/index.js')

  return {
    Button,
    formatDrawerSlug: () => 'test-drawer',
    useEditDepth: () => 0,
    useTranslation: () => ({ i18n: { t: (key: string) => key } }),
  }
})
vi.mock('../../../../../../ui/src/elements/Link/index.js', () => ({ Link: () => null }))
vi.mock('../../../../../../ui/src/elements/Popup/index.js', () => ({ Popup: () => null }))
vi.mock('../../../../../../ui/src/elements/Tooltip/index.js', () => ({ Tooltip: () => null }))
vi.mock('../../../blocks/client/component/index.js', () => ({ BlockComponent: () => null }))
vi.mock('../../../blocks/client/markdown/markdownTransformer.js', () => ({
  getBlockMarkdownTransformers: () => [],
}))
vi.mock('../../../../utilities/fieldsDrawer/useLexicalDrawer.js', () => ({
  useLexicalDrawer: () => ({ toggleDrawer: () => {} }),
}))
vi.mock('@lexical/react/LexicalComposerContext.js', () => ({
  useLexicalComposerContext: () => [testContext.editor],
}))
vi.mock('../../../../lexical/config/client/EditorConfigProvider.js', () => ({
  useEditorConfigContext: () => testContext,
}))

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterAll(() => vi.unstubAllGlobals())

let testContext: EditorConfigContextType
const cleanups: (() => void)[] = []
const button = (key: string) =>
  document.querySelector<HTMLButtonElement>(`[data-dropdown-key="${key}"]`)!
const choice = (key: string) =>
  document.querySelector<HTMLButtonElement>(`[data-item-key="${key}"]`)!

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    element.click()
  })
}

async function mountEditor() {
  const container = document.createElement('div')
  const editable = document.createElement('div')
  const outside = document.createElement('button')
  const root = createRoot(container)
  const errors: Error[] = []
  const editor = createEditor({
    namespace: 'toolbar-interaction',
    nodes: [BlockNode, InlineBlockNode],
    onError: (error) => errors.push(error),
  })
  const field = (slug: string) => [{ blocks: [{ fields: [], slug }], type: 'blocks' }]
  const featureClientSchemaMap = {
    blocks: {
      'content.lexical_internal_feature.blocks.lexical_blocks.hero': field('hero'),
      'content.lexical_internal_feature.blocks.lexical_inline_blocks.badge': field('badge'),
    },
  } as unknown as FeatureClientSchemaMap
  const factory = BlocksFeatureClient({
    featureKey: 'blocks',
    order: 0,
    toolbarPlacement: 'add',
  }).feature

  if (typeof factory !== 'function') {
    throw new Error('Expected a client feature factory')
  }

  const feature = factory({
    config: { blocksMap: {} } as ClientConfig,
    featureClientImportMap: {},
    featureClientSchemaMap,
    featureProviderMap: new Map(),
    resolvedFeatures: new Map(),
    schemaPath: 'content',
    unSanitizedEditorConfig: { features: [] },
  })
  const group = feature.toolbarFixed!.groups[0]! as ToolbarDropdownGroup

  editable.setAttribute('contenteditable', 'true')
  outside.textContent = 'Outside'
  document.body.append(editable, container, outside)
  editor.setRootElement(editable)
  editor.update(
    () => {
      const paragraph = $createParagraphNode()
      const text = $createTextNode('before after')

      $getRoot().append(paragraph.append(text))
      text.select(7, 7)
    },
    { discrete: true },
  )
  testContext = {
    editor,
    fieldProps: { featureClientSchemaMap, schemaPath: 'content' },
    setCreatedInlineBlock: vi.fn(),
    uuid: 'toolbar-test',
  } as unknown as EditorConfigContextType

  await act(async () => {
    root.render(
      React.createElement(
        'div',
        {
          ...getEditorInteractionHandlers(editor),
          onFocus: (event: React.FocusEvent) => event.stopPropagation(),
        },
        React.createElement(BlocksPlugin, { clientProps: undefined }),
        React.createElement(ToolbarDropdown, {
          anchorElem: document.body,
          editor,
          group,
          groupState: {
            activeItemKeys: [],
            activeItems: [],
            enabledGroup: true,
            enabledItemKeys: group.items.map((item) => item.key),
          },
        }),
      ),
    )
  })
  cleanups.push(() => {
    root.unmount()
    editor.setRootElement(null)
  })

  return { editor, errors, outside }
}

afterEach(async () => {
  await act(async () => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    // Flush the toolbar's deferred state computation before the next editor is mounted.
    await new Promise((resolve) => setTimeout(resolve, 120))
  })
  document.body.replaceChildren()
})

describe('Blocks Add menu with a real Lexical editor', () => {
  it('should insert a block through the real feature, renderer and command handler, then close both menus', async () => {
    const { editor, errors } = await mountEditor()

    await click(button('add'))
    await click(button('blocks'))
    await click(choice('block-hero').querySelector('.text')!)

    const children = editor.getEditorState().toJSON().root.children

    expect(children.map((node) => node.type)).toContain('block')
    expect(children.find((node) => node.type === 'block')).toMatchObject({
      fields: { blockType: 'hero' },
    })
    expect(button('add').getAttribute('aria-expanded')).toBe('false')
    expect(choice('block-hero')).toBeNull()
    expect(errors).toEqual([])
  })

  it('should insert an inline block at the saved caret, then close both menus', async () => {
    const { editor, errors } = await mountEditor()

    await click(button('add'))
    await click(button('inlineBlocks'))
    await click(choice('inlineBlock-badge'))

    const paragraph = editor.getEditorState().toJSON().root.children[0]!

    expect(paragraph).toMatchObject({
      children: [
        { text: 'before ', type: 'text' },
        { fields: { blockType: 'badge' }, type: 'inlineBlock' },
        { text: 'after', type: 'text' },
      ],
    })
    expect(button('add').getAttribute('aria-expanded')).toBe('false')
    expect(choice('inlineBlock-badge')).toBeNull()
    expect(errors).toEqual([])
  })

  it('should close both menus on an outside click without inserting anything', async () => {
    const { editor, outside, errors } = await mountEditor()
    const before = editor.getEditorState().toJSON()

    await click(button('add'))
    await click(button('blocks'))
    await click(outside)

    expect(button('add').getAttribute('aria-expanded')).toBe('false')
    expect(choice('block-hero')).toBeNull()
    expect(editor.getEditorState().toJSON()).toEqual(before)
    expect(errors).toEqual([])
  })

  it('should preserve the selection while browsing categories', async () => {
    const { editor } = await mountEditor()

    await click(button('add'))
    await click(button('blocks'))
    await click(button('inlineBlocks'))

    editor.getEditorState().read(() => {
      const selection = $getSelection()

      expect($isRangeSelection(selection)).toBe(true)
      expect(selection).toMatchObject({ anchor: { offset: 7 }, focus: { offset: 7 } })
    })
  })
})
