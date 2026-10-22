import type { ClientBlock, ClientField } from 'payload'

/** ID regeneration needs structural field paths, not labels, options, defaults, or admin UI config. */
export function compactClipboardBlockSchema(block: ClientBlock): ClientBlock {
  return { slug: block.slug, fields: compactFields(block.fields) }
}

function compactFields(fields: ClientField[]): ClientField[] {
  return fields.flatMap((field): ClientField[] => {
    const identity = { type: field.type, ...('name' in field ? { name: field.name } : {}) }

    if (field.type === 'richText') {
      return [identity as ClientField]
    }
    if (field.type === 'tabs') {
      return [
        {
          type: 'tabs',
          tabs: field.tabs.map((tab) => ({
            ...('name' in tab ? { name: tab.name } : {}),
            fields: compactFields(tab.fields),
          })),
        } as ClientField,
      ]
    }
    if (field.type === 'blocks') {
      return [
        {
          ...identity,
          blocks: field.blocks.map(compactClipboardBlockSchema),
          ...(field.blockReferences
            ? {
                blockReferences: field.blockReferences.map((block) =>
                  typeof block === 'string' ? block : compactClipboardBlockSchema(block),
                ),
              }
            : {}),
        } as ClientField,
      ]
    }
    if ('fields' in field) {
      return [{ ...identity, fields: compactFields(field.fields) } as ClientField]
    }

    return []
  })
}
