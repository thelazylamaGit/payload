import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ArrayAction } from '../ArrayAction/index.js'
import { ClipboardAction } from './index.js'

vi.mock('../../providers/Translation/index.js', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../Popup/index.js', () => ({
  Popup: ({ render }) => render({ close: vi.fn() }),
  PopupList: {
    Button: ({ children, disabled }) => createElement('button', { disabled }, children),
    ButtonGroup: ({ children }) => createElement('div', {}, children),
  },
}))

const rowProps = {
  addRow: vi.fn(),
  copyRow: vi.fn(),
  duplicateRow: vi.fn(),
  hasMaxRows: false,
  index: 0,
  moveRow: vi.fn(),
  pasteRow: vi.fn(),
  removeRow: vi.fn(),
  rowCount: 1,
}

describe('native clipboard menus', () => {
  it('should retain ordinary Array row labels by default', () => {
    const html = renderToStaticMarkup(createElement(ArrayAction, rowProps))
    expect(html).toContain('general:copyRow')
    expect(html).toContain('general:pasteRow')
    expect(html).not.toContain('Copy Block')
  })

  it('should show only the explicit Blocks labels and disable insertion at the limit', () => {
    const html = renderToStaticMarkup(
      createElement(ArrayAction, {
        ...rowProps,
        copyLabel: 'Copy Block',
        pasteLabel: 'Paste Block Below',
        isPasteDisabled: true,
      }),
    )
    expect(html).toContain('Copy Block')
    expect(html).toContain('Paste Block Below')
    expect(html).not.toContain('general:copyRow')
    expect(html).not.toContain('general:pasteRow')
    expect(html).toMatch(/<button disabled="">.*Paste Block Below/)
  })

  it('should offer Paste Block alongside unchanged field actions, even for an empty field', () => {
    const html = renderToStaticMarkup(
      createElement(ClipboardAction, {
        allowCopy: false,
        allowPaste: true,
        blocks: [],
        getDataToCopy: () => ({}),
        onPaste: vi.fn(),
        onPasteBlock: vi.fn(),
        path: 'target',
        type: 'blocks',
      }),
    )
    expect(html).toContain('general:copyField')
    expect(html).toContain('general:pasteField')
    expect(html).toContain('general:pasteBlock')
  })

  it('should leave Array field menus without a block insertion action', () => {
    const html = renderToStaticMarkup(
      createElement(ClipboardAction, {
        allowCopy: true,
        allowPaste: true,
        fields: [],
        getDataToCopy: () => ({}),
        onPaste: vi.fn(),
        path: 'target',
        type: 'array',
      }),
    )
    expect(html).not.toContain('general:pasteBlock')
  })
})
