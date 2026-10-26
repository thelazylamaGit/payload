/**
 * Measures the real, authenticated admin edit-route RSC response for the reproduction fixture.
 *
 * Usage (with the dev server running `pnpm dev lexical-schema-map`):
 *   pnpm tsx test/lexical-schema-map/measureRoute.ts [--base http://localhost:3000] [--out file.json]
 *
 * All byte counts are decoded UTF-8 bytes of the Flight payload unless labelled as compressed.
 * Subtree figures (form state, schema maps) overlap each other and are never summed into the total.
 */
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import zlib from 'node:zlib'

import { devUser } from '../credentials.js'
import { ordinaryPagesSlug, pagesSlug } from './shared.js'

const args = process.argv.slice(2)
const argValue = (name: string, fallback?: string) => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const base = argValue('--base', 'http://localhost:3000')!
const outFile = argValue('--out')

type FlightRow = { bytes: number; id: string; json?: unknown; tag: string }

const parseFlight = (buffer: Buffer): FlightRow[] => {
  const rows: FlightRow[] = []
  let offset = 0

  while (offset < buffer.length) {
    const colon = buffer.indexOf(0x3a, offset)
    if (colon === -1) {
      break
    }
    const id = buffer.subarray(offset, colon).toString('utf8')
    const tag = String.fromCharCode(buffer[colon + 1]!)

    if (tag === 'T') {
      const comma = buffer.indexOf(0x2c, colon)
      const length = parseInt(buffer.subarray(colon + 2, comma).toString('utf8'), 16)
      const end = comma + 1 + length
      rows.push({ id, bytes: end - offset, tag })
      offset = end
      continue
    }

    const newline = buffer.indexOf(0x0a, colon)
    const end = newline === -1 ? buffer.length : newline
    const body = buffer.subarray(colon + 1, end).toString('utf8')
    let json: unknown
    const jsonStart = /^[A-Z]{1,2}(?=[[{"])/.exec(body)?.[0].length ?? 0
    try {
      json = JSON.parse(body.slice(jsonStart))
    } catch {
      json = undefined
    }
    rows.push({ id, bytes: end + 1 - offset, json, tag: jsonStart ? body.slice(0, jsonStart) : '' })
    offset = end + 1
  }

  return rows
}

const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value))

type MapStats = {
  bytes: number
  entries: number
  inlineValueBytes: number
  keyBytes: number
  referenceValueBytes: number
  referenceValues: number
}

const collectByKey = (value: unknown, key: string, found: unknown[]) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectByKey(item, key, found)
    }
    return found
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey === key) {
        found.push(child)
      }
      collectByKey(child, key, found)
    }
  }
  return found
}

const collectParentsOfKey = (value: unknown, key: string, found: Record<string, unknown>[]) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectParentsOfKey(item, key, found)
    }
  } else if (value && typeof value === 'object') {
    if (key in value) {
      found.push(value as Record<string, unknown>)
    }
    for (const child of Object.values(value)) {
      collectParentsOfKey(child, key, found)
    }
  }
  return found
}

const isFlightReference = (value: unknown) => typeof value === 'string' && value.startsWith('$')

const analyzeFeatureMap = (map: unknown): MapStats => {
  const stats: MapStats = {
    bytes: byteLength(map),
    entries: 0,
    inlineValueBytes: 0,
    keyBytes: 0,
    referenceValueBytes: 0,
    referenceValues: 0,
  }

  if (!map || typeof map !== 'object') {
    return stats
  }

  for (const featureEntries of Object.values(map)) {
    if (!featureEntries || typeof featureEntries !== 'object') {
      continue
    }
    for (const [key, value] of Object.entries(featureEntries)) {
      stats.entries++
      stats.keyBytes += byteLength(key)
      if (isFlightReference(value)) {
        stats.referenceValues++
        stats.referenceValueBytes += byteLength(value)
      } else {
        stats.inlineValueBytes += byteLength(value)
      }
    }
  }

  return stats
}

const login = async () => {
  const res = await fetch(`${base}/api/users/login`, {
    body: JSON.stringify(devUser),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const { token } = await res.json()
  if (!token) {
    throw new Error('Login failed')
  }
  return token
}

const measureCollection = async ({ slug, token }: { slug: string; token: string }) => {
  const headers = { Authorization: `JWT ${token}` }
  const list = await (await fetch(`${base}/api/${slug}?limit=1&depth=0`, { headers })).json()
  const doc = list.docs[0]!
  const rawDocument = await (
    await fetch(`${base}/api/${slug}/${doc.id}?depth=0`, { headers })
  ).text()

  const start = performance.now()
  const res = await fetch(`${base}/admin/collections/${slug}/${doc.id}`, {
    headers: { ...headers, 'Accept-Encoding': 'identity', RSC: '1' },
  })
  const firstByte = performance.now()
  const body = Buffer.from(await res.arrayBuffer())
  const complete = performance.now()

  if (!res.ok || !res.headers.get('content-type')?.includes('text/x-component')) {
    throw new Error(`Unexpected response ${res.status} ${res.headers.get('content-type')}`)
  }

  const rows = parseFlight(body)
  const featureMaps = rows.flatMap((row) => collectByKey(row.json, 'featureClientSchemaMap', []))
  const mapStats = featureMaps.map(analyzeFeatureMap)
  const initialStates = rows.flatMap((row) => collectByKey(row.json, 'initialState', []))
  const editorProps = rows.flatMap((row) =>
    collectParentsOfKey(row.json, 'featureClientSchemaMap', []),
  )
  const schemaPaths = editorProps.map((props) => props.schemaPath as string)

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

  return {
    slug,
    compressed: {
      brotli: zlib.brotliCompressSync(body).length,
      gzip: zlib.gzipSync(body).length,
    },
    containsEditor: body.includes('lexical_internal_feature'),
    decodedBytes: body.length,
    editorCount: featureMaps.length,
    editorSchemaPaths: schemaPaths,
    featureClientSchemaMaps: {
      bytesPerEditor: mapStats.map((stats) => stats.bytes),
      entries: sum(mapStats.map((stats) => stats.entries)),
      inlineValueBytes: sum(mapStats.map((stats) => stats.inlineValueBytes)),
      keyBytes: sum(mapStats.map((stats) => stats.keyBytes)),
      referenceValueBytes: sum(mapStats.map((stats) => stats.referenceValueBytes)),
      referenceValues: sum(mapStats.map((stats) => stats.referenceValues)),
      totalBytes: sum(mapStats.map((stats) => stats.bytes)),
    },
    formStateBytes: initialStates.map(byteLength),
    rawDocumentBytes: Buffer.byteLength(rawDocument),
    rows: rows.length,
    timingMs: {
      complete: Math.round(complete - start),
      firstByte: Math.round(firstByte - start),
    },
  }
}

const token = await login()
const results = []
for (const slug of [pagesSlug, ordinaryPagesSlug]) {
  // Warm up compilation and schema caches, then measure.
  await measureCollection({ slug, token })
  results.push(await measureCollection({ slug, token }))
}

const output = JSON.stringify(results, null, 2)
if (outFile) {
  fs.writeFileSync(outFile, output)
}
console.log(output)
