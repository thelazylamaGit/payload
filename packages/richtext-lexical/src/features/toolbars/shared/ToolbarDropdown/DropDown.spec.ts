// @vitest-environment jsdom

import type { LexicalEditor } from 'lexical'

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DropDown, DropDownItem } from './DropDown.js'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, extraButtonProps, onClick, onMouseDown, ref }: any) =>
    React.createElement(
      'button',
      { ...extraButtonProps, disabled, onClick, onMouseDown, ref },
      children,
    ),
}))

const roots: ReturnType<typeof createRoot>[] = []

const button = (key: string) =>
  document.querySelector<HTMLButtonElement>(`[data-dropdown-key="${key}"]`)!
const choice = (key: string) =>
  document.querySelector<HTMLButtonElement>(`[data-item-key="${key}"]`)!

function mountMenus() {
  const container = document.createElement('div')
  const root = createRoot(container)
  const onSelect = vi.fn()
  const editor = {
    focus: vi.fn((callback) => callback()),
    update: vi.fn(),
  } as unknown as LexicalEditor

  document.body.append(container)
  roots.push(root)

  const leaf = (key: string, enabled = true) =>
    React.createElement(DropDownItem, {
      children: key,
      editor,
      enabled,
      Icon: undefined,
      item: { key, onSelect },
      itemKey: key,
      key,
    })

  act(() => {
    root.render(
      React.createElement(
        DropDown,
        { buttonClassName: 'root', dropdownKey: 'add' },
        leaf('upload'),
        React.createElement(
          DropDown,
          { buttonClassName: 'category', dropdownKey: 'blocks', isSubmenu: true },
          leaf('disabled', false),
          leaf('hero'),
          leaf('callout'),
        ),
        React.createElement(
          DropDown,
          { buttonClassName: 'category', dropdownKey: 'inlineBlocks', isSubmenu: true },
          leaf('badge'),
        ),
      ),
    )
  })

  return { editor, onSelect }
}

function click(element: HTMLElement) {
  act(() => element.click())
}

function press(element: HTMLElement, key: string) {
  act(() => {
    element.focus()
    element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }))
  })
}

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.replaceChildren()
})

describe('nested toolbar dropdowns', () => {
  it('should keep Add open when opening a category and close both after insertion', () => {
    const { editor, onSelect } = mountMenus()

    click(button('add'))
    click(button('blocks'))

    expect(button('add').getAttribute('aria-expanded')).toBe('true')
    expect(button('blocks').getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(choice('hero').parentElement)

    click(choice('hero'))

    expect(editor.focus).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith({ editor, isActive: undefined })
    expect(button('add').getAttribute('aria-expanded')).toBe('false')
    expect(choice('hero')).toBeNull()
  })

  it('should open only one category at a time', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    click(button('inlineBlocks'))

    expect(choice('hero')).toBeNull()
    expect(choice('badge')).not.toBeNull()
    expect(button('add').getAttribute('aria-expanded')).toBe('true')
  })

  it('should navigate child choices without moving the parent highlight', () => {
    mountMenus()
    click(button('add'))
    press(choice('upload'), 'ArrowDown')

    expect(document.activeElement).toBe(button('blocks'))

    press(button('blocks'), 'ArrowRight')

    expect(document.activeElement).toBe(choice('hero').parentElement)

    press(document.activeElement as HTMLElement, 'ArrowDown')

    expect(document.activeElement).toBe(choice('hero'))

    press(choice('hero'), 'ArrowDown')

    expect(document.activeElement).toBe(choice('callout'))

    press(choice('callout'), 'ArrowDown')

    expect(document.activeElement).toBe(choice('hero'))

    press(choice('hero'), 'ArrowLeft')

    expect(document.activeElement).toBe(button('blocks'))
    expect(button('blocks').getAttribute('aria-expanded')).toBe('false')
    expect(button('add').getAttribute('aria-expanded')).toBe('true')
  })

  it('should dismiss one level at a time with Escape and restore trigger focus', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(choice('hero'), 'Escape')

    expect(document.activeElement).toBe(button('blocks'))
    expect(button('add').getAttribute('aria-expanded')).toBe('true')

    press(button('blocks'), 'Escape')

    expect(document.activeElement).toBe(button('add'))
    expect(button('add').getAttribute('aria-expanded')).toBe('false')
  })

  it('should close the whole menu on an outside click', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    click(document.body)

    expect(button('add').getAttribute('aria-expanded')).toBe('false')
    expect(choice('hero')).toBeNull()
  })

  it('should return focus to a category when toggling its menu closed', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    click(button('blocks'))

    expect(button('add').getAttribute('aria-expanded')).toBe('true')
    expect(button('blocks').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button('blocks'))
  })

  it('should discard child state when Add closes and reopens', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    click(button('add'))

    expect(choice('hero')).toBeNull()

    click(button('add'))

    expect(button('blocks').getAttribute('aria-expanded')).toBe('false')
    expect(choice('hero')).toBeNull()

    click(button('blocks'))

    expect(document.activeElement).toBe(choice('hero').parentElement)
  })

  it('should rebuild keyboard registration when reopening a child menu', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(choice('hero'), 'Escape')
    click(button('blocks'))
    press(choice('hero'), 'ArrowDown')

    expect(document.activeElement).toBe(choice('callout'))
  })

  it('should navigate back through child choices while skipping disabled items', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(choice('hero'), 'ArrowUp')

    expect(document.activeElement).toBe(choice('callout'))

    press(choice('callout'), 'ArrowUp')

    expect(document.activeElement).toBe(choice('hero'))
  })

  it('should close a child on Tab without also closing Add', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(choice('hero'), 'Tab')

    expect(button('add').getAttribute('aria-expanded')).toBe('true')
    expect(button('blocks').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button('blocks'))
  })

  it('should leave choices unfocused when opening either category', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))

    expect(document.activeElement).toBe(choice('hero').parentElement)

    click(button('inlineBlocks'))

    expect(document.activeElement).toBe(choice('badge').parentElement)
  })

  it('should select the first enabled choice on the first ArrowDown', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(document.activeElement as HTMLElement, 'ArrowDown')

    expect(document.activeElement).toBe(choice('hero'))
    expect(choice('hero').parentElement?.dataset.navigation).toBe('keyboard')
  })

  it('should select the last choice on the first ArrowUp', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(document.activeElement as HTMLElement, 'ArrowUp')

    expect(document.activeElement).toBe(choice('callout'))
  })

  it('should transfer keyboard focus to the hovered choice and switch to pointer styling', () => {
    mountMenus()
    click(button('add'))
    click(button('blocks'))
    press(document.activeElement as HTMLElement, 'ArrowDown')

    act(() => choice('callout').dispatchEvent(new MouseEvent('pointermove', { bubbles: true })))

    expect(document.activeElement).toBe(choice('callout'))
    expect(choice('callout').parentElement?.dataset.navigation).toBe('pointer')

    press(choice('callout'), 'ArrowUp')

    expect(document.activeElement).toBe(choice('hero'))
    expect(choice('hero').parentElement?.dataset.navigation).toBe('keyboard')
  })

  it('should preserve existing Add actions', () => {
    const { onSelect } = mountMenus()

    click(button('add'))
    click(choice('upload'))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(button('add').getAttribute('aria-expanded')).toBe('false')
  })
})
