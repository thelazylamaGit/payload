import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
let output = join(root, 'artifacts')
let shouldIncludeLexical = false

for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--lexical') {
    shouldIncludeLexical = true
  } else if (arg === '--out-dir' && args[index + 1] && !args[index + 1].startsWith('--')) {
    output = resolve(args[++index])
  } else if (arg === '--help' || arg === '-h') {
    process.stdout.write(
      'Usage: pnpm fork:pack [--lexical] [--out-dir <directory>]\n\nBuilds, tests, packs, and verifies UI/translations. --lexical also rebuilds and packs Lexical.\nDefaults to artifacts/ in this repository. Existing Lexical tarballs are preserved.\n',
    )
    process.exit(0)
  } else {
    throw new Error(`Unknown or incomplete option: ${arg}. Use --help for usage.`)
  }
}

const packages = ['ui', 'translations', ...(shouldIncludeLexical ? ['richtext-lexical'] : [])]
const manifests = packages.map((name) =>
  JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8')),
)
const version = JSON.parse(
  readFileSync(join(root, 'packages/payload/package.json'), 'utf8'),
).version

for (const manifest of manifests) {
  if (manifest.version !== version) {
    throw new Error(
      `Expected ${manifest.name} to match payload@${version}, got ${manifest.version}`,
    )
  }
}

const pnpm = (command) => execFileSync('pnpm', command, { cwd: root, stdio: 'inherit' })
const staging = mkdtempSync(join(tmpdir(), 'payload-local-pack-'))

try {
  pnpm([
    'turbo',
    'build',
    '--filter',
    '@payloadcms/ui',
    ...(shouldIncludeLexical ? ['--filter', '@payloadcms/richtext-lexical'] : []),
  ])
  pnpm([
    'exec',
    'vitest',
    'run',
    '--project',
    'unit',
    'packages/ui/src/elements/ClipboardAction',
    'packages/ui/src/forms/Form',
    'packages/ui/src/elements/LeaveWithoutSaving',
    'test/form-state/contentChanges.unit.spec.ts',
    'test/clipboard',
    ...(shouldIncludeLexical
      ? [
          'packages/richtext-lexical/src/features/blocks/client/component/BlockContent.spec.ts',
          'packages/richtext-lexical/src/features/blocks/client/component/useBlockCollapsedState.spec.ts',
          'packages/richtext-lexical/src/lexical/plugins/NodeViewOverridePlugin/index.spec.ts',
          'packages/richtext-lexical/src/lexical/plugins/DecoratorPlugin/index.spec.ts',
          'packages/richtext-lexical/src/features/blocks/client/index.spec.ts',
          'packages/richtext-lexical/src/features/toolbars/shared/ToolbarDropdown/DropDown.spec.ts',
          'packages/richtext-lexical/src/features/toolbars/shared/ToolbarDropdown/interaction.spec.ts',
        ]
      : []),
  ])

  for (const name of packages) {
    pnpm(['-C', join(root, 'packages', name), 'pack', '--pack-destination', staging])
  }
  execFileSync(
    'python3',
    [
      join(root, 'scripts/fork-release/verify-block-clipboard-artifacts.py'),
      staging,
      ...(shouldIncludeLexical ? ['--include-lexical'] : []),
    ],
    { cwd: root, stdio: 'inherit' },
  )

  mkdirSync(output, { recursive: true })
  for (const name of readdirSync(staging).filter((name) => name.endsWith('.tgz'))) {
    copyFileSync(join(staging, name), join(output, name))
    process.stdout.write(`Packed ${join(output, name)}\n`)
  }
  const archives = readdirSync(output)
    .filter((name) => name.endsWith('.tgz'))
    .sort()
  writeFileSync(
    join(output, 'SHA256SUMS'),
    archives
      .map(
        (name) =>
          `${createHash('sha256')
            .update(readFileSync(join(output, name)))
            .digest('hex')}  ${basename(name)}\n`,
      )
      .join(''),
  )
  process.stdout.write(`Checksums: ${join(output, 'SHA256SUMS')}\nNo GitHub release was created.\n`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
