import type { Locator, Page } from '@playwright/test'

import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

import type { PayloadTestSDK } from '../__helpers/shared/sdk/index.js'

import { duplicateBlock } from '../__helpers/e2e/fields/blocks/index.js'
import { ensureCompilationIsDone, initPageConsoleErrorCatch } from '../__helpers/e2e/helpers.js'
import { AdminUrlUtil } from '../__helpers/shared/adminUrlUtil.js'
import { initPayloadE2ENoConfig } from '../__helpers/shared/initPayloadE2ENoConfig.js'
import { LexicalHelpers } from '../lexical/collections/utils.js'
import { TEST_TIMEOUT_LONG } from '../playwright.config.js'
import { buildSeedPage } from './seed.js'
import { blockSlugs, pagesSlug } from './shared.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

type LexicalNode = { children?: LexicalNode[]; fields?: Record<string, any>; type: string }

/**
 * Finds all lexical block nodes of a block type anywhere in a document, including blocks nested in
 * ordinary block fields, arrays and other rich text fields.
 */
const findBlockNodes = (value: unknown, blockType: string, found: LexicalNode[] = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => findBlockNodes(item, blockType, found))
  } else if (value && typeof value === 'object') {
    const node = value as LexicalNode
    if (
      (node.type === 'block' || node.type === 'inlineBlock') &&
      node.fields?.blockType === blockType
    ) {
      found.push(node)
    }
    Object.values(value).forEach((child) => findBlockNodes(child, blockType, found))
  }
  return found
}

const paragraphWithText = (scope: Locator | Page, text: string): Locator =>
  scope.locator('[data-lexical-editor="true"] p', { hasText: text }).first()

/**
 * The innermost editor containing the first paragraph with the given text
 */
const editorWithParagraph = (scope: Locator | Page, text: string): Locator =>
  paragraphWithText(scope, text).locator('xpath=ancestor::*[@data-lexical-editor="true"][1]')

const placeCaretAfter = async ({
  page,
  scope = page,
  text,
}: {
  page: Page
  scope?: Locator | Page
  text: string
}) => {
  await paragraphWithText(scope, text).click()
  await page.keyboard.press('End')
}

test.describe('Lexical schema map', () => {
  let page: Page
  let payload: PayloadTestSDK<any>
  let url: AdminUrlUtil
  let lexical: LexicalHelpers
  const createdIDs: (number | string)[] = []

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(TEST_TIMEOUT_LONG)

    let serverURL: string
    ;({ payload, serverURL } = await initPayloadE2ENoConfig({ dirname }))
    url = new AdminUrlUtil(serverURL, pagesSlug)

    const context = await browser.newContext()
    page = await context.newPage()
    initPageConsoleErrorCatch(page)
    await ensureCompilationIsDone({ page, serverURL })
    lexical = new LexicalHelpers(page)
  })

  test.afterEach(async () => {
    for (const id of createdIDs) {
      await payload.delete({ id, collection: pagesSlug })
    }
    createdIDs.length = 0
  })

  const openSeededPage = async () => {
    const doc = await payload.create({ collection: pagesSlug, data: buildSeedPage() })
    createdIDs.push(doc.id)

    await page.goto(url.edit(doc.id))
    await expect(page.locator('.LexicalEditorTheme__block-ButtonRow').first()).toBeVisible()

    return doc.id
  }

  const getDraft = async (id: number | string) =>
    (await page.request.get(`${url.serverURL}/api/${pagesSlug}/${id}?draft=true&depth=0`)).json()

  // The collection autosaves drafts, so edits are persisted without pressing a button
  const autosaveTimeout = { timeout: 15000 }

  test('should render every nested editor', async () => {
    await openSeededPage()

    await expect(editorWithParagraph(page, 'Section one')).toBeVisible()
    await expect(editorWithParagraph(page, 'content with media')).toBeVisible()
    await expect(editorWithParagraph(page, 'text panel')).toBeVisible()
    await expect(editorWithParagraph(page, 'column one')).toBeVisible()
    await expect(page.locator('.LexicalEditorTheme__block-Grid').first()).toBeVisible()
    await expect(page.locator('#field-buttons__0__label').first()).toHaveValue('Column CTA')
  })

  test('should insert and save a block in the deepest nested editor', async () => {
    const id = await openSeededPage()

    await placeCaretAfter({ page, text: 'column two' })
    await page.keyboard.press('Enter')
    await lexical.slashCommand('button', true, 'Button Row')

    const insertedBlock = editorWithParagraph(page, 'column two').locator(
      '.LexicalEditorTheme__block-ButtonRow',
    )
    await expect(insertedBlock).toBeVisible()
    await insertedBlock.getByRole('button', { name: 'Add Button' }).click()
    await insertedBlock.locator('input[id$="buttons__0__label"]').fill('Nested CTA')

    await expect
      .poll(async () => {
        const draft = await getDraft(id)
        return findBlockNodes(draft, blockSlugs.buttonRow).map(
          (node) => node.fields?.buttons?.[0]?.label,
        )
      }, autosaveTimeout)
      .toContain('Nested CTA')

    await page.reload()
    await expect(page.locator('input[value="Nested CTA"]')).toBeVisible()
  })

  test('should insert an inline block and a nested editor block in a nested editor', async () => {
    const id = await openSeededPage()

    await placeCaretAfter({ page, text: 'Section three' })
    await page.keyboard.press('Enter')
    await lexical.slashCommand('panel', true, 'Text Panel')

    const textPanel = editorWithParagraph(page, 'Section three').locator(
      '.LexicalEditorTheme__block-TextPanel',
    )
    await expect(textPanel).toBeVisible()
    await textPanel.locator('input[id$="heading"]').fill('Inserted panel')

    const nestedEditor = textPanel.locator('[data-lexical-editor="true"]')
    await nestedEditor.click()
    await page.keyboard.type('nested text')
    await page.keyboard.press('Enter')
    await lexical.slashCommand('grid', true, 'Grid')
    await expect(textPanel.locator('.LexicalEditorTheme__block-Grid')).toBeVisible()

    await placeCaretAfter({ page, text: 'Section three' })
    await page.keyboard.type(' ')
    await lexical.slashCommand('badge', true, 'Inline Badge')
    await lexical.drawer.locator('input[id$="label"]').fill('badge')
    await lexical.save('drawer')

    await expect
      .poll(async () => {
        const draft = await getDraft(id)
        return findBlockNodes(draft, blockSlugs.inlineBadge).map((node) => node.fields?.label)
      }, autosaveTimeout)
      .toContain('badge')

    const draft = await getDraft(id)
    expect(
      findBlockNodes(draft, blockSlugs.textPanel).map((node) => node.fields?.heading),
    ).toContain('Inserted panel')
    // Three seeded Grids plus the one inserted in the new TextPanel
    expect(findBlockNodes(draft, blockSlugs.grid)).toHaveLength(4)
  })

  test('should edit blocks with tabs, groups and custom components in nested editors', async () => {
    const id = await openSeededPage()

    await placeCaretAfter({ page, text: 'Section three' })
    await page.keyboard.press('Enter')
    await lexical.slashCommand('layout', true, 'Layout Field')

    const layoutBlock = editorWithParagraph(page, 'Section three').locator(
      '.LexicalEditorTheme__block-LayoutFields',
    )
    await expect(layoutBlock).toBeVisible()
    await layoutBlock.locator('input[id$="groupText"]').fill('group value')
    await layoutBlock.getByRole('button', { exact: true, name: 'Named Tab' }).click()
    await layoutBlock.locator('input[id$="namedTabText"]').fill('tab value')

    await placeCaretAfter({ page, text: 'Section three' })
    await page.keyboard.press('Enter')
    await lexical.slashCommand('callout', true, 'Labelled Callout')
    await expect(page.locator('.callout-label')).toBeVisible()

    await placeCaretAfter({ page, text: 'text panel' })
    await page.keyboard.press('Enter')
    await lexical.slashCommand('note', true, 'Inline Defined Note')
    await expect(page.locator('.LexicalEditorTheme__block-InlineDefinedNote').first()).toBeVisible()

    await expect
      .poll(async () => {
        const draft = await getDraft(id)
        return findBlockNodes(draft, blockSlugs.layoutFields).map((node) => [
          node.fields?.namedGroup?.groupText,
          node.fields?.namedTab?.namedTabText,
        ])
      }, autosaveTimeout)
      .toEqual([['group value', 'tab value']])
  })

  test('should remove a nested block without affecting repeated editors', async () => {
    const id = await openSeededPage()
    const before = findBlockNodes(await getDraft(id), blockSlugs.textPanel).length

    const sectionTwo = editorWithParagraph(page, 'Section two')
    await sectionTwo
      .locator('.LexicalEditorTheme__block-TextPanel .LexicalEditorTheme__block__removeButton')
      .first()
      .click()
    await expect(sectionTwo.locator('.LexicalEditorTheme__block-TextPanel')).toHaveCount(0)

    await expect
      .poll(async () => {
        const draft = await getDraft(id)
        return findBlockNodes(draft, blockSlugs.textPanel).length
      }, autosaveTimeout)
      .toBe(before - 1)

    const draft = await getDraft(id)
    // Other instances of the same editors keep their own content
    expect(JSON.stringify(draft.layout[0])).toContain('Section one')
    expect(JSON.stringify(draft.layout[3])).toContain('content with media')
  })

  test('should duplicate a block row with nested editors without sharing values', async () => {
    const id = await openSeededPage()

    await duplicateBlock(page, { fieldName: 'layout', rowIndex: 1 })

    const duplicatedRow = page.locator('#layout-row-2')
    await expect(duplicatedRow.locator('.LexicalEditorTheme__block-Grid')).toBeVisible()
    await placeCaretAfter({ page, scope: duplicatedRow, text: 'Section two' })
    await page.keyboard.type(' duplicated')

    await expect
      .poll(async () => {
        const draft = await getDraft(id)
        return JSON.stringify(draft.layout[2])
      }, autosaveTimeout)
      .toContain('Section two duplicated')

    const draft = await getDraft(id)
    expect(JSON.stringify(draft.layout[1])).not.toContain('Section two duplicated')
    expect(findBlockNodes(draft.layout[2], blockSlugs.grid)).toHaveLength(1)
  })
})
