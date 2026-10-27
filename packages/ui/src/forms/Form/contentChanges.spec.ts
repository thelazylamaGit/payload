// @vitest-environment jsdom
import type { FormState } from 'payload'

import React, { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Context, FormProps } from './types.js'

import { Autosave } from '../../elements/Autosave/index.js'
import { PublishButton } from '../../elements/PublishButton/index.js'
import { UnpublishButton } from '../../elements/UnpublishButton/index.js'
import { SaveDraftButton } from '../../elements/SaveDraftButton/index.js'
import { useForm, useFormContentModified, useFormModified } from './context.js'
import { Form } from './index.js'
import { getFormContentSnapshot, getIgnoredDocumentFields } from './formContent.js'

const harness = vi.hoisted(() => ({
  api: undefined as Context | undefined,
  docListeners: new Set<() => void>(),
  publicationState: {} as Record<
    string,
    { published: Record<string, unknown> | null; saved: Record<string, unknown> }
  >,
  lastSubmittedStatus: undefined as unknown,
  localization: false as any,
  hasAutosaveControls: false,
  hasPublishControls: false,
  hasUnpublishControls: false,
  hasPublishedResponse: false,
  useRealQueue: false,
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
vi.mock('@faceless-ui/modal', () => ({
  useModal: () => ({ modalState: {}, isModalOpen: () => false, toggleModal: () => undefined }),
}))
vi.mock('../../elements/Popup/index.js', () => ({
  PopupList: {
    ButtonGroup: ({ children }) => createElement('div', null, children),
    Button: ({ children, disabled, id, onClick }) =>
      createElement('button', { disabled, id, onClick, type: 'button' }, children),
  },
}))
vi.mock('../../elements/PublishButton/ScheduleDrawer/index.js', () => ({
  ScheduleDrawer: () => null,
}))
vi.mock('../../elements/ConfirmationModal/index.js', () => ({
  ConfirmationModal: ({ onConfirm }) =>
    createElement(
      'button',
      { id: 'confirm-unpublish', type: 'button', onClick: onConfirm },
      'Confirm',
    ),
}))
vi.mock('../../elements/LeaveWithoutSaving/index.js', () => ({ LeaveWithoutSaving: () => null }))
vi.mock('../../elements/Toasts/fieldErrors.js', () => ({ FieldErrorsToast: () => null }))
vi.mock('../../forms/Submit/index.js', () => ({
  FormSubmit: ({ buttonId, children, disabled, onClick, ref, type, SubMenuPopupContent }) =>
    createElement(
      React.Fragment,
      null,
      createElement('button', { id: buttonId, disabled, onClick, ref, type }, children),
      SubMenuPopupContent && createElement(SubMenuPopupContent, { close: () => undefined }),
    ),
}))
vi.mock('../../providers/EditDepth/index.js', () => ({ useEditDepth: () => 1 }))
vi.mock('../../providers/Auth/index.js', () => ({
  useAuth: () => ({ refreshCookie: vi.fn(), user: undefined }),
}))
vi.mock('../../providers/Config/index.js', () => ({
  useConfig: () => ({
    config: { localization: harness.localization, routes: { api: '/api' } },
    getEntityConfig: () => harness.doc.docConfig,
  }),
}))
vi.mock('../../providers/DocumentInfo/index.js', () => ({
  useDocumentInfo: () => ({
    ...React.useSyncExternalStore(
      (listener) => {
        harness.docListeners.add(listener)
        return () => {
          harness.docListeners.delete(listener)
        }
      },
      () => harness.doc,
    ),
    getDocPreferences: harness.preferences,
  }),
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
vi.mock('../../hooks/useQueue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useQueue.js')>()

  return {
    useQueue: () => (harness.useRealQueue ? actual.useQueue() : { queueTask: harness.queueTask }),
  }
})
vi.mock('../../utilities/api.js', () => ({
  requests: {
    patch: (...args) => {
      harness.lastSubmittedStatus = JSON.parse(
        typeof args[1].body === 'string' ? args[1].body : args[1].body.get('_payload'),
      )._status
      return harness.request(...args)
    },
  },
}))

const fieldState = (value: string): FormState => ({ title: { initialValue: value, value } })
const cleanups: Array<() => void> = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  vi.clearAllMocks()
  harness.docListeners.clear()
  harness.localization = false
  harness.hasPublishControls = false
  harness.hasUnpublishControls = false
  harness.hasPublishedResponse = false
  harness.publicationState = {
    default: { published: { title: 'Original' }, saved: { title: 'Original' } },
  }
  harness.getFormState.mockImplementation(async () => {
    const code = harness.localization ? harness.locale : 'default'
    const state = harness.publicationState[code]

    return {
      state: {},
      publicationState: {
        published:
          harness.doc.hasPublishedDoc || harness.hasPublishedResponse ? state?.published : null,
        otherLocalesHaveChanges: Object.entries(harness.publicationState).some(
          ([locale, record]) =>
            locale !== code &&
            (record.published === null ||
              JSON.stringify(record.saved) !== JSON.stringify(record.published)),
        ),
      },
    }
  })
  harness.hasAutosaveControls = false
  harness.useRealQueue = false
  harness.locale = 'en'
  harness.operation = 'update'
  harness.doc = {
    id: 1,
    collectionSlug: 'posts',
    docConfig: { slug: 'posts', fields: [], versions: { drafts: {} } },
    hasPublishedDoc: true,
    unpublishedVersionCount: 0,
    setUnpublishedVersionCount: vi.fn(),
    incrementVersionCount: vi.fn(),
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

  return createElement(
    React.Fragment,
    null,
    !harness.hasAutosaveControls && createElement(SaveDraftButton),
    harness.hasUnpublishControls && createElement(UnpublishButton),
    (harness.hasPublishControls || harness.hasAutosaveControls) && createElement(PublishButton),
    harness.hasAutosaveControls &&
      createElement(Autosave, {
        id: 1,
        collection: harness.doc.docConfig,
        publishedDocUpdatedAt: '',
      }),
  )
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
          onSuccess: async (json, context) => {
            const state = await currentProps.onSuccess?.(json, context)

            if (state && harness.lastSubmittedStatus === 'published') {
              harness.hasPublishedResponse = true
              const code = harness.localization ? harness.locale : 'default'
              harness.publicationState[code] = {
                published: getFormContentSnapshot(
                  state,
                  getIgnoredDocumentFields(harness.doc.docConfig),
                ),
                saved: getFormContentSnapshot(
                  state,
                  getIgnoredDocumentFields(harness.doc.docConfig),
                ),
              }
            }
            return state
          },
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

const updateDoc = (values: Record<string, unknown>) => {
  harness.doc = { ...harness.doc, ...values }
  harness.docListeners.forEach((listener) => listener())
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

const versionState = (title: string, status: string, updatedAt: string): FormState => ({
  ...fieldState(title),
  _status: { value: status, initialValue: status },
  updatedAt: { value: updatedAt, initialValue: updatedAt },
})

const enablePublicationControls = () => {
  harness.hasPublishControls = true
  harness.doc.hasPublishPermission = true
  harness.doc.setHasPublishedDoc = vi.fn((value) => {
    updateDoc({ hasPublishedDoc: value })
  })
  harness.doc.setMostRecentVersionIsAutosaved = vi.fn((value) => {
    updateDoc({ mostRecentVersionIsAutosaved: value })
  })
  harness.doc.setUnpublishedVersionCount.mockImplementation((value) => {
    updateDoc({
      unpublishedVersionCount:
        typeof value === 'function' ? value(harness.doc.unpublishedVersionCount) : value,
    })
  })
}

const renderAutosaveForm = (props: Partial<FormProps> = {}) => {
  harness.hasAutosaveControls = true
  harness.useRealQueue = true
  harness.doc.docConfig = {
    slug: 'posts',
    fields: [],
    versions: { drafts: { autosave: { interval: 100 } } },
  }
  enablePublicationControls()

  let saveCount = 0

  harness.request.mockImplementation(async (_url, { body }) => {
    const data = JSON.parse(body.get('_payload'))

    return new Response(
      JSON.stringify({ doc: versionState(data.title, data._status, String(++saveCount)) }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    )
  })

  return renderForm({
    initialState: versionState('Original', 'published', '0'),
    onSuccess: async (json: { doc: FormState }) => json.doc,
    ...props,
  })
}

const renderDraftForm = (props: Partial<FormProps> = {}) => {
  enablePublicationControls()

  return renderForm({
    initialState: versionState('Original', 'published', '0'),
    onSuccess: async (_json, context) => ({
      ...context.formState,
      _status: { value: harness.lastSubmittedStatus, initialValue: harness.lastSubmittedStatus },
    }),
    ...props,
  })
}

const settleContent = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250)
  })
}

describe('document form content changes', () => {
  it('should keep draft and publication comparisons separate through edit, undo, draft save, and publish', async () => {
    const { container } = renderDraftForm()
    const draft = container.querySelector<HTMLButtonElement>('#action-save-draft')
    const publish = container.querySelector<HTMLButtonElement>('#action-save')

    await settleContent()
    expect(draft.disabled).toBe(true)
    expect(publish.disabled).toBe(true)
    edit('Changed')
    await settleContent()
    expect(draft.disabled).toBe(false)
    expect(publish.disabled).toBe(false)
    edit('Original')
    await settleContent()
    expect(draft.disabled).toBe(true)
    expect(publish.disabled).toBe(true)
    edit('Changed')
    await act(async () => {
      draft.click()
    })
    await settleContent()
    expect(draft.disabled).toBe(true)
    expect(publish.disabled).toBe(false)
    edit('Original')
    await settleContent()
    expect(draft.disabled).toBe(false)
    expect(publish.disabled).toBe(true)
    await save('published')
    expect(harness.request).toHaveBeenCalledOnce()
    edit('Changed')
    await settleContent()
    expect(draft.disabled).toBe(true)
    expect(publish.disabled).toBe(false)
    await act(async () => {
      publish.click()
    })
    await settleContent()
    expect(draft.disabled).toBe(true)
    expect(publish.disabled).toBe(true)
    expect(harness.request).toHaveBeenCalledTimes(2)
  })

  it('should enable initial publishing of a saved never-published draft through the real button', async () => {
    harness.doc.hasPublishedDoc = false
    const { container } = renderDraftForm({
      initialState: versionState('Saved draft', 'draft', '0'),
    })

    await settleContent()
    expect(container.querySelector<HTMLButtonElement>('#action-save-draft').disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(false)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    await settleContent()
    expect(harness.request).toHaveBeenCalledOnce()
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
  })

  it('should compare a saved draft against published content without relying on version counts', async () => {
    const { container } = renderDraftForm({
      initialState: versionState('Different draft', 'draft', '0'),
    })

    await settleContent()
    expect(harness.doc.unpublishedVersionCount).toBe(0)
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(false)
    expect(container.querySelector<HTMLButtonElement>('#action-save-draft').disabled).toBe(true)
  })

  it('should block an immediate publish when a rapid undo restores published content', async () => {
    const { container } = renderDraftForm({
      initialState: versionState('Saved draft', 'draft', '0'),
    })

    await settleContent()
    edit('Original')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    expect(harness.request).not.toHaveBeenCalled()
    expect(harness.api.getHasUnsavedChanges()).toBe(true)
  })

  it('should preserve draft metadata and baselines after a failed publish', async () => {
    harness.doc.unpublishedVersionCount = 3
    harness.doc.mostRecentVersionIsAutosaved = true
    const { container } = renderDraftForm({
      initialState: versionState('Saved draft', 'draft', '0'),
    })

    harness.request.mockResolvedValue(
      new Response('{}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )
    await settleContent()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    await settleContent()
    expect(harness.doc.unpublishedVersionCount).toBe(3)
    expect(harness.doc.mostRecentVersionIsAutosaved).toBe(true)
    expect(harness.doc.setHasPublishedDoc).not.toHaveBeenCalled()
    expect(harness.api.getHasUnpublishedChanges()).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(false)
  })

  it('should load publication state once across edits and refresh it after successful publication', async () => {
    renderDraftForm()
    await settleContent()
    expect(harness.getFormState).toHaveBeenCalledOnce()
    edit('First')
    await settleContent()
    edit('Second')
    await settleContent()
    await save('draft')
    expect(harness.getFormState).toHaveBeenCalledOnce()
    await save('published')
    expect(harness.getFormState).toHaveBeenCalledTimes(2)
  })

  it('should not send concurrent requests when Publish is clicked twice before a render', async () => {
    const { container } = renderDraftForm()

    edit('Changed')
    await act(async () => {
      const publish = container.querySelector<HTMLButtonElement>('#action-save')
      publish.click()
      publish.click()
    })
    expect(harness.request).toHaveBeenCalledOnce()
  })

  it('should retain unsaved edits if loading the publication baseline fails', async () => {
    const { container } = renderDraftForm()

    await settleContent()
    // Invalidate the old baseline through a fresh document initialisation.
    harness.getFormState.mockResolvedValue({ state: null })
    act(() => updateDoc({ id: 2 }))
    edit('Changed')
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    expect(harness.request).not.toHaveBeenCalled()
    expect(harness.api.getHasUnsavedChanges()).toBe(true)
  })

  it('should use authoritative returned values as the saved baseline after unpublishing', async () => {
    harness.hasUnpublishControls = true
    harness.doc.docPermissions = { update: true }
    harness.doc.data = { title: 'Old provider data', _status: 'published' }
    const { container } = renderDraftForm()
    const publication = harness.getFormState.getMockImplementation()

    harness.request.mockResolvedValue(
      new Response(JSON.stringify({ doc: { title: 'Normalised unpublish', _status: 'draft' } }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )
    harness.getFormState.mockImplementation((args) =>
      args.getPublicationState
        ? publication(args)
        : Promise.resolve({ state: versionState(args.data.title, 'draft', '1') }),
    )
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#confirm-unpublish').click()
    })
    await settleContent()

    expect(harness.api.getData().title).toBe('Normalised unpublish')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    expect(harness.doc.hasPublishedDoc).toBe(false)
  })

  it('should clear successfully saved password action fields without retaining a false dirty state', async () => {
    harness.doc.docConfig.auth = {}
    renderForm({ onSuccess: async () => fieldState('Original') })
    act(() => {
      harness.api.dispatchFields({ type: 'UPDATE', path: 'password', value: 'new-password' })
      harness.api.dispatchFields({
        type: 'UPDATE',
        path: 'confirm-password',
        value: 'new-password',
      })
      harness.api.setModified(true)
    })
    await save('draft')
    await settleContent()

    expect(harness.api.getFields().password).toBeUndefined()
    expect(harness.api.getFields()['confirm-password']).toBeUndefined()
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should save a draft through native form submission without unpublishing the document', async () => {
    const { container } = renderDraftForm({
      initialState: versionState('Saved draft', 'draft', '0'),
    })

    edit('New edit')
    await act(async () => {
      container
        .querySelector('form')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(harness.request).toHaveBeenCalledOnce()
    expect(
      new URL(harness.request.mock.calls[0][0], 'http://localhost').searchParams.get('draft'),
    ).toBe('true')
    expect(harness.doc.setHasPublishedDoc).not.toHaveBeenCalled()
  })

  it.each([
    { restored: 'Restored version', hasUnpublished: true },
    { restored: 'Original', hasUnpublished: false },
  ])(
    'should establish correct saved and published comparisons after reset to $restored',
    async ({ restored, hasUnpublished }) => {
      renderDraftForm()
      await settleContent()
      const publication = harness.getFormState.getMockImplementation()

      harness.getFormState.mockImplementation((args) =>
        args.getPublicationState
          ? publication(args)
          : Promise.resolve({ state: versionState(restored, 'draft', '1') }),
      )
      await act(async () => {
        await harness.api.reset({ title: restored })
      })
      await settleContent()
      expect(harness.api.getHasUnsavedChanges()).toBe(false)
      expect(harness.api.getHasUnpublishedChanges()).toBe(hasUnpublished)
    },
  )

  it('should compare active-locale and all-locale publishing independently', async () => {
    harness.localization = {
      defaultLocale: 'en',
      defaultLocalePublishOption: 'active',
      locales: [
        { code: 'en', label: 'English' },
        { code: 'fr', label: 'French' },
      ],
    }
    harness.doc.docConfig = {
      slug: 'posts',
      fields: [{ name: 'title', type: 'text', localized: true }],
      versions: { drafts: { localizeStatus: true } },
    }
    harness.publicationState = {
      en: { published: { title: 'Original' }, saved: { title: 'Original' } },
      fr: { published: { title: 'Bonjour' }, saved: { title: 'Modifié' } },
    }
    const { container } = renderDraftForm({
      onSuccess: async (_json, context) => {
        harness.publicationState.fr.published = { title: 'Modifié' }
        return context.formState
      },
    })

    await settleContent()
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('#publish-locale').disabled).toBe(false)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#publish-locale').click()
    })
    await settleContent()
    expect(harness.request).toHaveBeenCalledOnce()
    expect(
      new URL(harness.request.mock.calls[0][0], 'http://localhost').searchParams.get(
        'publishAllLocales',
      ),
    ).toBe('true')
    expect(container.querySelector<HTMLButtonElement>('#publish-locale').disabled).toBe(true)
  })

  it.each([false, true])(
    'should leave other locales publishable after active-locale publishing (localized status: %s)',
    async (localizeStatus) => {
      harness.localization = {
        defaultLocale: 'en',
        defaultLocalePublishOption: 'active',
        locales: [
          { code: 'en', label: 'English' },
          { code: 'fr', label: 'French' },
        ],
      }
      harness.doc.docConfig = {
        slug: 'posts',
        fields: [{ name: 'title', type: 'text', localized: true }],
        versions: { drafts: { localizeStatus } },
      }
      harness.publicationState = {
        en: { published: { title: 'Original' }, saved: { title: 'Original' } },
        fr: { published: { title: 'Bonjour' }, saved: { title: 'Modifié' } },
      }
      const { container } = renderDraftForm()

      edit('Changed English')
      await act(async () => {
        container.querySelector<HTMLButtonElement>('#action-save').click()
      })
      await settleContent()
      expect(harness.request).toHaveBeenCalledOnce()
      expect(
        new URL(harness.request.mock.calls[0][0], 'http://localhost').searchParams.get(
          'publishSpecificLocale',
        ),
      ).toBe('en')
      expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
      expect(container.querySelector<HTMLButtonElement>('#publish-locale').disabled).toBe(false)
    },
  )

  it('should retry a failed publication-baseline read before sending a publish', async () => {
    const read = harness.getFormState.getMockImplementation()
    harness.getFormState.mockImplementationOnce(async () => ({ state: null }))
    const { container } = renderDraftForm()

    await settleContent()
    edit('Changed')
    harness.getFormState.mockImplementation(read)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    await settleContent()

    expect(harness.request).toHaveBeenCalledOnce()
    expect(harness.api.getHasUnpublishedChanges()).toBe(false)
  })

  it('should cancel an old publish decision if the document changes while its baseline is loading', async () => {
    let finishBaseline: (result: unknown) => void
    harness.getFormState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBaseline = resolve
        }),
    )
    const { container, rerender } = renderDraftForm()

    edit('Old document edit')
    let submission: ReturnType<Context['submit']>
    await act(async () => {
      submission = harness.api.submit({ overrides: { _status: 'published' } })
    })
    harness.publicationState.default.published = { title: 'Other published' }
    harness.doc.id = 2
    rerender({ initialState: versionState('Other published', 'published', '0') })
    await act(async () => {
      finishBaseline({
        state: {},
        publicationState: { published: { title: 'Original' }, otherLocalesHaveChanges: false },
      })
      await submission
    })
    await settleContent()

    expect(harness.request).not.toHaveBeenCalled()
    expect(harness.api.getData().title).toBe('Other published')
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
  })

  it('should accept server-normalised unchanged fields while preserving edits during submission', async () => {
    let finishSave: (state: FormState) => void
    const pending = new Promise<FormState>((resolve) => {
      finishSave = resolve
    })

    renderForm({
      initialState: { ...fieldState('Original'), slug: { value: 'original' } },
      onSuccess: () => pending,
    })
    edit('Submitted')
    let submission: ReturnType<Context['submit']>

    await act(async () => {
      submission = harness.api.submit({ overrides: { _status: 'draft' } })
    })
    edit('Typed during request')
    await act(async () => {
      finishSave({ ...fieldState('Submitted'), slug: { value: 'normalised' } })
      await submission
    })
    expect(harness.api.getData()).toEqual({ title: 'Typed during request', slug: 'normalised' })
    edit('Submitted')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it.each(['Changed', 'Changed again'])(
    'should disable publishing after autosave and publish (current title: %s)',
    async (currentTitle) => {
      const { container } = renderAutosaveForm()
      const button = container.querySelector<HTMLButtonElement>('#action-save')

      edit('Changed')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })
      expect(harness.request).toHaveBeenCalledOnce()
      expect(button.disabled).toBe(false)
      edit(currentTitle)
      await act(async () => {
        button.click()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })

      expect(harness.request).toHaveBeenCalledTimes(2)
      expect({
        data: harness.api.getData(),
        unsaved: harness.api.getHasUnsavedChanges(),
        modified: harness.modified,
        contentModified: harness.contentModified,
        count: harness.doc.unpublishedVersionCount,
      }).toEqual({
        data: {
          title: currentTitle,
          _status: 'published',
          updatedAt: '2',
        },
        unsaved: false,
        modified: false,
        contentModified: false,
        count: 0,
      })
      expect(button.disabled).toBe(true)
      await act(async () => {
        button.click()
      })
      await save('published')
      await shortcut()
      expect(harness.request).toHaveBeenCalledTimes(2)
    },
  )

  it('should not autosave unchanged values after a publish changes the status and timestamp', async () => {
    const { container } = renderAutosaveForm()

    edit('Changed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    // A field can emit an unchanged value after accepting server-normalised state.
    edit('Changed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(harness.request).toHaveBeenCalledTimes(2)
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    expect(harness.doc.unpublishedVersionCount).toBe(0)
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
  })

  it('should autosave pending edits after a manual draft save finishes', async () => {
    renderAutosaveForm({ initialState: versionState('Saved draft', 'draft', '0') })
    let finishRequest: (response: Response) => void
    harness.request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve
        }),
    )

    edit('Submitted draft')
    let submission: ReturnType<Context['submit']>

    await act(async () => {
      submission = harness.api.submit({ overrides: { _status: 'draft' } })
    })
    edit('Latest pending edit')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await act(async () => {
      finishRequest(
        new Response(JSON.stringify({ doc: versionState('Submitted draft', 'draft', '1') }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      await submission
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(harness.request).toHaveBeenCalledTimes(2)
    expect(JSON.parse(harness.request.mock.calls[1][1].body.get('_payload')).title).toBe(
      'Latest pending edit',
    )
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
  })

  it('should still autosave real edits made while an autosave is in flight', async () => {
    const { container } = renderAutosaveForm()
    let finishAutosave: (response: Response) => void

    harness.request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishAutosave = resolve
        }),
    )
    edit('First edit')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    edit('Latest edit')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    await act(async () => {
      finishAutosave(
        new Response(JSON.stringify({ doc: versionState('First edit', 'draft', '1') }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(harness.request).toHaveBeenCalledTimes(2)
    expect(JSON.parse(harness.request.mock.calls[1][1].body.get('_payload')).title).toBe(
      'Latest edit',
    )
    expect(harness.api.getData().title).toBe('Latest edit')
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    await act(async () => {
      container.querySelector<HTMLButtonElement>('#action-save').click()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    expect(harness.request).toHaveBeenCalledTimes(3)
    expect(container.querySelector<HTMLButtonElement>('#action-save').disabled).toBe(true)
  })

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

  it('should keep an accepted upload clean after publication baseline refresh', async () => {
    harness.doc.docConfig.upload = {}
    renderDraftForm()
    await settleContent()
    const file = new File(['content'], 'upload.txt', { type: 'text/plain' })

    act(() => {
      harness.api.dispatchFields({ type: 'UPDATE', path: 'file', value: file })
      harness.api.setModified(true)
    })
    await save('published')
    // The server returns persisted values, without the transient File object.
    harness.publicationState.default.published = { title: 'Original' }
    await settleContent()
    expect(harness.api.getHasUnsavedChanges()).toBe(false)
    expect(harness.api.getHasUnpublishedChanges()).toBe(false)
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

  it('should prevent publishing a saved draft identical to published content despite newer versions', async () => {
    harness.doc.unpublishedVersionCount = 1
    renderForm()

    await save('published')

    expect(harness.request).not.toHaveBeenCalled()
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
