import type {
  ClientCollectionConfig,
  ClientGlobalConfig,
  Data,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
} from 'payload'

import { dequal } from 'dequal/lite'

/**
 * The parts of a field config, client or server, needed to read its values from a document.
 */
type ContentField = {
  blockReferences?: (ContentBlock | string)[]
  blocks?: ContentBlock[]
  fields?: ContentField[]
  localized?: boolean
  name?: string
  tabs?: { fields: ContentField[]; name?: string }[]
  type: string
}

type ContentBlock = { fields: ContentField[]; slug: string }

/**
 * Document fields that change on every save or publish without the user editing them.
 */
export const getIgnoredContentPaths = (
  config:
    | ClientCollectionConfig
    | ClientGlobalConfig
    | SanitizedCollectionConfig
    | SanitizedGlobalConfig
    | undefined,
): string[] =>
  config && 'timestamps' in config && config.timestamps === false
    ? ['_status']
    : ['_status', 'createdAt', 'updatedAt']

/**
 * A field value that is visually empty, so that e.g. clearing a field that had no value,
 * or undoing all input in an empty rich text editor, is not a change.
 * Only applies to whole field values, never to data within a value such as JSON.
 */
export const isEmptyValue = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && isEmptyRichText(value as Record<string, unknown>))

/**
 * Returns the non-empty values of a document by field path, read using its field config.
 * Documents read with `locale: 'all'` have their localized values keyed by locale.
 */
export const getDocumentContent = ({
  blocks,
  data,
  fields,
  ignoredPaths,
  localeCodes,
}: {
  blocks?: Record<string, ContentBlock>
  data: Data
  fields: ContentField[]
  ignoredPaths: string[]
  /** The locales of a document read with `locale: 'all'` */
  localeCodes?: string[]
}): Data => {
  const content: Data = {}

  const getBlock = (field: ContentField, slug: unknown): ContentBlock | undefined => {
    const block =
      field.blocks?.find((block) => block.slug === slug) ??
      field.blockReferences?.find((block) =>
        typeof block === 'string' ? block === slug : block.slug === slug,
      )

    return typeof block === 'string' ? blocks?.[block] : block
  }

  const addValue = (path: string, value: unknown) => {
    if (!isEmptyValue(value)) {
      content[path] = value
    }
  }

  const addFields = (fields: ContentField[], data: Data, path: string, isLocalized: boolean) => {
    for (const field of fields) {
      if (field.type === 'tabs') {
        for (const tab of field.tabs ?? []) {
          if (tab.name) {
            addField({ name: tab.name, type: 'group', fields: tab.fields }, data, path, isLocalized)
          } else {
            addFields(tab.fields, data, path, isLocalized)
          }
        }
      } else if (!field.name) {
        // Rows, collapsibles and unnamed groups store their fields in the parent
        addFields(field.fields ?? [], data, path, isLocalized)
      } else if (!path && ignoredPaths.includes(field.name)) {
        continue
      } else {
        addField(field, data, path, isLocalized)
      }
    }
  }

  const addField = (field: ContentField, data: Data, parentPath: string, isLocalized: boolean) => {
    if (field.type === 'ui' || field.type === 'join') {
      return
    }

    const path = parentPath ? `${parentPath}.${field.name}` : field.name
    const value = data?.[field.name]

    if (field.localized && !isLocalized && localeCodes && isLocaleValue(value, localeCodes)) {
      for (const [locale, localeValue] of Object.entries(value)) {
        addFieldValue(field, localeValue, `${path}.${locale}`, true)
      }
    } else {
      addFieldValue(field, value, path, isLocalized || Boolean(field.localized))
    }
  }

  const addFieldValue = (
    field: ContentField,
    value: unknown,
    path: string,
    isLocalized: boolean,
  ) => {
    if (field.type === 'group' && value && typeof value === 'object') {
      addFields(field.fields ?? [], value as Data, path, isLocalized)
    } else if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
      value.forEach((row: Data, index) => {
        const rowPath = `${path}.${index}`
        const rowFields =
          field.type === 'array' ? field.fields : getBlock(field, row?.blockType)?.fields

        if (!rowFields) {
          addValue(rowPath, row)
          return
        }

        addValue(`${rowPath}.id`, row?.id)
        addValue(`${rowPath}.blockType`, row?.blockType)
        addFields(rowFields, row, rowPath, isLocalized)
      })
    } else {
      addValue(path, value)
    }
  }

  addFields(fields ?? [], data, '', false)

  return content
}

/**
 * Whether two versions of a document have the same content, ignoring values that are visually empty.
 */
export const isSameDocumentContent = ({
  a,
  b,
  ...args
}: {
  a: Data
  b: Data
} & Omit<Parameters<typeof getDocumentContent>[0], 'data'>): boolean =>
  isSameContent(getDocumentContent({ data: a, ...args }), getDocumentContent({ data: b, ...args }))

/**
 * Whether a document read with `locale: 'all'` or a single locale is published in all of its locales.
 */
export const isPublishedStatus = (status: unknown): boolean =>
  status === 'published' ||
  (Boolean(status) &&
    typeof status === 'object' &&
    Object.values(status).every((localeStatus) => localeStatus === 'published'))

/**
 * Compares content returned by `getDocumentContent` or `getFormContent`.
 */
export const isSameContent = (a: Data, b: Data): boolean => {
  // `dequal` considers any two File objects equal, so a newly selected file must be compared by reference
  if (
    typeof File !== 'undefined' &&
    (a.file instanceof File || b.file instanceof File) &&
    a.file !== b.file
  ) {
    return false
  }

  return dequal(a, b)
}

const isLocaleValue = (value: unknown, localeCodes: string[]): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => localeCodes.includes(key))

/**
 * A rich text editor with no content, which is equivalent to an empty value.
 */
const isEmptyRichText = (value: Record<string, unknown>): boolean => {
  const root = value.root as { children?: unknown; type?: unknown } | undefined

  if (!root || typeof root !== 'object' || root.type !== 'root' || !Array.isArray(root.children)) {
    return false
  }

  const [paragraph, ...rest] = root.children as { children?: unknown[]; type?: unknown }[]

  return (
    !paragraph ||
    (rest.length === 0 && paragraph.type === 'paragraph' && !paragraph.children?.length)
  )
}
