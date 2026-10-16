// @vitest-environment jsdom

import type { BlockContentProps } from './BlockContent.js'

import React, { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

import { BlockContent, useBlockComponentContext } from './BlockContent.js'

vi.mock('@lexical/react/useLexicalEditable', () => ({ useLexicalEditable: () => true }))
vi.mock('@payloadcms/ui', () => ({
  RenderFields: () => React.createElement('input', { defaultValue: 'unsaved' }),
  useFormSubmitted: () => true,
}))

describe('BlockContent collapsible identity', () => {
  it.each([false, true])(
    'should retain fields when errors change (custom block: %s)',
    async (customBlock) => {
      const container = document.createElement('div')
      const root = createRoot(container)
      let mounts = 0
      const Collapsible: BlockContentProps['Collapsible'] = ({ children, errorCount }) => {
        const [localState] = useState('retained')

        useEffect(() => {
          mounts++
        }, [])

        return React.createElement(
          'div',
          { 'data-errors': errorCount, 'data-state': localState },
          children,
        )
      }
      const CustomBlock = () => {
        const { BlockCollapsible } = useBlockComponentContext()

        return React.createElement(
          BlockCollapsible,
          {},
          React.createElement('input', { defaultValue: 'unsaved' }),
        )
      }
      const props: BlockContentProps = {
        baseClass: 'block',
        BlockDrawer: () => null,
        Collapsible,
        CustomBlock: customBlock ? React.createElement(CustomBlock) : undefined,
        CustomLabel: undefined,
        EditButton: () => null,
        errorCount: 0,
        formSchema: [],
        initialState: {},
        nodeKey: 'block',
        RemoveButton: () => null,
      }

      await act(async () => root.render(React.createElement(BlockContent, props)))
      const input = container.querySelector('input')!

      input.value = 'edited without saving'
      await act(async () =>
        root.render(React.createElement(BlockContent, { ...props, errorCount: 2 })),
      )

      expect(container.querySelector('input')).toBe(input)
      expect(input.value).toBe('edited without saving')
      expect(container.querySelector('[data-errors]')?.getAttribute('data-errors')).toBe('2')
      expect(mounts).toBe(1)

      await act(async () => root.unmount())
      container.remove()
    },
  )
})
