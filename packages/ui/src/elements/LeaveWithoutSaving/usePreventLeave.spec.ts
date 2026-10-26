// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreventLeave } from './usePreventLeave.js'

vi.mock('next/navigation.js', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../providers/RouteTransition/index.js', () => ({
  useRouteTransition: () => ({ startRouteTransition: vi.fn() }),
}))

const cleanups: Array<() => void> = []

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.unstubAllGlobals()
})

describe('content-aware leave protection', () => {
  it('should read the latest comparison for navigation and browser unload', () => {
    let hasChanges = false
    const onPrevent = vi.fn()
    const prevent = () => hasChanges
    const container = document.createElement('div')
    const root = createRoot(container)
    const Probe = () => {
      usePreventLeave({ hasAccepted: false, onPrevent, prevent })

      return createElement('a', { href: '/other-document' }, 'Leave')
    }

    document.body.append(container)
    cleanups.push(() => {
      act(() => root.unmount())
      container.remove()
    })
    act(() => root.render(createElement(Probe)))

    const anchor = container.querySelector('a')
    const click = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })

      anchor.dispatchEvent(event)
      return event.defaultPrevented
    }
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })

      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    hasChanges = true
    expect(click()).toBe(true)
    expect(unload()).toBe(true)
    expect(onPrevent).toHaveBeenCalledOnce()

    // Simulate undo before any debounced React state update or render.
    hasChanges = false
    expect(unload()).toBe(false)
    // Prevent jsdom from attempting the actual navigation after the capture handler.
    anchor.addEventListener('click', (event) => event.preventDefault())
    click()
    expect(onPrevent).toHaveBeenCalledOnce()
  })
})
