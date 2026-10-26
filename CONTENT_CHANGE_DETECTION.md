# Content-aware change detection: saved-content comparison

This implements the independently useful unsaved-change detection described in the request's fallback. **It does not implement a separate published-content baseline.** Save Draft and ordinary Save now settle to disabled after an edit is completely undone. Publishing uses content-aware unsaved state plus the existing unpublished-version count and initial-publish exception.

## Architecture

`Form` owns one cached snapshot of saved values and a separate boolean for content changes. `useFormModified()` and the existing interaction-based flag keep their original semantics for validation, onChange processing, autosave, and other consumers. The internal `useFormContentModified()` hook supplies the new state to the existing Save Draft, Save, and Publish buttons, falling back to the existing flag outside document forms.

Snapshots and comparisons use `reduceFieldsToValues(fields, true)`, which is also used for submission. This excludes validation, collapsed panels, and other form metadata, and reconstructs nested arrays and blocks in their current order. `dequal/lite` compares the resulting values independently of object key order. Existing server form-state processing already turns populated relationships and upload references into IDs; this change compares that form representation rather than raw API documents. Rich-text JSON and meaningful row IDs remain intact. Conditional fields follow the existing submission representation rather than a new schema traversal or generic JSON normaliser.

A transient File is compared by identity, because `dequal/lite` cannot distinguish File contents. Successful saves remember the accepted File even though upload responses omit that transient field. A replacement file and rows still awaiting their fields remain submittable. An undefined file field registered by the upload control is equivalent to an absent file field.

## When comparisons run

- The existing 250 ms form-change debounce updates the content-change boolean. There is no added deep comparison during rendering.
- A field interaction optimistically enables actions immediately, so a quick edit followed by a click or shortcut is not lost while waiting for the debounce.
- `Form.submit()` compares the latest values before starting an eligible manual document submission, independent of the debounced boolean. This covers Save Draft callbacks, keyboard shortcuts, programmatic editor submission, and native form submission.
- Forms configured to wait for autocomplete do so before the synchronous no-op decision.
- Leave protection invokes the comparison when navigation or browser unload occurs, including an undo immediately before leaving.
- After a successful save, an additional comparison checks whether the editor changed while the request was pending. Those edits retain their values and remain unsaved.

These comparisons are linear in document size and allocate the reconstructed submitted-value object. The baseline is copied only on initialisation, reset, and successful saves. Submission also captures its own snapshot to distinguish later edits. No hashes, incremental dirty-field map, external state store, new dependencies, or network requests were added.

The large-document smoke test creates 1,000 blocks with nested values and rich-text JSON. Its snapshot and two comparisons took about 20 ms in the local test run. This includes test setup and assertions; it is not a browser typing benchmark or a performance guarantee. A continuous sequence of edits only compares after the existing debounce settles.

## Baseline lifecycle

- Initial state establishes the saved baseline. A replacement initial state establishes the baseline for the incoming document or locale.
- Successful save/publish responses pass through the existing edit view's `onSuccess`, which builds normalised form state from returned document data. That returned state establishes the new baseline.
- Failed responses, thrown requests, validation failures, and skipped submissions do not advance the baseline.
- `reset(data)` uses its authoritative rebuilt state as the new baseline. Existing Revert to Published uses this path after its server save succeeds.
- `replaceState()` preserves the saved baseline because array and block paste use it to edit content.
- A generation check prevents an older in-flight save from replacing the baseline or form fields after a newer initialisation/reset.
- The baseline is based on the submitted server result, never on edits made during a request. A manual response preserves current values if edits arrived during that request.

Existing version-restoration and server persistence code are unchanged. An editor reload/new initial state after restoration establishes its new baseline.

## No-op guard boundaries

The guard applies to update operations in document forms. It skips unchanged manual draft saves, ordinary saves without drafts, and publishing when the existing metadata says there are no newer draft versions and a published document exists. Initial creation and initial publishing remain possible. Existing background autosave submissions bypass the new no-op guard.

Explicit custom data overrides and override functions bypass the guard because they may intentionally submit values outside the current field state. Existing validation, permissions, upload status, labels, shortcuts, and loading controls remain in place. Save Draft now increments the unpublished-version count only after a successful response, rather than after an error or skipped submission.

## Remaining published-content work

`DocumentInfo` supplies the current draft's data/form state, `hasPublishedDoc`, and version counts. It does not supply a normalised published form-state baseline. A robust second phase needs to obtain published content with the current user's access, normalise it through the same field processing, and maintain it across publication, restore, document/locale changes, and in-flight work. It must also distinguish active-locale publication from all-locale publication; the active editor values cannot prove that other locales already match their published content.

Accordingly, these requested scenarios remain unsupported:

- A saved draft identical to published content can still enable publishing if a newer draft version exists.
- Reverting an unsaved editor to published content while it differs from the saved draft can still enable publishing.
- There is no independent `hasUnpublishedChanges` state or published-baseline fetch/cache yet.

`packages/ui/src/elements/Status/index.tsx` still renders “Changed” using `unpublishedVersionCount > 0 && hasPublishedDoc`. Its version-status semantics are unchanged and should be considered with the second phase.

## Validation

Added 36 tests across three files. They cover primitive/rich-text/nested edits and undo, array reordering and deletion, metadata and key order, snapshot isolation, pending rows/files, accepted/replacement uploads, Save Draft button and Ctrl+S no-ops, native form no-ops, immediate saves and publishing, autocomplete, server-normalised save/publish results, failed saves, initial creation/publication, existing saved-draft publication, paste, document/locale initialisation, reset, in-flight edits/responses, autosave bypass, custom overrides, non-document forms, immediate leave protection, and a large document.

Commands and results:

- `pnpm exec vitest run --project unit packages/ui/src/forms/Form packages/ui/src/elements/LeaveWithoutSaving packages/ui/src/elements/ClipboardAction --reporter verbose`: **96 passed across 10 files**, including nearby clipboard regression tests.
- `pnpm exec tsc --noEmit -p packages/ui/tsconfig.json --incremental --tsBuildInfoFile /tmp/payload-content-changes.tsbuildinfo`: **passed**.
- Targeted ESLint on changed production files: **0 errors**, six warnings on existing lines (existing `any` types and an unused button argument). The repository's default ESLint configuration ignores spec files.
- `git diff --check`: **passed**.

The focused tests mount the real Form and Save Draft button with provider/network mocks and exercise the actual shortcut hook. Full browser, database integration, cross-adapter, version-restoration, all-locale publishing, and production typing benchmarks were not run. Custom document forms whose `onSuccess` does not return authoritative form state conservatively retain the previous baseline.

## Files changed

Paths are relative to the repository root. Counts are approximate added lines, including replacement lines.

| File                                                                  | Added lines | Purpose                                                                |
| --------------------------------------------------------------------- | ----------: | ---------------------------------------------------------------------- |
| `packages/ui/src/forms/Form/index.tsx`                                |         124 | Baseline lifecycle, debounced state, submission guard, in-flight edits |
| `packages/ui/src/forms/Form/context.ts`                               |          10 | Separate internal context and content-change hook                      |
| `packages/ui/src/forms/Form/types.ts`                                 |           2 | Synchronous comparison on form context                                 |
| `packages/ui/src/forms/Form/initContextState.ts`                      |           1 | Default comparison callback                                            |
| `packages/ui/src/forms/Form/formContent.ts`                           |          32 | Submission-value snapshots and comparisons                             |
| `packages/ui/src/elements/SaveDraftButton/index.tsx`                  |           6 | Content-aware availability and successful version-count update         |
| `packages/ui/src/elements/SaveButton/index.tsx`                       |           2 | Content-aware availability                                             |
| `packages/ui/src/elements/PublishButton/index.tsx`                    |           2 | Content-aware unsaved flag; existing draft-publication exception       |
| `packages/ui/src/elements/LeaveWithoutSaving/index.tsx`               |          10 | Current-content leave decision                                         |
| `packages/ui/src/elements/LeaveWithoutSaving/usePreventLeave.tsx`     |           6 | Lazy leave predicate                                                   |
| `packages/ui/src/forms/Form/formContent.spec.ts`                      |         143 | Comparison and large-document tests                                    |
| `packages/ui/src/forms/Form/contentChanges.spec.ts`                   |         449 | Form, save, shortcut, lifecycle, and regression tests                  |
| `packages/ui/src/elements/LeaveWithoutSaving/usePreventLeave.spec.ts` |          71 | Navigation/unload test                                                 |
| `CONTENT_CHANGE_DETECTION.md`                                         |        ~100 | Design, validation, file inventory, and remaining work                 |
