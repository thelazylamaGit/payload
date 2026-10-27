# Content-aware save/publish audit

The editor now tracks **unsaved content against the last successful save** and **unpublished content against the published document** separately. Publish availability no longer uses unpublished-version counts as evidence of a content difference.

## Verified behaviour

| Current editor state                                                 | Save Draft                                   | Publish                                      |
| -------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Published content, unchanged                                         | Disabled                                     | Disabled                                     |
| Edited published content                                             | Enabled                                      | Enabled                                      |
| Edit completely undone                                               | Disabled                                     | Disabled                                     |
| Different content successfully saved as a draft                      | Disabled                                     | Enabled                                      |
| Further edits undone back to that saved draft                        | Disabled                                     | Depends on published comparison              |
| Saved draft reverted to published content in the editor              | Enabled                                      | Disabled                                     |
| Saved draft identical to published content, even with newer versions | Disabled                                     | Disabled                                     |
| Never-published saved draft                                          | Disabled                                     | Enabled                                      |
| Successful publication, no edits during the request                  | Disabled                                     | Disabled                                     |
| Failed save or publication                                           | Baselines unchanged; retry remains available | Baselines unchanged; retry remains available |

Initial document creation remains possible. Active-locale and all-locale actions compare their respective publication scopes. Custom data overrides retain their existing submission semantics.

## Audit fixes

- Added the missing published baseline, including globals, locale scopes, filtered available locales, and never-published documents.
- Fixed autosave treating its own modified-state reset as another edit and creating redundant drafts after publication. Queued autosaves check current content, and edits waiting on a manual save are reconsidered after it finishes.
- Fixed the first comparison running against the temporarily empty context during initialisation.
- Publish callbacks now require an HTTP-success response before changing publication metadata.
- Added a document submission lock to prevent duplicate requests before React updates disabled/loading controls.
- Native submission of an existing draft retains draft-save semantics instead of accidentally unpublishing it.
- Late baseline/save responses cannot overwrite a different document or locale's state.
- Save-response merging preserves edits and array operations made during requests while accepting server normalisation for unchanged fields. Server-deleted array descendants are removed when there were no concurrent local edits.
- Accepted uploads stay clean after publication-baseline refresh; replacement uploads remain meaningful. Successfully saved password action fields are cleared.
- Unpublish uses the returned server document when resetting the saved baseline.

## Comparison and baseline lifecycle

The existing `modified` flag and `useFormModified()` remain available for their original consumers. Separate form contexts supply debounced unsaved/publication state to the built-in buttons. Comparisons use `reduceFieldsToValues` and `dequal/lite`; snapshots use Payload's existing deep-copy helper. Validation, touched state, collapse state, and other form metadata are excluded. Root publication status and server-managed timestamps are excluded from content comparison; nested user data and custom timestamp fields when timestamps are disabled remain meaningful. File objects are tracked by identity rather than compared as empty objects.

The existing 250 ms debounce performs content comparisons after editing settles. Submission and leave-protection decisions compare the latest field values, so a click, shortcut, or navigation cannot rely on stale debounced state. Baselines are cached and are not reconstructed on each render.

Initial state and authoritative resets establish the saved baseline. Successful responses establish it from server-normalised form state; failures do not advance it. Paste through `replaceState()` preserves it. Successful publication updates the published baseline and refreshes publication information. Reset, document/locale changes, and version restoration through reload/reset establish the appropriate fresh baseline. In-flight edits remain unsaved.

## Additional requests and performance

There is one additional request through the existing `form-state` server function per document/locale initialisation. It reads the active published document and, where localisation is enabled, checks the other available locales' saved/published translations. Reads use the current user's access with `overrideAccess: false`, depth zero, and no fallback locale. Existing field processing normalises relationships, rich text, arrays, blocks, and localised values; no new generic JSON normaliser or dependency was introduced.

Only the active published snapshot and a cached other-locales boolean are returned to the browser. Other-locale translation comparisons match shared array rows by persisted ID, ignore shared row ordering/addition/deletion, and retain order for localised arrays. Shared structure is covered by the active editor's comparison.

Publication information is refreshed after publication and authoritative reset. Failed baseline reads can be retried on a publish attempt; a publish is not sent without a valid comparison. There are no requests per keystroke or content comparison. Normal draft saves/autosaves use the in-memory published baseline.

Comparisons are linear in document size. The large-document smoke test covers 1,000 nested blocks/rich-text fields. Extra locale reads/normalisation occur during baseline loading, not while typing. No hashing or persistent incremental dirty-field tracker was added.

## Validation

- **302 tests passed across 31 files**: all UI unit suites, clipboard regressions, and the isolated SQLite publication suite.
- **Four Chromium browser scenarios passed** against a separate Next.js app and temporary SQLite database: manual edit/undo/draft save/reload/publication; autosave followed by publication without redundant versions; real Lexical undo and nested-array undo with failed-publish retry; initial publication of a saved draft.
- The SQLite checks exercise actual persisted rich text, nested arrays/blocks/groups, populated relationships, matching/different drafts, globals, locale filtering, shared-row reordering, read access, version restoration as draft/published, and no writes or versions during baseline reads.
- TypeScript check for `packages/ui`: passed. Targeted production ESLint: zero errors, existing warnings only. Prettier and `git diff --check`: passed.
- The fork packaging command now runs the new form, leave-protection, and SQLite publication suites in addition to its existing checks.

## Scope and limits

All runtime changes are in **`@payloadcms/ui`**, including its existing form-state server function. No database schemas, version structures, publishing APIs, REST/GraphQL behaviour, or document hooks were changed. The fork workflow also repacks the unchanged translations package.

The “Changed” status in `elements/Status` still describes version history using version counts. It can show “Changed” for an identical saved draft even though Publish correctly stays disabled. Scheduling behaviour is preserved.

The browser smoke used Chromium; other browsers and MongoDB/Postgres were not exercised in this audit. Server hooks intentionally changing content are reflected in authoritative save results. External changes from another editor require the existing stale-document/reload workflow; this is not a real-time subscription. Custom document forms must return authoritative form state from `onSuccess` to establish a new saved baseline.

## Files touched by the audit

Approximate added/deleted lines below are relative to the current repository HEAD (including the earlier autosave fix still in the working tree). The pre-existing `test/_community/payload-types.ts` change is unrelated and was left untouched.

| File                                                       |                Added | Deleted |
| ---------------------------------------------------------- | -------------------: | ------: |
| `packages/ui/src/elements/Autosave/index.tsx`              |                   12 |       3 |
| `packages/ui/src/elements/PublishButton/index.tsx`         |                   16 |       8 |
| `packages/ui/src/elements/UnpublishButton/index.tsx`       |                    9 |       4 |
| `packages/ui/src/forms/Form/contentChanges.spec.ts`        |                  789 |      11 |
| `packages/ui/src/forms/Form/context.ts`                    |                    9 |       0 |
| `packages/ui/src/forms/Form/fieldReducer.ts`               |                    2 |       1 |
| `packages/ui/src/forms/Form/formContent.spec.ts`           |                   55 |       1 |
| `packages/ui/src/forms/Form/formContent.ts`                |                   32 |       5 |
| `packages/ui/src/forms/Form/index.tsx`                     |                  305 |      46 |
| `packages/ui/src/forms/Form/initContextState.ts`           |                    1 |       0 |
| `packages/ui/src/forms/Form/mergeServerFormState.ts`       |                   68 |       1 |
| `packages/ui/src/forms/Form/types.ts`                      |                    2 |       0 |
| `packages/ui/src/forms/fieldSchemasToFormState/index.tsx`  |                    4 |       0 |
| `packages/ui/src/providers/ServerFunctions/index.tsx`      |                    5 |       3 |
| `packages/ui/src/utilities/buildFormState.ts`              |                   12 |       1 |
| `scripts/fork-release/build-local.mjs`                     |                    3 |       0 |
| `vitest.config.ts`                                         |                    1 |       0 |
| `packages/ui/src/forms/Form/mergeServerFormState.spec.ts`  |                  110 |       0 |
| `packages/ui/src/utilities/getDocumentPublicationState.ts` |                  152 |       0 |
| `test/form-state/contentChanges.unit.spec.ts`              |                  413 |       0 |
| `CONTENT_CHANGE_DETECTION.md`                              | Updated audit report |       — |
