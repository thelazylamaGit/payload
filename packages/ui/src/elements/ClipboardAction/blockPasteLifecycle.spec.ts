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
  replace: vi.fn(),
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
    replaceState: harness.replace,
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
    blocksFilterOptions: harness.state.blocks.blocksFilterOptions,
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
  harness.replace.mockImplementation((state) => {
    harness.state = state
  })
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

describe('native synchronous Blocks clipboard actions', () => {
  it('should insert synchronously without an additional server request', () => {
    mount()
    harness.append()
    expect(harness.state.blocks.rows).toHaveLength(2)
    expect(harness.state['blocks.1.text'].value).toBe('copied text')
    expect(harness.dispatch).toHaveBeenCalledOnce()
    expect(harness.modified).toHaveBeenCalledExactlyOnceWith(true)
    expect(harness.getFormState).not.toHaveBeenCalled()
  })

  it('should insert exactly one complete row per repeated click', () => {
    mount()
    harness.append()
    harness.append()
    harness.append()
    expect(harness.state.blocks.rows).toHaveLength(4)
    expect(new Set(harness.state.blocks.rows.map((row) => row.id)).size).toBe(4)
    expect(harness.state['blocks.1.text'].value).toBe('copied text')
    expect(harness.state['blocks.2.text'].value).toBe('copied text')
    expect(harness.state['blocks.3.text'].value).toBe('copied text')
    expect(harness.getFormState).not.toHaveBeenCalled()
  })

  it('should leave state untouched when native clipboard validation fails', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'invalid json' })
    mount()
    const before = harness.state
    harness.append()
    expect(harness.state).toBe(before)
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.modified).not.toHaveBeenCalled()
    expect(harness.error).toHaveBeenCalledOnce()
  })

  it('should retain native Paste Row replacement alongside Paste Below', () => {
    mount()
    harness.row.pasteRow(0)
    expect(harness.state.blocks.rows).toHaveLength(1)
    expect(harness.state.blocks.rows[0].id).toBe('anchor')
    expect(harness.state['blocks.0.text'].value).toBe('copied text')
    expect(harness.replace).toHaveBeenCalledOnce()
    harness.row.pasteBelow(0)
    expect(harness.state.blocks.rows).toHaveLength(2)
    expect(harness.getFormState).not.toHaveBeenCalled()
  })

  it.each(['readOnly', 'disabled'])('should reject unavailable destinations: %s', (kind) => {
    harness.disabled = kind === 'disabled'
    mount(kind === 'readOnly')
    harness.append()
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.getFormState).not.toHaveBeenCalled()
  })

  it('should respect the destination block filter', () => {
    harness.state.blocks.blocksFilterOptions = ['video']
    mount()
    harness.append()
    expect(harness.state.blocks.rows).toHaveLength(1)
    expect(harness.dispatch).not.toHaveBeenCalled()
  })

  it('should retain native Paste Row from a compatible whole-field copy', () => {
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
    expect(harness.state.blocks.rows).toHaveLength(1)
    expect(harness.state['blocks.0.text'].value).toBe('copied text')
    expect(harness.getFormState).not.toHaveBeenCalled()
  })
})
