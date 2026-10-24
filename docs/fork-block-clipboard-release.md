# Native block clipboard fork

The UI and translations packages remain aligned with Payload **3.91.0**. The existing Lexical package is unchanged.

## Behavior

- A copied block row is checked against its destination definition. Unrelated block types allowed by either collection do not affect that check. Matching slugs with incompatible field structures are rejected.
- **Paste Row** replaces an existing compatible row and keeps that row's identity. It also retains native selection of the corresponding row from a compatible whole-field copy.
- **Paste Block Below** inserts after the selected row. The field menu's **Paste Block** appends, including into an empty field.
- Array controls and whole-field clipboard actions keep their native behavior. Native localStorage clipboard data is reused; older row copies containing unrelated source definitions are supported.
- Read-only/disabled state, destination block filters, and maximum row counts restrict new actions. Replacement still works at the row limit.

## Repair and lifecycle

Commit `4d4cd64f0d` contained the isolated compatibility fix: selected-block validation, a selected-schema copy filter, and regression tests. The later eager schema metadata was separate from that fix.

The repair removes `clipboardBlocks`, its render-time schema scan/reference expansion, request stripping, and the old custom insertion implementation. The generic field renderer, Form request handling, and serializable-fields helper are restored exactly to the pre-clipboard fork baseline (`05097df2f1`). Compaction remains deleted. Copies from older fork versions can still contain that metadata; a small clipboard-read cleanup discards it on the explicit paste action, including native Paste Field. User document values remain untouched. No content schemas, database configuration, generic caches, or Next.js body-size settings change.

Native `addFieldRow` immediately dispatches an empty, loading row. It returns before a later debounced form-state request initializes the fields. Consequently, calling Add Row and then Paste cannot safely wait on its return value. A regression test demonstrates this limitation.

The replacement prepares data off-form using the existing authenticated `form-state` server operation, only when paste is invoked. It uses the destination's native server schemas and existing field traversal. The native paste merge alone does not refresh IDs inside Lexical JSON; a separate regression test demonstrates that limitation. On-demand preparation refreshes structural IDs there without distributing schemas to browsers, following only Lexical nodes and schema-defined arrays/blocks. Uploads, relationships, JSON values, and user-authored fields named `id` are preserved.

A single `PASTE_ROW` reducer transition composes native `ADD_ROW` with native clipboard merging. Every copied value is present before the transition is published to React, autosave, and live preview. Native field rendering then finishes through the normal onChange request at the committed path; the row keeps its native loading state until then. Server components are not prepared at a speculative numeric path.

The pending operation stores ancestor and anchor row IDs, rather than numeric positions. Reordering follows those identities; removing an anchor or ancestor cancels the insertion. Restrictions and row limits are checked again against current state. One pending paste per field prevents repeated clicks from creating duplicate operations. Failed preparation has no row to roll back. Navigating away aborts the pending operation.

## Local build

From this fork:

```sh
pnpm fork:pack
```

This builds UI/dependencies, runs clipboard and isolated SQLite save/reload tests, packs UI/translations, verifies the actual exports/assets, and writes these files into `artifacts/`:

- `payloadcms-ui-3.91.0.tgz`
- `payloadcms-translations-3.91.0.tgz`
- `SHA256SUMS`

Existing Lexical tarballs are preserved. No application installation, tag, push, or release is performed.

```sh
pnpm fork:pack --out-dir /tmp/payload-packs
pnpm fork:pack --lexical  # Optional; unnecessary for this repair
```

Copy the rebuilt UI/translations tarballs to the paths used by your application's existing `file:` references when ready. Stop its dev server, refresh the local-tarball installation, and restart:

```sh
pnpm install --force --no-frozen-lockfile
```

Review the lockfile's updated local-tarball integrities and commit it with the vendor files. CI can then keep using a frozen lockfile.

## Verification

```sh
pnpm exec vitest run --project unit packages/ui/src/elements/ClipboardAction test/clipboard
pnpm exec tsc --noEmit -p packages/ui/tsconfig.json
pnpm fork:pack
LEXICAL_TARBALL=/absolute/path/to/existing-lexical.tgz node scripts/fork-release/smoke-block-clipboard-consumer.mjs artifacts
```

The SQLite fixture creates its own temporary database and records and deletes them afterward. It exercises actual native copy/compatibility checking, off-form preparation, atomic insertion, subsequent native component initialization, database save, and reload. Assertions include nested arrays/blocks and Lexical blocks, relationship IDs, authored IDs, unsaved values, unchanged source content, and unchanged destination rows.

Local validation: **73 tests passed across nine files**, UI TypeScript passed, and production-source lint passed with four pre-existing warnings and no errors.

Other tests cover malformed/legacy data, incompatible nested/tab schemas, array/whole-field behavior, replacement, insertion positions, repeated clicks, delayed initialization, failures, reordered/deleted ancestors/anchors, read-only/disabled fields, and restrictions changing during preparation. Compiled-package verification uses a separate temporary consumer, not the user's project.

### Performance evidence and limits

A representative regression fixture supplies 219 possible embedded schemas per editor. With the previous implementation, 20 tiny editors produced **10,123,381 bytes** of initial form-state JSON. Tests enforce less than **200 bytes per editor**, absence of clipboard schema metadata, and no iteration over the descendant schema registry during rendering. The same tests were run against the previous renderer and failed for 1, 8, and 20 editors. The compatibility regression also fails against the validator extracted from the published `@payloadcms/ui@3.91.0` tarball and passes with the repair. Its SHA-256 was `aa145f2446f45c275d7ee200d875847a4156833d37700ab190ed0dddb809e480`.

Before the user requested fork-only testing, a read-only production-mode benchmark used the consuming application's configuration/content and admin permissions. Server components were mocked, with one warmup and five measured repetitions per case. These figures compare the previous installed renderer against the restored stock renderer, not a production installation of the repaired artifacts:

| Fixture          | Previous basic form state | Stock renderer | Previous warm median | Stock warm median |
| ---------------- | ------------------------: | -------------: | -------------------: | ----------------: |
| No blocks        |                 506,650 B |        7,535 B |             16.93 ms |           0.10 ms |
| Several blocks   |               3,030,097 B |       35,407 B |            110.28 ms |           0.56 ms |
| Many blocks      |               5,047,154 B |       56,004 B |            181.82 ms |           0.75 ms |
| Nested rich text |               5,047,154 B |       56,004 B |            177.16 ms |           0.49 ms |

The largest editor contained 219 entries totaling 499,096 bytes. Ten copies added 4,990,960 bytes of schemas. Removing request metadata alone could not address that initial form-state expansion. The repaired generic renderer is byte-for-byte identical to the stock fork baseline source, and unused clipboard actions attach no metadata.

These measurements exclude server-component execution, complete RSC responses, transfer compression, browser navigation, and copy/paste latency. They do not attribute all Payload navigation cost to clipboard metadata. The repaired artifacts are tested here; their consuming-application browser behavior and end-to-end production performance are left for the user to verify, as requested. No application dependency installation or vendor replacement is part of this repair delivery.

## Optional GitHub release

The separate `release-block-clipboard-fork.yml` workflow builds, checks, and publishes UI/translations for a new tag `block-clipboard-3.91.0-patches.<revision>`. Existing releases are immutable. The older Lexical workflow remains separate. Local packaging is sufficient for current `file:` consumption; publishing is optional and requires an explicit request.
