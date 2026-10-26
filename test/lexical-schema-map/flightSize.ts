import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

type EncodedNode = { a: unknown[] } | { o: Record<string, unknown> }

/**
 * Encodes an object graph into JSON while preserving object identity, so that a separate
 * `react-server` process can rebuild the exact same graph and serialize it with React Flight.
 * Leaves are wrapped as `{ v }`, objects/arrays as `{ r: id }`.
 */
const encodeGraph = (root: unknown) => {
  const ids = new Map<object, number>()
  const nodes: EncodedNode[] = []

  const encode = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') {
      return { v: typeof value === 'function' || typeof value === 'symbol' ? null : value }
    }
    const existing = ids.get(value)
    if (existing !== undefined) {
      return { r: existing }
    }
    const id = nodes.length
    ids.set(value, id)
    const node = {} as EncodedNode
    nodes.push(node)
    if (Array.isArray(value)) {
      ;(node as { a: unknown[] }).a = value.map(encode)
    } else {
      const encodedObject: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) {
        if (child !== undefined) {
          encodedObject[key] = encode(child)
        }
      }
      ;(node as { o: Record<string, unknown> }).o = encodedObject
    }
    return { r: id }
  }

  return JSON.stringify({ nodes, root: encode(root) })
}

/**
 * Returns the number of bytes React Flight (production build, as bundled by Next.js) emits for
 * the given value, including its object-identity deduplication.
 */
export const getFlightBytes = (value: unknown): number => {
  const output = execFileSync(
    process.execPath,
    ['--conditions', 'react-server', path.join(dirname, 'flightSize.child.ts')],
    {
      env: { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '' },
      input: encodeGraph(value),
      maxBuffer: 1024 * 1024 * 1024,
    },
  )
  return Number(output.toString().trim())
}
