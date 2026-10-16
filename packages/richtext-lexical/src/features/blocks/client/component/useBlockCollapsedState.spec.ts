// @vitest-environment jsdom

import type { DocumentPreferences } from 'payload'

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InitialLexicalFormState } from '../../../../utilities/buildInitialState.js'

import { useBlockCollapsedState } from './useBlockCollapsedState.js'

const roots: ReturnType<typeof createRoot>[] = []

function mountBlock({
  blockID = 'block1',
  getDocPreferences = vi.fn(async () => ({ fields: { content: { collapsed: [] } } })),
  initialState = {},
}: {
  blockID?: string
  getDocPreferences?: () => Promise<DocumentPreferences>
  initialState?: InitialLexicalFormState
} = {}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const Block = () => {
    const [isCollapsed, setIsCollapsed] = useBlockCollapsedState({
      blockID,
      fieldName: 'content',
      getDocPreferences,
      initialState,
    })

    return React.createElement('button', {
      'aria-expanded': !isCollapsed,
      onClick: () => setIsCollapsed(!isCollapsed),
    })
  }

  roots.push(root)

  return {
    button: () => container.querySelector('button')!,
    container,
    render: () => root.render(React.createElement(Block)),
    switchAway: () => root.render(null),
  }
}

afterEach(async () => {
  await act(async () => {
    for (const root of roots) {
      root.unmount()
    }
  })
  roots.length = 0
})

describe('block collapsed state across tab remounts', () => {
  it.each([false, true])(
    'should restore the latest preference over the server snapshot (%s)',
    async (collapsed) => {
      const block = mountBlock({
        getDocPreferences: async () => ({
          fields: { content: { collapsed: collapsed ? ['block1'] : [] } },
        }),
        initialState: { block1: { collapsed: !collapsed } },
      })

      await act(async () => block.render())

      expect(block.button().getAttribute('aria-expanded')).toBe(String(!collapsed))
    },
  )

  it.each([false, true])(
    'should retain the last toggle when returning to a tab (%s)',
    async (initialCollapsed) => {
      const initialState = { block1: { collapsed: initialCollapsed } }
      const getDocPreferences = vi.fn(async () => ({
        fields: { content: { collapsed: initialCollapsed ? ['block1'] : [] } },
      }))
      const block = mountBlock({ getDocPreferences, initialState })

      await act(async () => block.render())
      await act(async () => block.button().click())
      await act(async () => block.switchAway())
      await act(async () => block.render())

      expect(block.button().getAttribute('aria-expanded')).toBe(String(initialCollapsed))
      expect(initialState).toEqual({ block1: { collapsed: initialCollapsed } })
    },
  )

  it('should not overwrite a toggle with a delayed preference read', async () => {
    let resolvePreferences!: (preferences: DocumentPreferences) => void
    const getDocPreferences = () =>
      new Promise<DocumentPreferences>((resolve) => {
        resolvePreferences = resolve
      })
    const block = mountBlock({ getDocPreferences })

    await act(async () => block.render())
    await act(async () => block.button().click())
    await act(async () => resolvePreferences({ fields: { content: { collapsed: [] } } }))

    expect(block.button().getAttribute('aria-expanded')).toBe('false')
  })

  it('should retain a toggle across a remount before preferences have loaded', async () => {
    const getDocPreferences = vi.fn(() => new Promise<DocumentPreferences>(() => {}))
    const block = mountBlock({ getDocPreferences })

    await act(async () => block.render())
    await act(async () => block.button().click())
    await act(async () => block.switchAway())
    await act(async () => block.render())

    expect(block.button().getAttribute('aria-expanded')).toBe('false')
    expect(getDocPreferences).toHaveBeenCalledTimes(1)
  })

  it('should keep block IDs and separate field snapshots isolated', async () => {
    const initialState = {}
    const first = mountBlock({ initialState })
    const second = mountBlock({ blockID: 'block2', initialState })
    const anotherDocument = mountBlock()

    await act(async () => {
      first.render()
      second.render()
      anotherDocument.render()
    })
    await act(async () => first.button().click())
    await act(async () => {
      first.switchAway()
      second.switchAway()
    })
    await act(async () => {
      first.render()
      second.render()
    })

    expect(first.button().getAttribute('aria-expanded')).toBe('false')
    expect(second.button().getAttribute('aria-expanded')).toBe('true')
    expect(anotherDocument.button().getAttribute('aria-expanded')).toBe('true')
  })

  it('should preserve the initial state when preference loading fails', async () => {
    const block = mountBlock({
      getDocPreferences: () => Promise.reject(new Error('Unavailable')),
      initialState: { block1: { collapsed: true } },
    })

    await act(async () => block.render())

    expect(block.button().getAttribute('aria-expanded')).toBe('false')
  })
})
