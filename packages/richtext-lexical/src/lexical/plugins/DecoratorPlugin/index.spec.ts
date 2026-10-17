// @vitest-environment jsdom

import type { LexicalEditor } from 'lexical'

import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  CLICK_COMMAND,
  createEditor,
  SELECTION_CHANGE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import React, { act } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $createBlockNode, BlockNode } from '../../../features/blocks/client/nodes/BlocksNode.js'
import {
  $createHorizontalRuleNode,
  HorizontalRuleNode,
} from '../../../features/horizontalRule/client/nodes/HorizontalRuleNode.js'
import { getEditorInteractionHandlers } from '../../utils/editorInteractions.js'
import { DecoratorPlugin } from './index.js'

const cleanups: (() => void)[] = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => {
    for (const cleanup of cleanups.reverse()) cleanup()
  })
  cleanups.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function createFixture({ parentEditor }: { parentEditor?: LexicalEditor } = {}) {
  const editor = createEditor({
    namespace: 'decorator-selection-test',
    nodes: [HorizontalRuleNode, BlockNode],
    onError: (error) => {
      throw error
    },
    parentEditor,
  })
  const host = document.createElement('div')
  const portalHost = document.createElement('div')
  document.body.append(host, portalHost)
  const reactRoot = createRoot(host)
  const context = { getTheme: () => ({}) }
  const setRoot = (root: HTMLDivElement | null) => editor.setRootElement(root)
  const Surface = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      LexicalComposerContext.Provider,
      { value: [editor, context] },
      React.createElement(
        'div',
        getEditorInteractionHandlers(editor),
        React.createElement('div', {
          contentEditable: true,
          'data-editor-root': true,
          ref: setRoot,
          suppressContentEditableWarning: true,
        }),
        React.createElement(DecoratorPlugin),
        React.createElement('input', { 'data-block-control': true }),
        createPortal(React.createElement('input', { 'data-popover': true }), portalHost),
        children,
      ),
      React.createElement(
        'div',
        getEditorInteractionHandlers(editor),
        React.createElement('button', { 'data-toolbar': true }, 'Format'),
        createPortal(React.createElement('button', { 'data-dropdown': true }, 'Align'), portalHost),
      ),
    )
  let ruleKey = ''
  let blockKey = ''
  const populate = async () => {
    await act(async () =>
      editor.update(
        () => {
          const rule = $createHorizontalRuleNode()
          const block = $createBlockNode({ blockName: '', blockType: 'test' })
          $getRoot().append(rule, block, $createParagraphNode().append($createTextNode('Text')))
          ruleKey = rule.getKey()
          blockKey = block.getKey()
        },
        { discrete: true, tag: SKIP_DOM_SELECTION_TAG },
      ),
    )
  }
  const render = (children?: React.ReactNode) =>
    reactRoot.render(React.createElement(Surface, { children }))
  const mount = async () => {
    await act(async () => render())
    await populate()
  }
  const unmount = () => reactRoot.unmount()

  cleanups.push(() => {
    unmount()
    host.remove()
    portalHost.remove()
  })

  return {
    editor,
    host,
    mount,
    portalHost,
    populate,
    render,
    surface: React.createElement(Surface),
    unmount,
    element: (type: 'rule' | 'block') =>
      editor.getElementByKey(type === 'rule' ? ruleKey : blockKey)!,
    async select(type: 'rule' | 'block') {
      await act(async () =>
        editor.update(
          () => {
            const selection = $createNodeSelection()
            selection.add(type === 'rule' ? ruleKey : blockKey)
            $setSelection(selection)
          },
          { discrete: true, tag: SKIP_DOM_SELECTION_TAG },
        ),
      )
    },
    selection: () => editor.getEditorState().read(() => $getSelection()),
  }
}

function outsideElement(tag: 'button' | 'div' = 'button') {
  const element = document.createElement(tag)
  document.body.append(element)
  cleanups.push(() => element.remove())
  return element
}

async function pointerDown(element: Element) {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  await act(async () => element.dispatchEvent(event))
  return event
}

describe('DecoratorPlugin outside interaction', () => {
  it.each(['rule', 'block'] as const)(
    'should clear a selected %s and its outline on a focusable outside click',
    async (type) => {
      const fixture = createFixture()
      await fixture.mount()
      await fixture.select(type)
      expect(fixture.element(type).classList.contains('decorator-selected')).toBe(true)
      const outside = outsideElement()
      const event = await pointerDown(outside)
      await act(async () => outside.focus())
      expect(fixture.selection()).toBeNull()
      expect(fixture.element(type).classList.contains('decorator-selected')).toBe(false)
      expect(document.activeElement).toBe(outside)
      expect(event.defaultPrevented).toBe(false)
    },
  )

  it.each(['rule', 'block'] as const)(
    'should clear a selected %s on a non-focusable outside click without relying on blur',
    async (type) => {
      const fixture = createFixture()
      await fixture.mount()
      await fixture.select(type)
      await pointerDown(outsideElement('div'))
      expect(fixture.selection()).toBeNull()
      expect(fixture.element(type).classList.contains('decorator-selected')).toBe(false)
    },
  )

  it.each(['rule', 'block'] as const)(
    'should clear the %s outline when another plugin clears selection',
    async (type) => {
      const fixture = createFixture()
      await fixture.mount()
      await fixture.select(type)
      await act(async () =>
        fixture.editor.update(() => $setSelection(null), {
          discrete: true,
          tag: SKIP_DOM_SELECTION_TAG,
        }),
      )
      expect(fixture.element(type).classList.contains('decorator-selected')).toBe(false)
    },
  )

  it('should preserve selection for toolbar, block controls and their React portals', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('block')
    const controls = [
      fixture.host.querySelector('[data-toolbar]')!,
      fixture.host.querySelector('[data-block-control]')!,
      fixture.portalHost.querySelector('[data-popover]')!,
      fixture.portalHost.querySelector('[data-dropdown]')!,
    ]
    for (const control of controls) {
      await pointerDown(control)
      await act(async () => (control as HTMLElement).focus())
      expect($isNodeSelection(fixture.selection())).toBe(true)
      expect(fixture.element('block').classList.contains('decorator-selected')).toBe(true)
    }
  })

  it('should preserve externally portaled controls explicitly marked for this editor', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const control = outsideElement()
    control.setAttribute('data-lexical-toolbar-editor', fixture.editor.getKey())
    await pointerDown(control)
    await act(async () => control.focus())
    expect($isNodeSelection(fixture.selection())).toBe(true)
    expect(fixture.element('rule').classList.contains('decorator-selected')).toBe(true)
  })

  it('should clear node selection when keyboard focus moves outside, including from a portal', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const control = fixture.portalHost.querySelector<HTMLInputElement>('[data-popover]')!
    await act(async () => control.focus())
    expect($isNodeSelection(fixture.selection())).toBe(true)
    const outside = outsideElement()
    await act(async () => outside.focus())
    expect(fixture.selection()).toBeNull()
    expect(fixture.element('rule').classList.contains('decorator-selected')).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('should leave the other editor outline intact when one editor changes selection', async () => {
    const first = createFixture()
    const second = createFixture()
    await first.mount()
    await second.mount()
    await first.select('rule')
    await second.select('block')
    expect(first.element('rule').classList.contains('decorator-selected')).toBe(true)
    expect(second.element('block').classList.contains('decorator-selected')).toBe(true)
    await act(async () =>
      first.editor.update(() => $setSelection(null), {
        discrete: true,
        tag: SKIP_DOM_SELECTION_TAG,
      }),
    )
    expect(first.element('rule').classList.contains('decorator-selected')).toBe(false)
    expect(second.element('block').classList.contains('decorator-selected')).toBe(true)
    expect($isNodeSelection(second.selection())).toBe(true)
  })

  it('should dismiss the first editor while preserving selection in the second editor toolbar', async () => {
    const first = createFixture()
    const second = createFixture()
    await first.mount()
    await second.mount()
    await first.select('rule')
    await second.select('block')
    await pointerDown(second.portalHost.querySelector('[data-dropdown]')!)
    expect(first.selection()).toBeNull()
    expect(first.element('rule').classList.contains('decorator-selected')).toBe(false)
    expect($isNodeSelection(second.selection())).toBe(true)
    expect(second.element('block').classList.contains('decorator-selected')).toBe(true)
  })

  it('should not consume a nested editor selection command or remove its outline', async () => {
    const parent = createFixture()
    const child = createFixture({ parentEditor: parent.editor })
    await parent.mount()
    await child.mount()
    await parent.select('block')
    await child.select('rule')
    await act(async () =>
      child.editor.update(() => child.editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined), {
        tag: SKIP_DOM_SELECTION_TAG,
      }),
    )
    expect(parent.element('block').classList.contains('decorator-selected')).toBe(true)
    expect(child.element('rule').classList.contains('decorator-selected')).toBe(true)
  })

  it.each(['button', 'input', 'select'] as const)(
    'should preserve selection when an in-editor block %s receives CLICK_COMMAND',
    async (tag) => {
      const fixture = createFixture()
      await fixture.mount()
      await fixture.select('block')
      const button = document.createElement(tag)
      fixture.element('block').append(button)
      const click = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(click, 'target', { value: button })
      await act(async () => fixture.editor.dispatchCommand(CLICK_COMMAND, click))
      expect($isNodeSelection(fixture.selection())).toBe(true)
      expect(fixture.element('block').classList.contains('decorator-selected')).toBe(true)
    },
  )

  it('should handle outside events even if the target stops propagation', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const outside = outsideElement('div')
    outside.addEventListener('pointerdown', (event) => event.stopPropagation())
    await pointerDown(outside)
    expect(fixture.selection()).toBeNull()
    expect(fixture.element('rule').classList.contains('decorator-selected')).toBe(false)
  })

  it('should preserve portaled controls even if they stop propagation', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const control = fixture.portalHost.querySelector('[data-popover]')!
    control.addEventListener('pointerdown', (event) => event.stopPropagation())
    await pointerDown(control)
    expect($isNodeSelection(fixture.selection())).toBe(true)
  })

  it('should dismiss a node when focus leaves without a new focus target', async () => {
    const fixture = createFixture()
    await fixture.mount()
    const control = fixture.portalHost.querySelector<HTMLInputElement>('[data-popover]')!
    await act(async () => control.focus())
    await fixture.select('rule')
    await act(async () => {
      control.blur()
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(fixture.selection()).toBeNull()
    expect(fixture.element('rule').classList.contains('decorator-selected')).toBe(false)
  })

  it('should preserve nested editor and parent block selections through nested portals', async () => {
    const parent = createFixture()
    const child = createFixture({ parentEditor: parent.editor })
    await parent.mount()
    await act(async () => parent.render(createPortal(child.surface, parent.element('block'))))
    await child.populate()
    await parent.select('block')
    await child.select('rule')
    await pointerDown(child.portalHost.querySelector('[data-dropdown]')!)
    await act(async () =>
      child.portalHost.querySelector<HTMLInputElement>('[data-popover]')!.focus(),
    )
    expect($isNodeSelection(parent.selection())).toBe(true)
    expect($isNodeSelection(child.selection())).toBe(true)
    expect(parent.element('block').classList.contains('decorator-selected')).toBe(true)
    expect(child.element('rule').classList.contains('decorator-selected')).toBe(true)
    await pointerDown(outsideElement('div'))
    expect(parent.selection()).toBeNull()
    expect(child.selection()).toBeNull()
  })

  it('should recognize a fixed toolbar shared by its owner and a focused child editor', async () => {
    const parent = createFixture()
    const child = createFixture({ parentEditor: parent.editor })
    await parent.mount()
    await child.mount()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    cleanups.push(() => {
      root.unmount()
      host.remove()
    })
    await act(async () =>
      root.render(
        React.createElement(
          'div',
          getEditorInteractionHandlers(child.editor, parent.editor),
          React.createElement('button', {}, 'Format child'),
        ),
      ),
    )
    await parent.select('block')
    await child.select('rule')
    await pointerDown(host.querySelector('button')!)
    expect($isNodeSelection(parent.selection())).toBe(true)
    expect($isNodeSelection(child.selection())).toBe(true)
  })

  it('should dismiss selection for a control marked for another editor', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const control = outsideElement()
    control.setAttribute('data-lexical-toolbar-editor', 'another-editor')
    await pointerDown(control)
    expect(fixture.selection()).toBeNull()
    expect(fixture.element('rule').classList.contains('decorator-selected')).toBe(false)
  })

  it('should leave range selections unchanged on outside pointerdown', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await act(async () =>
      fixture.editor.update(() => $getRoot().getLastChild()!.selectStart(), {
        discrete: true,
        tag: SKIP_DOM_SELECTION_TAG,
      }),
    )
    const selection = fixture.selection()
    await pointerDown(outsideElement('div'))
    expect(fixture.selection()).toBe(selection)
  })

  it('should clean up queued work and listeners when the plugin unmounts', async () => {
    const fixture = createFixture()
    await fixture.mount()
    await fixture.select('rule')
    const rule = fixture.element('rule')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const update = vi.spyOn(fixture.editor, 'update')
    await act(async () => {
      outsideElement().dispatchEvent(new Event('pointerdown', { bubbles: true }))
      fixture.unmount()
    })
    await pointerDown(outsideElement())
    expect(update).not.toHaveBeenCalled()
    expect(rule.classList.contains('decorator-selected')).toBe(false)
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('focusin', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('focusout', expect.any(Function), true)
  })
})
