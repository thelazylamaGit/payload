import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const artifacts = resolve(process.argv[2] || 'artifacts')
const temp = mkdtempSync(join(tmpdir(), 'payload-block-clipboard-'))
const archives = readdirSync(artifacts).filter((file) => file.endsWith('.tgz'))
const overrides = {}
let version
for (const archive of archives) {
  const path = join(artifacts, archive)
  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' }),
  )
  overrides[manifest.name] = `file:${path}`
  version ??= manifest.version
  assert.equal(manifest.version, version)
}
const lexical =
  process.env.LEXICAL_TARBALL ||
  `https://github.com/thelazylamaGit/payload/releases/download/lexical-${version}-patches.6/payloadcms-richtext-lexical-${version}.tgz`
overrides['@payloadcms/richtext-lexical'] = lexical.startsWith('/') ? `file:${lexical}` : lexical
const pnpm = (args) =>
  execFileSync('pnpm', args, { cwd: temp, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
try {
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@payloadcms/ui': version,
          '@payloadcms/translations': version,
          '@payloadcms/richtext-lexical': version,
          payload: version,
          next: '15.4.11',
          react: '19.2.6',
          'react-dom': '19.2.6',
          graphql: '16.8.1',
        },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(temp, 'pnpm-workspace.yaml'),
    `overrides: ${JSON.stringify(overrides)}\nverifyDepsBeforeRun: false\n`,
  )
  // Resolve a lockfile first, then exercise a frozen install with a completely fresh store.
  pnpm([
    'install',
    '--lockfile-only',
    '--ignore-scripts',
    '--store-dir',
    join(temp, 'resolution-store'),
  ])
  rmSync(join(temp, 'node_modules'), { recursive: true, force: true })
  pnpm([
    'install',
    '--frozen-lockfile',
    '--ignore-scripts',
    '--store-dir',
    join(temp, 'cold-store'),
  ])
  const installed = (name) =>
    JSON.parse(readFileSync(join(temp, 'node_modules', name, 'package.json'), 'utf8'))
  for (const name of [
    'payload',
    '@payloadcms/ui',
    '@payloadcms/translations',
    '@payloadcms/richtext-lexical',
  ]) {
    assert.equal(installed(name).version, version)
  }
  writeFileSync(
    join(temp, 'smoke.mjs'),
    `
    import assert from 'node:assert/strict'
    import { en } from '@payloadcms/translations/languages/en'
    import { getTranslation, initI18n } from '@payloadcms/translations'
    import { createClientField } from 'payload'
    import { reduceToSerializableFields } from '@payloadcms/ui/shared'
    assert.equal(en.translations.general.copyBlock, 'Copy Block')
    assert.equal(en.translations.general.pasteBlockBelow, 'Paste Block Below')
    assert.equal(getTranslation('English', 'en'), 'English')
    assert.equal(typeof reduceToSerializableFields, 'function')
    for (const specifier of ['@payloadcms/ui', '@payloadcms/ui/rsc', '@payloadcms/ui/css',
      '@payloadcms/richtext-lexical', '@payloadcms/richtext-lexical/client']) {
      assert.ok(import.meta.resolve(specifier).includes('/dist/'), specifier)
    }
    const { insertBlockFromClipboard } = await import(new URL(
      '../../elements/ClipboardAction/insertBlockFromClipboard.js', import.meta.resolve('@payloadcms/ui'),
    ))
    const current = {
      layout: { value: 1, valid: true, rows: [{ id: 'existing', blockType: 'content' }] },
      'layout.0.id': { value: 'existing', valid: true },
      'layout.0.text': { value: 'keep unsaved destination', valid: true },
    }
    const result = insertBlockFromClipboard({
      blocksMap: {}, formState: current, path: 'layout', rowIndex: 1,
      dataFromClipboard: {
        type: 'blocks', path: 'source', rowIndex: 0,
        blocks: [{ slug: 'content', fields: [{ name: 'text', type: 'text' }] }],
        data: {
          'source.0.id': { value: 'copied', valid: true },
          'source.0.blockType': { value: 'content', valid: true },
          'source.0.text': { value: 'unsaved copy', valid: true },
        },
      },
    })
    assert.equal(result.layout.rows.length, 2)
    assert.equal(result['layout.0.id'].value, 'existing')
    assert.equal(result['layout.0.text'].value, 'keep unsaved destination')
    assert.equal(result['layout.1.text'].value, 'unsaved copy')
    assert.notEqual(result['layout.1.id'].value, 'copied')
    assert.equal(current.layout.rows.length, 1)
    const { stripClipboardMetadataFromRequest } = await import(new URL(
      '../../forms/Form/stripClipboardMetadata.js', import.meta.resolve('@payloadcms/ui'),
    ))
    const localState = { body: {
      valid: true, value: { root: { type: 'root', children: [{ type: 'text', text: 'Keep rich text', format: 1 }] } },
      clipboardBlocks: [{ slug: 'embedded', fields: [] }],
    } }
    const request = stripClipboardMetadataFromRequest({ formState: localState, documentFormState: localState })
    assert.equal('clipboardBlocks' in request.formState.body, false)
    assert.equal('clipboardBlocks' in request.documentFormState.body, false)
    assert.deepEqual(request.formState.body.value, localState.body.value)
    assert.equal('clipboardBlocks' in localState.body, true)
    const i18n = await initI18n({ config: { fallbackLanguage: 'en', supportedLanguages: { en } } })
    for (const referenceList of ['blocks', 'blockReferences']) {
      const nestedField = createClientField({ defaultIDType: 'number', importMap: {}, i18n,
        field: { name: 'nested', type: 'blocks', blocks: [], [referenceList]: ['child'] },
      })
      const schema = { slug: 'panel', fields: [
        { type: 'tabs', tabs: [{ label: 'Content', fields: [nestedField] }] },
      ] }
      const body = { root: { type: 'root', children: [{ type: 'block', fields: {
        id: 'old-panel', blockType: 'panel', nested: [
          { id: 'old-child', blockType: 'child', reference: { id: 'keep-document' } },
        ],
      } }] } }
      const pasted = insertBlockFromClipboard({
        blocksMap: { child: { slug: 'child', fields: [
          { name: 'reference', type: 'relationship', relationTo: 'pages' },
        ] } },
        formState: current, path: 'layout', rowIndex: 1,
        dataFromClipboard: { type: 'blocks', path: 'source', rowIndex: 0,
          blocks: [{ slug: 'content', fields: [{ name: 'body', type: 'richText' }] }],
          data: {
            'source.0.id': { value: 'copied', valid: true },
            'source.0.blockType': { value: 'content', valid: true },
            'source.0.body': { value: body, valid: true, clipboardBlocks: [schema] },
          },
        },
      })
      const fields = pasted['layout.1.body'].value.root.children[0].fields
      assert.notEqual(fields.id, 'old-panel')
      assert.notEqual(fields.nested[0].id, 'old-child')
      assert.equal(fields.nested[0].reference.id, 'keep-document')
      assert.deepEqual(body.root.children[0].fields.nested[0].id, 'old-child')
    }
    console.log('Cold consumer, compiled exports, insertion, request sanitization, and native nested block references passed')
  `,
  )
  execFileSync('node', ['smoke.mjs'], { cwd: temp, stdio: 'inherit' })
} finally {
  if (process.env.KEEP_SMOKE_CONSUMER) {
    console.log(`Consumer retained at ${temp}`)
  } else {
    rmSync(temp, { recursive: true, force: true })
  }
}
