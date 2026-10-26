// Rebuilds an identity-preserving graph from stdin (see flightSize.ts) and prints its Flight size.
// Runs as a separate Node.js process with `--conditions react-server`.
import { createRequire } from 'node:module'
import path from 'node:path'
import { Writable } from 'node:stream'

type EncodedValue = { r: number } | { v: unknown }
type EncodedNode = { a: EncodedValue[] } | { o: Record<string, EncodedValue> }

const require = createRequire(import.meta.url)
const nextDir = path.dirname(require.resolve('next/package.json'))
const { renderToPipeableStream } = require(
  path.join(nextDir, 'dist/compiled/react-server-dom-webpack/server.node.js'),
)

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk: string) => (input += chunk))
process.stdin.on('end', () => {
  const { nodes, root } = JSON.parse(input) as { nodes: EncodedNode[]; root: EncodedValue }
  const built: any[] = nodes.map((node) => ('a' in node ? [] : {}))
  const decode = (encoded: EncodedValue) => ('r' in encoded ? built[encoded.r] : encoded.v)

  nodes.forEach((node, id) => {
    if ('a' in node) {
      node.a.forEach((child) => built[id].push(decode(child)))
    } else {
      for (const [key, child] of Object.entries(node.o)) {
        built[id][key] = decode(child)
      }
    }
  })

  let bytes = 0
  renderToPipeableStream(decode(root), {}).pipe(
    new Writable({
      final(callback) {
        process.stdout.write(String(bytes))
        callback()
      },
      write(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback()
      },
    }),
  )
})
