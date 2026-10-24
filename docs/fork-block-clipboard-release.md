# Native block clipboard fork

UI and translations remain aligned with Payload **3.91.0**. Lexical is unchanged.

## Scope

A single copied block is validated against the destination definition, rather than checking the source field's entire list of allowed block types. For example, an Accordion can move from a field allowing Accordion/Image/Quote to one allowing Accordion/Video. An unsupported Image or a structurally incompatible Accordion is rejected by the native schema comparison.

The native localStorage clipboard, Copy Field/Paste Field, Array actions, Paste Row replacement, ID handling, form requests, and save validation are retained. The native structural comparison is unchanged apart from selecting the copied row's block schema. New row copies store only that selected schema; older row copies containing unrelated definitions remain supported.

## Paste New / Below

The Blocks row menu keeps **Paste Row** and adds **Paste Block Below**. The field menu's **Paste Block** appends, including into an empty field.

These actions are synchronous and local. A small reducer case composes native `ADD_ROW` and `mergeFormStateFromClipboard` in one transition. This avoids exposing an intermediate empty row to onChange or autosave. Paste Below uses the anchor row's ID to locate its position in current state. Native field rendering subsequently initializes through the usual debounced onChange request, as with Add Row. All copied field values are already present before that request. New rows discard source rendering-location markers so native onChange initializes editors even when the source and destination numeric paths match; content and IDs are unaffected.

No additional clipboard server request is made. There is no custom rich-text ID traversal, schema lookup on paste, schema compaction, render-time schema attachment, generic request stripping, pending-operation controller, or clipboard cache. Existing ID behavior is deliberately the same as Payload's native clipboard; extending that behavior is outside this compatibility fix.

Read-only/disabled state, current destination block filters, and row limits guard insertion. Native Paste Row replacement remains available at the row limit. Failed native clipboard validation leaves the destination unchanged. Copies from earlier fork versions can contain obsolete `clipboardBlocks` metadata; the clipboard reader discards that property when pasting, preserving document values, including user-authored values with the same name.

## Evidence and local tests

The compatibility regression fails against the published `@payloadcms/ui@3.91.0` validator and passes with this fix. The published UI tarball's SHA-256 was `aa145f2446f45c275d7ee200d875847a4156833d37700ab190ed0dddb809e480`.

The generic Form, serializable-fields helper, field renderer, server-functions provider, form-state server implementation, and clipboard merge/ID implementation match the pre-clipboard fork baseline (`05097df2f1`). Unrelated fork changes are preserved.

**62 local tests pass across eight files**, covering selected-row compatibility, incompatible/missing blocks, malformed and older clipboard data, native array/whole-field actions, native row replacement, synchronous insertion without extra server calls, repeated clicks, insertion positions, unchanged sibling content, row filters, and limits.

An isolated SQLite fixture exercises native copy, cross-collection validation, local insertion, ordinary field initialization, database save, and reload. It checks unsaved text, nested arrays/blocks, rich-text JSON, relationship IDs, unchanged source/destination content, and native ID behavior. The fixture creates and deletes its own temporary database and records.

The performance regression fixture includes 219 possible embedded schemas per editor. The former metadata implementation generated 10,123,381 bytes for 20 tiny editors. Tests now require less than 200 bytes per editor, no `clipboardBlocks` state, and no traversal of the descendant registry during rendering. Those assertions fail against the former metadata renderer.

Before the user requested fork-only testing, a read-only production-mode benchmark compared the consuming application's previous renderer against the restored baseline renderer with identical config/content/admin permissions. Server components were mocked; one warmup and five measured repetitions were used:

| Fixture          | Previous basic form state | Baseline renderer | Previous warm median | Baseline warm median |
| ---------------- | ------------------------: | ----------------: | -------------------: | -------------------: |
| No blocks        |                 506,650 B |           7,535 B |             16.93 ms |              0.10 ms |
| Several blocks   |               3,030,097 B |          35,407 B |            110.28 ms |              0.56 ms |
| Many blocks      |               5,047,154 B |          56,004 B |            181.82 ms |              0.75 ms |
| Nested rich text |               5,047,154 B |          56,004 B |            177.16 ms |              0.49 ms |

The largest editor carried 219 entries totaling 499,096 bytes; ten copies added 4,990,960 bytes. These measurements exclude RSC execution, full decoded RSC responses, compression, browser navigation, and paste latency. They do not attribute unrelated Payload overhead to clipboard changes. Browser verification in the user's project is left to the user; no dependency installation or vendor replacement is part of delivery.

## Build and consume

From this fork:

```sh
pnpm fork:pack
```

This builds UI and its dependencies, runs the focused tests and isolated SQLite fixture, packs/verifies UI/translations, and writes:

- `artifacts/payloadcms-ui-3.91.0.tgz`
- `artifacts/payloadcms-translations-3.91.0.tgz`
- `artifacts/SHA256SUMS`

Existing Lexical tarballs are preserved. No application install, push, tag, or release is performed.

```sh
pnpm fork:pack --out-dir /tmp/payload-packs
pnpm exec vitest run --project unit packages/ui/src/elements/ClipboardAction test/clipboard
pnpm exec tsc --noEmit -p packages/ui/tsconfig.json
LEXICAL_TARBALL=/absolute/path/to/existing-lexical.tgz node scripts/fork-release/smoke-block-clipboard-consumer.mjs artifacts
```

Copy UI/translations to the paths referenced by your existing `file:` overrides when ready. Stop the dev server, reinstall, and restart:

```sh
pnpm install --force --no-frozen-lockfile
```

Review and commit the vendor files and updated lockfile integrities. CI can retain its frozen lockfile install. The optional GitHub release workflow remains separate; publication requires an explicit request.
