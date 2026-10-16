# Releasing the Lexical fork

The `Release Lexical fork` workflow builds only richtext-lexical and its workspace
build dependencies, runs focused regression tests, and uploads an installable
`.tgz` plus `SHA256SUMS` to a GitHub release. It does not publish to npm.

From the commit you want to release, use a new revision:

```bash
git tag lexical-3.91.0-patches.1
git push origin lexical-3.91.0-patches.1
```

The tag prefix must match the richtext-lexical package version. Use `.2`, `.3`,
etc. for subsequent releases. Existing release assets are never replaced.

Alternatively, once this workflow exists on the repository's default branch,
choose **Actions → Release Lexical fork → Run workflow**, select the branch to
build, and enter a new release tag. A pre-existing tag must point to the selected
commit. The workflow creates the release tag if it does not already exist.

The workflow uses its built-in `GITHUB_TOKEN` with `contents: write`; it does not
need an npm token or personal access token. GitHub Actions must be enabled in the
fork.

For a public fork, install the asset without authentication, including from a
private consumer project or its GitHub Actions workflow:

```bash
pnpm add '@payloadcms/richtext-lexical@https://github.com/thelazylamaGit/payload/releases/download/lexical-3.91.0-patches.1/payloadcms-richtext-lexical-3.91.0.tgz'
```

Commit the consumer's updated manifest and lockfile, then use
`pnpm install --frozen-lockfile` in CI. Keep other Payload packages on the matching
official version. Use the uploaded package asset, not GitHub's source archives.

Before switching the consumer, remove the old richtext-lexical entry in
`patchedDependencies`, or replace it with a fresh patch containing only changes
still needed. The old consumer patch includes table and toolbar fixes already in
this fork and a separate `Field` update-coalescing change that this fork deliberately
does not include. Removing the whole patch also removes that `Field` behavior.
