import type { FormState } from 'payload'

/** Numeric paths can move while a server prepares a row. Keep ancestor row IDs instead. */
export type RowPath = ({ rowID: string } | string)[]
export type PastePosition = 'end' | 'start' | { after: string } | { replace: string }

export function captureRowPath({ path, state }: { path: string; state: FormState }): RowPath {
  const parts = path.split('.')
  return parts.map((part, index) => {
    const rows = state[parts.slice(0, index).join('.')]?.rows
    return /^\d+$/.test(part) && rows?.[Number(part)] ? { rowID: rows[Number(part)].id } : part
  })
}

export function resolveRowPath({
  path,
  state,
}: {
  path: RowPath
  state: FormState
}): string | undefined {
  const parts: string[] = []
  for (const part of path) {
    if (typeof part === 'string') {
      parts.push(part)
    } else {
      const index = state[parts.join('.')]?.rows?.findIndex((row) => row.id === part.rowID) ?? -1
      if (index < 0) {
        return undefined
      }
      parts.push(String(index))
    }
  }
  return parts.join('.')
}
