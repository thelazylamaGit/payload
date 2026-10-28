'use client'
import type { RenderedField } from 'payload'

import { createContext, use } from 'react'
import {
  createContext as createSelectorContext,
  useContextSelector,
  useContext as useFullContext,
} from 'use-context-selector'

import type { Context, FormFieldsContext as FormFieldsContextType } from './types.js'

const FormContext = createContext({} as Context)
const DocumentFormContext = createContext({} as Context)
const FormWatchContext = createContext({} as Context)
const SubmittedContext = createContext(false)
const ProcessingContext = createContext(false)
/**
 * If the form has started processing in the background (e.g.
 * if autosave is running), this will be true.
 */
const BackgroundProcessingContext = createContext(false)
const ModifiedContext = createContext(false)
export type ContentChanges = {
  /**
   * Whether the form content differs from the last published content.
   * `undefined` when the published content is unknown, e.g. the document was loaded with a newer draft.
   */
  hasUnpublishedChanges: boolean | undefined
  /** Whether the form content differs from the last successfully saved content. */
  hasUnsavedChanges: boolean
  /**
   * Whether the last successfully saved content is the same as the published content.
   * `undefined` when the published content is unknown.
   */
  isSavedContentPublished: boolean | undefined
}
/** Only provided by document forms. */
const ContentChangesContext = createContext<ContentChanges | null>(null)
const InitializingContext = createContext(false)
const FormFieldsContext = createSelectorContext<FormFieldsContextType>([{}, () => null])

export type RenderedFieldSlots = Map<string, RenderedField>

/**
 * Get the state of the form, can be used to submit & validate the form.
 *
 * @see https://payloadcms.com/docs/admin/react-hooks#useform
 */
const useForm = (): Context => use(FormContext)
/**
 * Get the state of the document-level form. This is useful if you need to access the document-level Form from within a child Form.
 * This is the case withing lexical Blocks, as each lexical blocks renders their own Form.
 */
const useDocumentForm = (): Context => use(DocumentFormContext)

const useWatchForm = (): Context => use(FormWatchContext)
const useFormSubmitted = (): boolean => use(SubmittedContext)
const useFormProcessing = (): boolean => use(ProcessingContext)
/**
 * If the form has started processing in the background (e.g.
 * if autosave is running), this will be true.
 */
const useFormBackgroundProcessing = (): boolean => use(BackgroundProcessingContext)
const useFormModified = (): boolean => use(ModifiedContext)
/**
 * Unlike `useFormModified`, this is `false` when an edit has been undone and the form content
 * matches what was last saved. Falls back to `useFormModified` outside of document forms.
 */
const useFormHasUnsavedChanges = (): boolean => {
  const contentChanges = use(ContentChangesContext)
  const modified = use(ModifiedContext)

  return contentChanges ? contentChanges.hasUnsavedChanges : modified
}
/**
 * Whether the form content differs from the last published content, or `undefined` if that is unknown.
 */
const useFormHasUnpublishedChanges = (): boolean | undefined =>
  use(ContentChangesContext)?.hasUnpublishedChanges
/**
 * Whether the last saved content is the same as the published content, or `undefined` if that is unknown.
 * Unlike version history, this is `true` when a draft has been saved with the same content as the published version.
 */
const useFormIsSavedContentPublished = (): boolean | undefined =>
  use(ContentChangesContext)?.isSavedContentPublished
const useFormInitializing = (): boolean => use(InitializingContext)

/**
 * Get and set the value of a form field based on a selector
 *
 * @see https://payloadcms.com/docs/admin/react-hooks#useformfields
 */
const useFormFields = <Value = unknown>(
  selector: (context: FormFieldsContextType) => Value,
): Value => useContextSelector(FormFieldsContext, selector)

/**
 * Get the state of all form fields.
 *
 * @see https://payloadcms.com/docs/admin/react-hooks#useallformfields
 */
const useAllFormFields = (): FormFieldsContextType => useFullContext(FormFieldsContext)

export {
  BackgroundProcessingContext,
  ContentChangesContext,
  DocumentFormContext,
  FormContext,
  FormFieldsContext,
  FormWatchContext,
  InitializingContext,
  ModifiedContext,
  ProcessingContext,
  SubmittedContext,
  useAllFormFields,
  useDocumentForm,
  useForm,
  useFormBackgroundProcessing,
  useFormFields,
  useFormHasUnpublishedChanges,
  useFormHasUnsavedChanges,
  useFormInitializing,
  useFormIsSavedContentPublished,
  useFormModified,
  useFormProcessing,
  useFormSubmitted,
  useWatchForm,
}
