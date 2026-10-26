// @vitest-environment jsdom
import type { FormState } from 'payload'

import React, { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Context, FormProps } from './types.js'

import { SaveDraftButton } from '../../elements/SaveDraftButton/index.js'
import { useForm, useFormContentModified, useFormModified } from './context.js'
import { Form } from './index.js'

const harness = vi.hoisted(() => ({
  api: undefined as Context | undefined,
  contentModified: false,
  modified: false,
  locale: 'en',
  operation: 'update',
  doc: {} as Record<string, any>,
  request: vi.fn(),
  getFormState: vi.fn(),
  preferences: vi.fn(async () => ({})),
  queueTask: vi.fn(),
}))

vi.mock('next/navigation.js', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: {
    promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => undefined)),
    success: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock('@faceless-ui/modal', () => ({ useModal: () => ({ modalState: {} }) }))
vi.mock('../../elements/Toasts/fieldErrors.js', () => ({ FieldErrorsToast: () => null }))
vi.mock('../../forms/Submit/index.js', () => ({
  FormSubmit: ({ buttonId, children, disabled, onClick, ref, type }) =>
    createElement('button', { id: buttonId, disabled, onClick, ref, type }, children),
}))
vi.mock('../../providers/EditDepth/index.js', () => ({ useEditDepth: () => 1 }))
vi.mock('../../providers/Auth/index.js', () => ({
  useAuth: () => ({ refreshCookie: vi.fn(), user: undefined }),
}))
vi.mock('../../providers/Config/index.js', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
}))
vi.mock('../../providers/DocumentInfo/index.js', () => ({
  useDocumentInfo: () => ({ ...harness.doc, getDocPreferences: harness.preferences }),
}))
vi.mock('../../providers/Locale/index.js', () => ({ useLocale: () => ({ code: harness.locale }) }))
vi.mock('../../providers/Operation/index.js', () => ({ useOperation: () => harness.operation }))
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
vi.mock('../../hooks/useQueue.js', () => ({ useQueue: () => ({ queueTask: harness.queueTask }) }))
vi.mock('../../utilities/api.js', () => ({ requests: { patch: harness.request } }))

const fieldState = (value: string): FormState => ({ title: { initialValue: value, value } })
const cleanups: Array<() => void> = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.clearAllMocks()
  harness.locale = 'en'
  harness.operation = 'update'
  harness.doc = {
    id: 1,
    collectionSlug: 'posts',
    docConfig: { versions: { drafts: {} } },
    hasPublishedDoc: true,
    unpublishedVersionCount: 0,
    setUnpublishedVersionCount: vi.fn(),
  }
  harness.request.mockImplementation(
    async () =>
      new Response(JSON.stringify({ doc: {} }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
  )
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
  harness.contentModified = useFormContentModified()
  harness.modified = useFormModified()

  return createElement(SaveDraftButton)
}

const renderForm = (props: Partial<FormProps> = {}) => {
  const container = document.createElement('div')
  const root = createRoot(container)
  let currentProps = { initialState: fieldState('Original'), ...props }
  const render = () =>
    act(() =>
      root.render(
        createElement(Form, {
          action: '/api/posts/1',
          method: 'PATCH',
          isDocumentForm: true,
          ...currentProps,
          children: createElement(Probe),
        }),
      ),
    )

  document.body.append(container)
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  render()

  return {
    container,
    rerender: (props: Partial<FormProps>) => {
      currentProps = { ...currentProps, ...props }
      render()
    },
  }
}

const edit = (value: string) =>
  act(() => {
    harness.api.dispatchFields({ type: 'UPDATE', path: 'title', value })
    harness.api.setModified(true)
  })
const settle = () => act(() => vi.advanceTimersByTime(250))
const save = async (status = 'draft') => {
  await act(async () => {
    await harness.api.submit({ overrides: { _status: status } })
  })
}
const shortcut = async () => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 's', code: 'KeyS' }))
  })
}

describe('document form content changes', () => {
  it('should disable Save Draft after undo without resetting internal modified tracking', () => {
    const { container } = renderForm()
    const button = container.querySelector('button')

    edit('Changed')
    expect(button.disabled).toBe(false)
    edit('Original')
    settle()

    expect(harness.contentModified).toBe(false)
    expect(harness.modified).toBe(true)
    expect(button.disabled).toBe(true)
  })

  it('should prevent no-op button, shortcut, and native form submissions before the debounce', async () => {
    const { container } = renderForm()

    edit('Changed')
    edit('Original')
    await act(async () => {
      container.querySelector('button').click()
    })
    await shortcut()
    await act(async () => {
      container
        .querySelector('form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(harness.request).not.toHaveBeenCalled()
    expect(harness.doc.setUnpublishedVersionCount).not.toHaveBeenCalled()
  })

  it('should save the latest edit immediately through the Save Draft shortcut', async () => {
    renderForm({ onSuccess: async () => fieldState('Changed') })

    edit('Changed')
    await shortcut()

    expect(harness.request).toHaveBeenCalledOnce()
    const request = harness.request.mock.calls[0][1]

    expect(JSON.parse(request.body.get('_payload')).title).toBe('Changed')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it.each(['draft', 'published'])(
    'should reset to server-normalised values after saving %s',
    async (status) => {
      renderForm({ onSuccess: async () => fieldState('Normalised') })

      edit('Changed')
      await save(status)
      settle()

      expect(harness.api.getHasUnsavedChanges()).toBe(false)
      expect(harness.api.getData().title).toBe('Normalised')
      edit('Different')
      edit('Normalised')
      settle()
      expect(harness.contentModified).toBe(false)
    },
  )

  it('should publish the latest values before the comparison debounce', async () => {
    renderForm({ onSuccess: async () => fieldState('Latest') })

    edit('Latest')
    await save('published')

    expect(harness.request).toHaveBeenCalledOnce()
    expect(JSON.parse(harness.request.mock.calls[0][1].body.get('_payload')).title).toBe('Latest')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should preserve edits made during a pending manual save', async () => {
    let finishSave: (state: FormState) => void
    const responseState = new Promise<FormState>((resolve) => {
      finishSave = resolve
    })

    renderForm({ onSuccess: () => responseState })
    edit('Submitted')

    let submission: ReturnType<Context['submit']>

    await act(async () => {
      submission = harness.api.submit({ overrides: { _status: 'draft' } })
    })
    edit('Typed while saving')
    await act(async () => {
      finishSave(fieldState('Submitted'))
      await submission
    })
    settle()

    expect(harness.api.getData().title).toBe('Typed while saving')
    expect(harness.api.getHasUnsavedChanges()).toBe(true)
    edit('Submitted')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should not replace a new document baseline with an old save response', async () => {
    let finishSave: (state: FormState) => void
    const responseState = new Promise<FormState>((resolve) => {
      finishSave = resolve
    })
    const { rerender } = renderForm({ onSuccess: () => responseState })

    edit('Submitted')

    let submission: ReturnType<Context['submit']>

    await act(async () => {
      submission = harness.api.submit({ overrides: { _status: 'draft' } })
    })
    harness.doc.id = 2
    rerender({ initialState: fieldState('Another document') })
    await act(async () => {
      finishSave(fieldState('Submitted'))
      await submission
    })

    expect(harness.api.getData().title).toBe('Another document')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should preserve existing autosave submissions even when the content is unchanged', async () => {
    renderForm({ onSuccess: async () => fieldState('Original') })

    act(() => harness.api.setBackgroundProcessing(true))
    await act(async () => {
      await harness.api.submit({
        overrides: { _status: 'draft' },
        disableFormWhileProcessing: false,
        acceptValues: { overrideLocalChanges: false },
      })
    })

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should settle a successfully uploaded file without suppressing a replacement upload', async () => {
    harness.doc.docConfig.upload = {}
    renderForm({ onSuccess: async () => fieldState('Original') })

    const file = new File(['first'], 'upload.txt', { type: 'text/plain' })

    act(() => {
      harness.api.dispatchFields({ type: 'UPDATE', path: 'file', value: file })
      harness.api.setModified(true)
    })
    await save()
    settle()

    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    act(() => {
      harness.api.dispatchFields({
        type: 'UPDATE',
        path: 'file',
        value: new File(['second'], 'upload.txt'),
      })
      harness.api.setModified(true)
    })
    expect(harness.api.getHasUnsavedChanges()).toBe(true)
  })

  it('should wait for pending autocomplete values before deciding to skip a submission', async () => {
    renderForm({ waitForAutocomplete: true, onSuccess: async () => fieldState('Autocompleted') })

    let submission: ReturnType<Context['submit']>

    act(() => {
      submission = harness.api.submit({ overrides: { _status: 'draft' } })
    })
    edit('Autocompleted')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
      await submission
    })

    expect(harness.request).toHaveBeenCalledOnce()
    expect(JSON.parse(harness.request.mock.calls[0][1].body.get('_payload')).title).toBe(
      'Autocompleted',
    )
  })

  it('should allow submissions with explicit custom data overrides', async () => {
    renderForm()

    await act(async () => {
      await harness.api.submit({ overrides: { title: 'Changed by an action' } })
    })

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should retain the original behaviour for forms outside the document editor', async () => {
    renderForm({ isDocumentForm: false })

    await save()

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should retain the baseline after a failed save', async () => {
    renderForm({ onSuccess: vi.fn() })
    harness.request.mockResolvedValue(
      new Response('{}', {
        headers: { 'content-type': 'application/json' },
        status: 400,
      }),
    )

    edit('Changed')
    await save()

    expect(harness.api.getHasUnsavedChanges()).toBe(true)
    edit('Original')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should permit initial publishing of a saved draft', async () => {
    harness.doc.hasPublishedDoc = false
    renderForm()

    await save('published')

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should permit publishing an unchanged saved draft when newer versions exist', async () => {
    harness.doc.unpublishedVersionCount = 1
    renderForm()

    await save('published')

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should preserve initial document creation', async () => {
    harness.operation = 'create'
    renderForm()

    await save()

    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should keep the saved baseline during array/block paste through replaceState', () => {
    renderForm()

    act(() => {
      harness.api.replaceState(fieldState('Pasted'))
      harness.api.setModified(true)
    })

    expect(harness.api.getHasUnsavedChanges()).toBe(true)
  })

  it('should reset the baseline when switching document and locale', () => {
    const { rerender } = renderForm()

    edit('Changed')
    harness.locale = 'fr'
    harness.doc.id = 2
    rerender({ initialState: fieldState('Bonjour') })

    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    edit('Autre')
    edit('Bonjour')
    settle()
    expect(harness.contentModified).toBe(false)
  })

  it('should reset the baseline after an explicit authoritative reset', async () => {
    renderForm()
    harness.getFormState.mockResolvedValue({ state: fieldState('Reverted') })

    edit('Changed')
    await act(async () => {
      await harness.api.reset({ title: 'Reverted' })
    })

    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    expect(harness.api.getData().title).toBe('Reverted')
  })
})
