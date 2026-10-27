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

for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--out-dir' && args[index + 1] && !args[index + 1].startsWith('--')) {
    output = resolve(args[++index])
  } else if (arg === '--help' || arg === '-h') {
    process.stdout.write(
      'Usage: pnpm fork:pack [--out-dir <directory>]\n\nBuilds, tests, packs, and verifies every forked package (payload, next, ui, translations,\nrichtext-lexical). Replaces all tarballs in the output directory (default: artifacts/) and\nwrites pnpm-overrides.yaml for consuming projects.\n',
    )
    process.exit(0)
  } else {
    throw new Error(`Unknown or incomplete option: ${arg}. Use --help for usage.`)
  }
}

/** Forked packages by directory under packages/ */
const packages = ['payload', 'next', 'ui', 'translations', 'richtext-lexical']
const manifests = packages.map((name) =>
  JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8')),
)
const version = manifests[0].version

for (const manifest of manifests) {
  if (manifest.version !== version) {
    throw new Error(
      `Expected ${manifest.name} to match payload@${version}, got ${manifest.version}`,
    )
  }
}

const pnpm = (command) => execFileSync('pnpm', command, { cwd: root, stdio: 'inherit' })
const git = (command) => execFileSync('git', command, { cwd: root, encoding: 'utf8' }).trim()
const commit = git(['rev-parse', '--short', 'HEAD'])
const isDirty = git(['status', '--porcelain', '--untracked-files=no']) !== ''
const staging = mkdtempSync(join(tmpdir(), 'payload-local-pack-'))

try {
  pnpm(['turbo', 'build', ...manifests.flatMap((manifest) => ['--filter', manifest.name])])
  pnpm([
    'exec',
    'vitest',
    'run',
    '--project',
    'unit',
    'packages/next/src/views/List',
    'packages/ui/src/elements/ClipboardAction',
    'packages/ui/src/forms/Form',
    'packages/ui/src/elements/LeaveWithoutSaving',
    'test/form-state/contentChanges.unit.spec.ts',
    'test/clipboard',
    'packages/richtext-lexical/src/features/blocks/client/component/BlockContent.spec.ts',
    'packages/richtext-lexical/src/features/blocks/client/component/useBlockCollapsedState.spec.ts',
    'packages/richtext-lexical/src/lexical/plugins/NodeViewOverridePlugin/index.spec.ts',
    'packages/richtext-lexical/src/lexical/plugins/DecoratorPlugin/index.spec.ts',
    'packages/richtext-lexical/src/features/blocks/client/index.spec.ts',
    'packages/richtext-lexical/src/features/toolbars/shared/ToolbarDropdown/DropDown.spec.ts',
    'packages/richtext-lexical/src/features/toolbars/shared/ToolbarDropdown/interaction.spec.ts',
  ])

  for (const name of packages) {
    pnpm(['-C', join(root, 'packages', name), 'pack', '--pack-destination', staging])
  }
  execFileSync(
    'python3',
    [
      join(root, 'scripts/fork-release/verify-block-clipboard-artifacts.py'),
      staging,
      '--include-lexical',
      '--include-core',
    ],
    { cwd: root, stdio: 'inherit' },
  )

  // Replace every previous tarball so stale versions can't be installed by mistake
  mkdirSync(output, { recursive: true })
  for (const name of readdirSync(output).filter((name) => name.endsWith('.tgz'))) {
    rmSync(join(output, name))
  }
  const archives = readdirSync(staging)
    .filter((name) => name.endsWith('.tgz'))
    .sort()
  for (const name of archives) {
    copyFileSync(join(staging, name), join(output, name))
    process.stdout.write(`Packed ${join(output, name)}\n`)
  }
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

  const overrides = manifests
    .map((manifest) => {
      const archive = `${manifest.name.replace('@', '').replace('/', '-')}-${version}.tgz`
      return `  '${manifest.name}': file:${join(output, archive)}`
    })
    .join('\n')
  writeFileSync(
    join(output, 'pnpm-overrides.yaml'),
    `# Payload fork ${version} built from ${commit}${isDirty ? ' (with uncommitted changes)' : ''}\n# Paste into the consuming project's pnpm-workspace.yaml, then run pnpm install.\noverrides:\n${overrides}\n`,
  )
  process.stdout.write(
    `\nChecksums: ${join(output, 'SHA256SUMS')}\nOverrides: ${join(output, 'pnpm-overrides.yaml')}\nBuilt payload@${version} from ${commit}${isDirty ? ' (with uncommitted changes)' : ''}. No GitHub release was created.\n`,
  )
} finally {
  rmSync(staging, { recursive: true, force: true })
}
