import type { FormState, ServerFunctionClient } from 'payload'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { ServerFunctionsContextType } from './index.js'

import { ServerFunctionsProvider, useServerFunctions } from './index.js'

function provider(serverFunction: ServerFunctionClient) {
  let functions: ServerFunctionsContextType

  function CaptureFunctions() {
    functions = useServerFunctions()
    return null
  }

  renderToStaticMarkup(
    createElement(ServerFunctionsProvider, {
      children: createElement(CaptureFunctions),
      serverFunction,
    }),
  )

  return functions
}

function fields(): FormState {
  return {
    body: {
      value: {
        root: { type: 'root', children: [{ type: 'text', text: 'Unsaved content', format: 1 }] },
      },
      valid: true,
      ...{ clipboardBlocks: [{ slug: 'nested', fields: [] }] },
    },
  }
}

describe('clipboard schemas at the Server Action boundary', () => {
  it('should omit metadata in main and nested Lexical form-state requests', async () => {
    const serverFunction = vi.fn().mockResolvedValue({ state: {} })
    const functions = provider(serverFunction)
    const state = fields()

    await functions.getFormState({
      collectionSlug: 'pages',
      docPermissions: { fields: true },
      docPreferences: {},
      documentFormState: state,
      formState: state,
      initialBlockFormState: state,
      operation: 'update',
      schemaPath: 'pages.layout.content',
    })

    const request = serverFunction.mock.calls[0][0]

    expect(request.name).toBe('form-state')
    for (const key of ['documentFormState', 'formState', 'initialBlockFormState']) {
      expect(request.args[key].body).not.toHaveProperty('clipboardBlocks')
      expect(request.args[key].body.value).toEqual(state.body.value)
    }
    expect(state.body).toHaveProperty('clipboardBlocks')
    expect(request.args.schemaPath).toBe('pages.layout.content')
  })

  it('should omit metadata from document render requests and keep the initial content', async () => {
    const serverFunction = vi.fn().mockResolvedValue({})
    const functions = provider(serverFunction)
    const state = fields()

    await functions.renderDocument({
      collectionSlug: 'pages',
      docID: 1,
      initialState: state,
      redirectAfterDelete: false,
      redirectAfterDuplicate: false,
    })

    const request = serverFunction.mock.calls[0][0]

    expect(request.name).toBe('render-document')
    expect(request.args.initialState.body).not.toHaveProperty('clipboardBlocks')
    expect(request.args.initialState.body.value).toEqual(state.body.value)
    expect(state.body).toHaveProperty('clipboardBlocks')
  })
})
