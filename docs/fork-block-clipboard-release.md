# Native block clipboard fork release

This fork's UI, translations, core Payload, and Lexical manifests are **3.91.0**. The feature changes only `@payloadcms/ui` and `@payloadcms/translations`. Core Payload and Lexical are built as needed, but neither needs a replacement artifact. The existing Lexical patches and their release workflow are untouched.

## Behavior

Ordinary Blocks row menus offer **Copy Block** and **Paste Block Below**. Paste inserts immediately after that row. The field dropdown also offers **Paste Block**, which appends and works on an empty field. Existing destination values, row order, and IDs survive insertion. The copy reads current form state, including unsaved settings and rich-text JSON. Insertions refresh structural block/array IDs, including inside Lexical block nodes, while preserving relationship/upload/document IDs.

The original localStorage clipboard is reused. New copies include the selected block's schema; insertion also accepts older row copies containing the source field's entire schema list and validates only the selected block. The destination's resolved blocks, current dynamic filter, row limit, disabled state, and read-only state govern insertion. A whole-field copy produces guidance to use **Paste Field**. Array row actions and Copy Field / Paste Field retain their existing semantics. Existing whole-field ID handling is deliberately unchanged.

The form builder attaches client-safe embedded block schemas already present in Payload's schema map to rich-text field state. This supports structural IDs in collapsed editors without modifying Lexical or inspecting the DOM. This metadata is separate from field values and is not saved as document content. Old clipboard data lacks these schemas; embedded block IDs can still be refreshed, but refreshing arrays inside embedded inline schemas requires copying the block again after updating UI.

English labels/messages live in the translations package and are registered as client keys. Other locales currently use the same English strings for these new keys. No translation service or API key is required.

## Clipboard metadata and Server Action request size

The first release attached full embedded block schemas to rich-text form state. Native form updates and nested Lexical form requests inadvertently sent that client-only metadata back to the server. Repeated schemas could push otherwise small requests above Next.js's default 1 MB Server Action body limit, causing HTTP 413 errors and disrupting Admin rendering/live preview.

The fix keeps compact structural schemas locally for clipboard ID regeneration and strips field-level `clipboardBlocks` metadata from outgoing form state, including parent-document state used by the existing Lexical fork. All document values, initial values, rich-text JSON, settings, row IDs, and external references are preserved. The server already resolves schemas from its configuration. Whole-field and selected-block compatibility checks still use their original schemas; compaction applies only to the additional metadata used for structural IDs.

A synthetic regression fixture measured 1,333,465 bytes of JSON before stripping and 2,725 bytes afterward, with unchanged field values. These are fixture measurements, not measurements of TheHealthLodge's HTTP requests. Actual document content and request encoding still count toward Next.js's body limit. This change does not impose a smaller copy limit or increase the application's Next.js body limit.

This requires a new UI artifact to reach consumers; the existing Lexical override can stay unchanged. Use a fresh release revision (for example `block-clipboard-3.91.0-patches.2` if unused) and update the two block-clipboard overrides/lockfile after publication. Do not overwrite the first release or its tag.

## Triggering a release (after review)

The separate `.github/workflows/release-block-clipboard-fork.yml` workflow accepts tags of the form:

```text
block-clipboard-3.91.0-patches.<positive integer>
```

After merging the reviewed changes, either push a new tag pointing at that commit or select **Release native block clipboard fork** in GitHub Actions, choose the intended branch/commit, and supply a new tag. For example, the first revision would be `block-clipboard-3.91.0-patches.1`. That example tag has **not** been published by this work.

The workflow checks package alignment and tag ownership, installs the frozen monorepo lockfile, builds UI and its dependencies through Turbo, runs focused clipboard regression tests and lint, and packs only:

- `payloadcms-ui-3.91.0.tgz`
- `payloadcms-translations-3.91.0.tgz`
- `SHA256SUMS`

The normal package build includes declarations, compiled JavaScript, CSS, SCSS, fonts, and other assets. The verifier inspects the actual tarballs, checks concrete and wildcard export targets and required UI assets, and rejects unresolved `workspace:`, `catalog:`, or `link:` dependencies. pnpm pack applies the existing publishConfig exports and converts workspace/catalog dependency versions.

A temporary external consumer resolves a lockfile, installs it with `--frozen-lockfile` using a separate empty store, imports compiled translations/UI shared exports, resolves UI/RSC/CSS/Lexical exports, executes compiled block insertion against the published core Payload package, and checks aligned installed versions with the existing hosted Lexical override. Package install scripts are disabled for this artifact-resolution smoke test; the consuming application's normal build remains a separate check.

Build/test jobs have read-only repository permissions. Only the final publishing job has `contents: write`. Existing releases are rejected; `gh release create` also fails if another run has already created the release. There is no asset replacement path. The older `release-lexical-fork.yml` remains available for existing Lexical-only releases.

## TheHealthLodge overrides

The two new URLs below are **unpublished placeholders**, not verified download URLs. After publication, replace the tag with the actual successful release tag and confirm both assets exist. Keep the existing Lexical override exactly as it is:

```yaml
# TheHealthLodge root pnpm-workspace.yaml
# New block-clipboard URLs below are placeholders until publication.
overrides:
  '@payloadcms/ui': 'https://github.com/thelazylamaGit/payload/releases/download/block-clipboard-3.91.0-patches.1/payloadcms-ui-3.91.0.tgz'
  '@payloadcms/translations': 'https://github.com/thelazylamaGit/payload/releases/download/block-clipboard-3.91.0-patches.1/payloadcms-translations-3.91.0.tgz'
  '@payloadcms/richtext-lexical': 'https://github.com/thelazylamaGit/payload/releases/download/lexical-3.91.0-patches.6/payloadcms-richtext-lexical-3.91.0.tgz'
```

Merge these into the project's existing overrides; preserve its other entries. Keep Payload packages aligned at 3.91.0, including `payload`, adapters, Next integration, UI, translations, and rich-text packages. Do not upgrade just one package to a different Payload release. Also check the consuming Next/React versions against the packed peer dependencies; the cold consumer here uses Next 15.4.11 and React/ReactDOM 19.2.6, which satisfy this fork's declared peers. This repository's Next 16 peer range starts at 16.3.3; an older Next 16 consumer needs its own compatibility check.

After release publication, update the consumer locally using its pinned pnpm version:

```sh
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile
pnpm why @payloadcms/ui @payloadcms/translations @payloadcms/richtext-lexical payload
```

Review and commit **both** `pnpm-workspace.yaml` and `pnpm-lock.yaml`. The lockfile must record the new immutable tarball URLs/integrities. Do not manually rewrite it, reuse a lockfile for another tag, or switch CI to a non-frozen installation. Once the lockfile is committed, the existing GitHub Actions `pnpm install --frozen-lockfile` is sufficient; no local links, local package builds, extra package download step, or warmed pnpm cache are needed. Keep the consumer's existing normal build-script policy and Node/pnpm setup.

## Public download access

An unauthenticated GitHub API request returned `private: false` / `visibility: public` for this fork. An unauthenticated GET of the existing `lexical-3.91.0-patches.6` tarball returned HTTP 200 and a valid `@payloadcms/richtext-lexical@3.91.0` archive. These existing artifacts require no GitHub token. No new block-clipboard release or asset was published or downloaded, so anonymous access to the **new** URLs still needs checking after publication.

If repository visibility changes to private, these direct URLs must not be assumed to work: pnpm does not automatically use `GH_TOKEN` to download private release assets. A private distribution needs a separately tested authenticated asset-download or package-registry strategy and a regenerated lockfile. This public-release workflow/consumer example does not provision a private distribution path.

After publication, check the actual assets without credentials (and verify checksums):

```sh
# Set TAG to the actual published tag, not an unpublished placeholder.
curl -q --fail --location -O "https://github.com/thelazylamaGit/payload/releases/download/$TAG/SHA256SUMS"
curl -q --fail --location -O "https://github.com/thelazylamaGit/payload/releases/download/$TAG/payloadcms-ui-3.91.0.tgz"
curl -q --fail --location -O "https://github.com/thelazylamaGit/payload/releases/download/$TAG/payloadcms-translations-3.91.0.tgz"
sha256sum -c SHA256SUMS
```

## Verification

Local fork checks:

```sh
pnpm build:ui
pnpm exec tsc --noEmit -p packages/ui/tsconfig.json
pnpm exec vitest run --project unit packages/ui/src/elements/ClipboardAction packages/ui/src/forms/Form/stripClipboardMetadata.spec.ts packages/ui/src/providers/ServerFunctions/clipboardMetadata.spec.ts
pnpm exec eslint packages/ui/src/elements/ClipboardAction packages/ui/src/elements/ArrayAction/index.tsx packages/ui/src/fields/Blocks/index.tsx packages/ui/src/fields/Blocks/RowActions.tsx packages/ui/src/forms/fieldSchemasToFormState/renderField.tsx packages/translations/src/clientKeys.ts packages/translations/src/languages/*.ts
mkdir -p /tmp/block-clipboard-artifacts
pnpm -C packages/ui pack --pack-destination /tmp/block-clipboard-artifacts
pnpm -C packages/translations pack --pack-destination /tmp/block-clipboard-artifacts
python3 scripts/fork-release/verify-block-clipboard-artifacts.py /tmp/block-clipboard-artifacts
node scripts/fork-release/smoke-block-clipboard-consumer.mjs /tmp/block-clipboard-artifacts
pnpm test:e2e fields__collections__Blocks --grep 'copy paste' --workers 1
```

The smoke script normally downloads the existing public Lexical release. For an already downloaded archive, set `LEXICAL_TARBALL=/absolute/path/to/payloadcms-richtext-lexical-3.91.0.tgz`. Set `KEEP_SMOKE_CONSUMER=1` to retain its temporary directory for inspection. These local tarball checks do not verify new hosted release URLs.

In TheHealthLodge after installing the published assets:

1. Run its type check, lint, tests, and production Next build.
2. Copy an unsaved Rich Text Section from Pages to Practitioners, whose allowed block list excludes Hero. Confirm styles/settings survive; verify disallowed blocks are rejected.
3. Use Paste Block on empty and populated fields and Paste Block Below on first/middle/last rows. Confirm originals remain intact and saving/reloading succeeds.
4. Check nested blocks/arrays and rich-text embedded blocks with uploads/relationships. Copied structural IDs must differ while external references remain the same.
5. Check read-only fields, maxRows, dynamic filters, whole-field guidance, and ordinary Array/Copy Field/Paste Field controls.
6. Run a clean CI build with the committed frozen lockfile and no dependency cache. Confirm the new hosted assets download anonymously.

This task does not edit TheHealthLodge, push commits/tags, or publish releases.

## Results in this workspace

- `pnpm build:ui`: passed, including dependency builds, declarations, React compilation, bundles, and styles.
- UI `tsc --noEmit`: passed.
- Focused clipboard regression suite: **62 passed** across seven test files, including the pre-existing clipboard tests.
- Production-source lint: passed with no errors; five pre-existing warnings remain in Form and ServerFunctions. Unit test files are excluded by the repository ESLint/TypeScript configuration and were executed with Vitest. Formatting and `git diff --check`: passed.
- Both final tarballs: verified contents, concrete/wildcard exports, UI assets, package alignment, and external dependency specifiers. Local `SHA256SUMS` generated.
- Cold temporary consumer: passed frozen-lockfile installation with a new empty store, compiled exports, and execution of compiled block insertion against public `payload@3.91.0`, alongside the existing downloaded Lexical release. No replacement core package was used.
- Focused Blocks browser suite: attempted, but the test app could not connect to MongoDB at `127.0.0.1:27018`. Browser behavior is not claimed as verified. The existing Blocks e2e file has 49 sort-order lint errors and two warnings both before and after the edits; no additional lint findings were introduced there.
- GitHub Actions publication and new hosted tarball downloads: not run. They require publishing an approved release. Existing public Lexical download access was verified separately.
