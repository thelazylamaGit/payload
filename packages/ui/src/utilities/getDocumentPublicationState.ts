import type { BuildFormStateArgs, Data } from 'payload'

import { dequal } from 'dequal/lite'
import { createLocalReq } from 'payload'
import { reduceFieldsToValues } from 'payload/shared'

import type { DocumentPublicationState } from '../forms/Form/formContent.js'

import { fieldSchemasToFormState } from '../forms/fieldSchemasToFormState/index.js'
import { getFormContentSnapshot, getIgnoredDocumentFields } from '../forms/Form/formContent.js'

/** Read-only, access-controlled baselines using the same field processing as the editor. */
export const getDocumentPublicationState = async ({
  id,
  collectionSlug,
  docPermissions,
  globalSlug,
  req,
}: BuildFormStateArgs): Promise<DocumentPublicationState> => {
  const { payload } = req
  const entity = collectionSlug
    ? payload.collections[collectionSlug]?.config
    : payload.globals.config.find((global) => global.slug === globalSlug)

  if (!entity || (collectionSlug && id == null)) {
    throw new Error('A saved document is required for publication comparison')
  }

  const localization = payload.config.localization
  const availableLocales =
    localization && localization.filterAvailableLocales
      ? await localization.filterAvailableLocales({ locales: localization.locales, req })
      : localization && localization.locales
  const locales = availableLocales
    ? availableLocales.map((locale) => (typeof locale === 'string' ? locale : locale.code))
    : ['default']
  const activeLocale = localization ? req.locale : 'default'
  const result: DocumentPublicationState = { otherLocalesHaveChanges: false, published: null }

  if (!locales.includes(activeLocale)) {
    throw new Error('The active locale is not available')
  }
  const ignoredFields = getIgnoredDocumentFields(entity)

  for (const locale of locales) {
    const localeReq = await createLocalReq(
      { fallbackLocale: false, locale, req: { ...req } },
      payload,
    )
    const read = (draft: boolean): Promise<Data> =>
      collectionSlug
        ? payload.findByID({
            id,
            collection: collectionSlug,
            depth: 0,
            draft,
            fallbackLocale: false,
            locale,
            overrideAccess: false,
            req: localeReq,
          })
        : payload.findGlobal({
            slug: globalSlug,
            depth: 0,
            draft,
            fallbackLocale: false,
            locale,
            overrideAccess: false,
            req: localeReq,
          })
    const normalise = async (data: Data, onlyLocalized = false): Promise<Data> => {
      const sharedRows = new Map<string, ['row', unknown]>()
      const state = await fieldSchemasToFormState({
        id,
        collectionSlug,
        data,
        fields: entity.fields,
        fieldSchemaMap: undefined,
        filter: ({ anyParentLocalized, data: siblingData, field, path }) => {
          const isLocalized = anyParentLocalized || Boolean('localized' in field && field.localized)

          if (
            onlyLocalized &&
            !isLocalized &&
            (field.type === 'array' || field.type === 'blocks')
          ) {
            siblingData[field.name]?.forEach((row, index) => {
              if (row.id != null) {
                sharedRows.set(`${path}.${index}`, ['row', row.id])
              }
            })
          }
          return !onlyLocalized || isLocalized
        },
        operation: 'update',
        permissions: docPermissions?.fields || {},
        preferences: { fields: {} },
        renderAllFields: false,
        req: localeReq,
        schemaPath: entity.slug,
        skipValidation: true,
      })

      if (!onlyLocalized) {
        return getFormContentSnapshot(state, ignoredFields)
      }

      // Shared row structure is determined by the active editor. Compare translations
      // by persisted row identity so shared reordering is not a translation change.
      const values = reduceFieldsToValues(state)
      const content: Data = {}

      for (const [path, value] of Object.entries(values)) {
        if (!ignoredFields.includes(path)) {
          const segments = path.split('.')
          const key = JSON.stringify(
            segments.map(
              (segment, index) => sharedRows.get(segments.slice(0, index + 1).join('.')) || segment,
            ),
          )

          content[key] = value
        }
      }
      return content
    }
    const published = await read(false)

    if (locale === activeLocale) {
      result.published = published._status === 'published' ? await normalise(published) : null
    } else if (published._status !== 'published') {
      result.otherLocalesHaveChanges = true
    } else {
      const saved = await read(true)

      if (hasLocalizedDifferences(await normalise(saved, true), await normalise(published, true))) {
        result.otherLocalesHaveChanges = true
      }
    }
  }

  return result
}

const hasLocalizedDifferences = (saved: Data, published: Data): boolean =>
  Object.keys({ ...saved, ...published }).some((path) => {
    // Added/deleted shared rows belong to the active editor's structural comparison.
    if ((!(path in saved) || !(path in published)) && JSON.parse(path).some(Array.isArray)) {
      return false
    }
    return !dequal(saved[path], published[path])
  })
