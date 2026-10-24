import type { FormState } from 'payload'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BlocksField } from '../../fields/Blocks/index.js'
import { fieldReducer } from '../../forms/Form/fieldReducer.js'

const harness = vi.hoisted(() => ({
  state: {} as FormState,
  append: undefined as (() => void) | undefined,
  row: undefined as any,
  getFormState: vi.fn(),
  dispatch: vi.fn(),
  modified: vi.fn(),
  error: vi.fn(),
  disabled: false,
}))
vi.mock('sonner', () => ({ toast: { error: harness.error, success: vi.fn() } }))
vi.mock('../../forms/withCondition/index.js', () => ({ withCondition: (Component) => Component }))
vi.mock('../../providers/Translation/index.js', () => ({
  useTranslation: () => ({ i18n: { language: 'en' }, t: (key) => key }),
}))
vi.mock('../../providers/Config/index.js', () => ({
  useConfig: () => ({ config: { localization: false, blocksMap: {} } }),
}))
vi.mock('../../providers/DocumentInfo/index.js', () => ({
  useDocumentInfo: () => ({
    collectionSlug: 'practitioners',
    id: 1,
    setDocFieldPreferences: vi.fn(),
  }),
}))
vi.mock('../../providers/Locale/index.js', () => ({ useLocale: () => ({ code: 'en' }) }))
vi.mock('../../providers/Operation/index.js', () => ({ useOperation: () => 'update' }))
vi.mock('../../providers/ServerFunctions/index.js', () => ({
  useServerFunctions: () => ({ getFormState: harness.getFormState }),
}))
vi.mock('../../forms/Form/context.js', () => ({
  useForm: () => ({
    getFields: () => harness.state,
    dispatchFields: harness.dispatch,
    setModified: harness.modified,
  }),
  useDocumentForm: () => ({ getFields: () => harness.state }),
  useFormSubmitted: () => false,
}))
vi.mock('../../forms/useField/index.js', () => ({
  useField: () => ({
    disabled: harness.disabled,
    errorPaths: [],
    path: 'blocks',
    rows: harness.state.blocks.rows,
    valid: true,
    value: harness.state.blocks.value,
  }),
}))
vi.mock('./index.js', () => ({
  ClipboardAction: (props) => {
    harness.append = props.onPasteBlock
    return null
  },
}))
vi.mock('../../fields/Blocks/BlockRow.js', () => ({
  BlockRow: (props) => {
    harness.row = props
    return null
  },
}))
vi.mock('../DraggableSortable/index.js', () => ({ DraggableSortable: ({ children }) => children }))
vi.mock('../DraggableSortable/DraggableSortableItem/index.js', () => ({
  DraggableSortableItem: ({ children }) => children({}),
}))
vi.mock('../Drawer/index.js', () => ({ DrawerToggler: ({ children }) => children }))
vi.mock('../Drawer/useDrawerSlug.js', () => ({ useDrawerSlug: () => 'drawer' }))
vi.mock('../../fields/Blocks/BlocksDrawer/index.js', () => ({ BlocksDrawer: () => null }))
vi.mock('../../forms/NullifyField/index.js', () => ({ NullifyLocaleField: () => null }))
vi.mock('../RenderCustomComponent/index.js', () => ({ RenderCustomComponent: () => null }))
vi.mock('../Button/index.js', () => ({ Button: () => null }))

const accordion = { slug: 'accordion', fields: [{ name: 'text', type: 'text' as const }] }
const prepared = { text: { value: 'copied text', valid: true } }
function mount(readOnly = false) {
  renderToStaticMarkup(
    createElement(BlocksField, {
      field: { name: 'blocks', type: 'blocks', blocks: [accordion], admin: {} },
      permissions: true,
      readOnly,
      schemaPath: 'practitioners.blocks',
    } as any),
  )
}
function deferred() {
  let resolve: (value: any) => void
  let reject: (error: Error) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
async function finish() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  harness.disabled = false
  harness.state = {
    blocks: { value: 1, valid: true, rows: [{ id: 'anchor', blockType: 'accordion' }] },
    'blocks.0.id': { value: 'anchor', valid: true },
    'blocks.0.text': { value: 'original', valid: true },
  }
  harness.dispatch.mockImplementation((action) => {
    harness.state = fieldReducer(harness.state, action)
  })
  harness.getFormState.mockResolvedValue({ state: prepared })
  vi.stubGlobal('localStorage', {
    getItem: () =>
      JSON.stringify({
        type: 'blocks',
        blocks: [accordion],
        path: 'source',
        rowIndex: 0,
        data: {
          'source.0.blockType': { value: 'accordion', valid: true },
          'source.0.text': { value: 'copied text', valid: true },
        },
      }),
  })
})

describe('Blocks clipboard action lifecycle', () => {
  it('should prepare once under rapid repeated clicks and publish only complete data to autosave', async () => {
    const request = deferred()
    harness.getFormState.mockReturnValue(request.promise)
    mount()
    harness.append()
    harness.append()
    harness.append()
    expect(harness.getFormState).toHaveBeenCalledTimes(1)
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.modified).not.toHaveBeenCalled()
    expect(harness.state.blocks.rows).toHaveLength(1)
    request.resolve({ state: prepared })
    await finish()
    expect(harness.dispatch).toHaveBeenCalledTimes(1)
    expect(harness.state.blocks.rows).toHaveLength(2)
    expect(harness.state['blocks.1.text'].value).toBe('copied text')
    expect(harness.modified).toHaveBeenCalledExactlyOnceWith(true)
  })

  it.each(['reject', 'empty'] as const)(
    'should leave no stray row when preparation fails: %s',
    async (failure) => {
      const request = deferred()
      harness.getFormState.mockReturnValue(request.promise)
      mount()
      const original = harness.state
      harness.append()
      if (failure === 'reject') {
        request.reject(new Error('native initialization failed'))
      } else {
        request.resolve({ state: null })
      }
      await finish()
      expect(harness.state).toBe(original)
      expect(harness.dispatch).not.toHaveBeenCalled()
      expect(harness.modified).not.toHaveBeenCalled()
      expect(harness.error).toHaveBeenCalledOnce()
    },
  )

  it('should preserve Paste Row replacement alongside Paste Below', async () => {
    mount()
    harness.row.pasteRow(0)
    await finish()
    expect(harness.state.blocks.rows).toHaveLength(1)
    expect(harness.state.blocks.rows[0].id).toBe('anchor')
    expect(harness.state['blocks.0.text'].value).toBe('copied text')
    harness.row.pasteBelow(0)
    await finish()
    expect(harness.state.blocks.rows).toHaveLength(2)
  })

  it.each(['readOnly', 'disabled'])(
    'should reject an unavailable destination: %s',
    async (kind) => {
      harness.disabled = kind === 'disabled'
      mount(kind === 'readOnly')
      harness.append()
      await finish()
      expect(harness.getFormState).not.toHaveBeenCalled()
      expect(harness.dispatch).not.toHaveBeenCalled()
    },
  )

  it('should recheck dynamic restrictions after delayed row preparation', async () => {
    const request = deferred()
    harness.getFormState.mockReturnValue(request.promise)
    mount()
    harness.append()
    harness.state.blocks.blocksFilterOptions = ['video']
    request.resolve({ state: prepared })
    await finish()
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.state.blocks.rows).toHaveLength(1)
  })
  it('should retain native Paste Row from a compatible whole-field copy', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          type: 'blocks',
          blocks: [accordion],
          path: 'source',
          data: {
            'source.0.blockType': { value: 'accordion', valid: true },
            'source.0.text': { value: 'copied text', valid: true },
          },
        }),
    })
    mount()
    harness.row.pasteRow(0)
    await finish()
    expect(harness.state.blocks.rows).toHaveLength(1)
    expect(harness.state['blocks.0.text'].value).toBe('copied text')
    expect(harness.getFormState.mock.calls[0][0].data.text).toBe('copied text')
  })
})
