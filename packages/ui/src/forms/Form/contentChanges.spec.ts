// @vitest-environment jsdom
import type { FormState } from 'payload'

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentChanges } from './context.js'
import type { Context, FormProps } from './types.js'

import { useForm, useFormHasUnpublishedChanges, useFormHasUnsavedChanges } from './context.js'
import { Form } from './index.js'

const harness = vi.hoisted(() => ({
  api: undefined as Context | undefined,
  changes: undefined as ContentChanges | undefined,
  get: vi.fn(),
  getFormState: vi.fn(),
  request: vi.fn(),
}))

vi.mock('next/navigation.js', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => undefined)),
    success: vi.fn(),
  },
}))
vi.mock('../../elements/Toasts/fieldErrors.js', () => ({ FieldErrorsToast: () => null }))
vi.mock('../../providers/Auth/index.js', () => ({
  useAuth: () => ({ refreshCookie: vi.fn(), user: undefined }),
}))
vi.mock('../../providers/Config/index.js', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
}))
vi.mock('../../providers/DocumentInfo/index.js', () => ({
  useDocumentInfo: () => ({
    id: 1,
    collectionSlug: 'posts',
    docConfig: { slug: 'posts', versions: { drafts: {} } },
    getDocPreferences: async () => ({}),
    hasPublishedDoc: true,
  }),
}))
vi.mock('../../providers/Locale/index.js', () => ({ useLocale: () => ({ code: 'en' }) }))
vi.mock('../../providers/Operation/index.js', () => ({ useOperation: () => 'update' }))
vi.mock('../../providers/RouteTransition/index.js', () => ({
  useRouteTransition: () => ({ startRouteTransition: vi.fn() }),
}))
vi.mock('../../providers/ServerFunctions/index.js', () => ({
  useServerFunctions: () => ({ getFormState: harness.getFormState }),
}))
vi.mock('../../providers/Translation/index.js', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string) => key }),
}))
vi.mock('../../providers/UploadHandlers/index.js', () => ({
  useUploadHandlers: () => ({ getUploadHandler: vi.fn() }),
}))
vi.mock('../../hooks/useQueue.js', () => ({ useQueue: () => ({ queueTask: vi.fn() }) }))
vi.mock('../../utilities/api.js', () => ({
  requests: { get: harness.get, patch: harness.request },
}))

const docState = (title: string, status: 'draft' | 'published' = 'published'): FormState => ({
  _status: { initialValue: status, value: status },
  title: { initialValue: title, value: title },
  updatedAt: { initialValue: String(Math.random()), value: String(Math.random()) },
})

const respond = (status: number) =>
  harness.request.mockResolvedValueOnce(
    new Response(JSON.stringify({ doc: {} }), {
      headers: { 'content-type': 'application/json' },
      status,
    }),
  )

const cleanups: Array<() => void> = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const Probe = () => {
  harness.api = useForm()
  harness.changes = {
    hasUnpublishedChanges: useFormHasUnpublishedChanges(),
    hasUnsavedChanges: useFormHasUnsavedChanges(),
  }

  return null
}

const renderForm = (props: Partial<FormProps> = {}) => {
  const container = document.createElement('div')
  const root = createRoot(container)

  act(() =>
    root.render(
      createElement(Form, {
        action: '/api/posts/1',
        initialState: docState('Original'),
        isDocumentForm: true,
        method: 'PATCH',
        ...props,
        children: createElement(Probe),
      }),
    ),
  )

  cleanups.push(() => act(() => root.unmount()))
}

const edit = (path: string, value: unknown) =>
  act(() => {
    harness.api.dispatchFields({ type: 'UPDATE', path, value })
    harness.api.setModified(true)
  })

const settle = () => act(() => vi.advanceTimersByTime(250))

const submit = (status: 'draft' | 'published') =>
  act(async () => {
    await harness.api.submit({ overrides: { _status: status }, skipValidation: true })
  })

describe('document form content changes', () => {
  it('should report no changes once an edit is undone', () => {
    renderForm()

    edit('title', 'Changed')

    expect(harness.changes).toStrictEqual({ hasUnpublishedChanges: true, hasUnsavedChanges: true })

    edit('title', 'Original')
    settle()

    expect(harness.changes).toStrictEqual({
      hasUnpublishedChanges: false,
      hasUnsavedChanges: false,
    })
  })

  it('should not treat fields registered without user interaction as changes', () => {
    renderForm()

    act(() => {
      harness.api.dispatchFields({ type: 'UPDATE', path: 'password', valid: false })
    })
    edit('title', 'Changed')
    edit('title', 'Original')
    settle()

    expect(harness.changes.hasUnsavedChanges).toBe(false)
  })

  it('should have no unsaved changes after a save whose server state omits client-only fields', async () => {
    renderForm({ onSuccess: () => docState('Changed', 'draft') })

    edit('password', 'secret')
    edit('title', 'Changed')
    respond(200)
    await submit('draft')
    settle()

    expect(harness.changes).toStrictEqual({ hasUnpublishedChanges: true, hasUnsavedChanges: false })
  })

  it('should keep unsaved changes after a failed save', async () => {
    renderForm({ onSuccess: () => docState('Changed') })

    edit('title', 'Changed')
    respond(500)
    await submit('published')
    settle()

    expect(harness.changes.hasUnsavedChanges).toBe(true)

    edit('title', 'Original')
    settle()

    expect(harness.changes.hasUnsavedChanges).toBe(false)
  })

  it('should compare against the published content after saving a draft', async () => {
    renderForm({ onSuccess: () => docState('Changed', 'draft') })

    edit('title', 'Changed')
    respond(200)
    await submit('draft')
    edit('title', 'Original')
    settle()

    expect(harness.changes).toStrictEqual({ hasUnpublishedChanges: false, hasUnsavedChanges: true })
  })

  it('should have no unpublished changes after publishing', async () => {
    renderForm({ onSuccess: () => docState('Changed') })

    edit('title', 'Changed')
    respond(200)
    await submit('published')
    settle()

    expect(harness.changes).toStrictEqual({
      hasUnpublishedChanges: false,
      hasUnsavedChanges: false,
    })
  })

  it('should not know the published content when loaded with a newer draft', () => {
    renderForm({ initialState: docState('Draft', 'draft') })

    expect(harness.changes).toStrictEqual({
      hasUnpublishedChanges: undefined,
      hasUnsavedChanges: false,
    })
  })

  it('should use the saved content as published content when the loaded draft matches it', async () => {
    harness.get.mockImplementation(
      async () =>
        new Response(JSON.stringify({ title: 'Draft', updatedAt: String(Math.random()) })),
    )
    renderForm({ initialState: docState('Draft', 'draft') })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(harness.get).toHaveBeenCalledTimes(2)
    expect(harness.changes.hasUnpublishedChanges).toBe(false)

    edit('title', 'Changed')
    settle()

    expect(harness.changes.hasUnpublishedChanges).toBe(true)
  })

  it('should not know the published content when the loaded draft differs from it', async () => {
    harness.get.mockImplementation(
      async (_url: string, { params }) =>
        new Response(JSON.stringify({ title: String(params.draft) })),
    )
    renderForm({ initialState: docState('Draft', 'draft') })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(harness.changes.hasUnpublishedChanges).toBeUndefined()
  })

  it('should forget the published content when the form is reset to a draft', async () => {
    harness.getFormState.mockResolvedValueOnce({ state: docState('Original', 'draft') })
    renderForm()

    await act(async () => {
      await harness.api.reset({})
    })

    expect(harness.changes.hasUnpublishedChanges).toBeUndefined()
  })
})
