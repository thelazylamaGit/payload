'use client'

import type { DecoratorNode, ElementNode, LexicalEditor, LexicalNode } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import {
  $addUpdateTag,
  $createNodeSelection,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical'
import { useEffect } from 'react'

import { isEditorInteraction } from '../../utils/editorInteractions.js'
import './index.scss'

// TODO: This should ideally be fixed in Lexical. See
// https://github.com/facebook/lexical/pull/7072
export function DecoratorPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const $onDelete = (event: KeyboardEvent, activeEditor: LexicalEditor) => {
      if (activeEditor !== editor) {
        return false
      }
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) {
        return false
      }
      const activeElement = editor.getRootElement()?.ownerDocument.activeElement

      if (isEditingControl(editor, event.target) || isEditingControl(editor, activeElement)) {
        if (
          isEditingDecoratorContent(editor, event.target) ||
          isEditingDecoratorContent(editor, activeElement ?? null)
        ) {
          $setSelection(null)
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        }
        // Stop lower-priority editor deletion handlers without cancelling native field editing.
        return true
      }
      if (event.defaultPrevented) {
        return true
      }
      event.preventDefault()
      selection.getNodes().forEach((node) => {
        node.remove()
      })
      return true
    }

    let selectedElement: HTMLElement | null = null
    let hasNodeSelection = false

    const clearOutline = () => {
      selectedElement?.classList.remove('decorator-selected')
      selectedElement = null
    }

    const $syncOutline = () => {
      const selection = $getSelection()
      hasNodeSelection = $isNodeSelection(selection)
      const element = $getSelectedDecorator()?.element ?? null
      if (selectedElement !== element) {
        clearOutline()
        selectedElement = element
      }
      selectedElement?.classList.add('decorator-selected')
    }

    const clearNodeSelection = () => {
      if (!hasNodeSelection && !selectedElement) {
        return
      }
      clearOutline()
      editor.update(
        () => {
          if ($isNodeSelection($getSelection())) {
            $setSelection(null)
          }
        },
        { tag: SKIP_DOM_SELECTION_TAG },
      )
    }

    return mergeRegister(
      () => {
        clearOutline()
      },
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read($syncOutline, { editor })
      }),
      editor.registerRootListener(() => {
        clearOutline()
        editor.getEditorState().read($syncOutline, { editor })
      }),
      registerOutsideInteractions({
        clearNodeSelection,
        editor,
        hasNodeSelection: () => hasNodeSelection,
      }),
      editor.registerCommand(
        CLICK_COMMAND,
        (event, activeEditor) => {
          if (activeEditor !== editor) {
            return false
          }
          const decorator = $getDecoratorByMouseEvent(event)
          if (!decorator) {
            return true
          }
          const { target } = event
          const isInteractive =
            !(target instanceof HTMLElement) ||
            target.isContentEditable ||
            target.closest(
              'a, button, select, textarea, input, .react-select, .code-editor, .no-select-decorator, [role="button"]',
            )
          if (isEditingDecoratorContent(editor, target)) {
            if ($isNodeSelection($getSelection())) {
              $setSelection(null)
            }
          } else if (!isInteractive) {
            $selectDecorator(decorator)
          }
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, $onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, $onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_, activeEditor) => {
          if (activeEditor !== editor) {
            return false
          }
          $syncOutline()
          return Boolean($getSelectedDecorator())
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event, activeEditor) => {
          if (activeEditor !== editor) {
            return false
          }
          // CASE 1: Node selection
          const selection = $getSelection()
          if ($isNodeSelection(selection)) {
            const prevSibling = selection.getNodes()[0]?.getPreviousSibling()
            if ($isDecoratorNode(prevSibling)) {
              const element = $getEditor().getElementByKey(prevSibling.getKey())
              if (element) {
                $selectDecorator({ element, node: prevSibling })
                event.preventDefault()
                return true
              }
              return false
            }
            if (!$isElementNode(prevSibling)) {
              return false
            }
            const lastDescendant = prevSibling.getLastDescendant() ?? prevSibling
            if (!lastDescendant) {
              return false
            }
            const block = $findMatchingParent(lastDescendant, INTERNAL_$isBlock)
            block?.selectStart()
            event.preventDefault()
            return true
          }
          if (!$isRangeSelection(selection)) {
            return false
          }

          // CASE 2: Range selection
          // Get first selected block
          const firstPoint = selection.isBackward() ? selection.anchor : selection.focus
          const firstNode = firstPoint.getNode()
          const firstSelectedBlock = $findMatchingParent(firstNode, (node) => {
            return findFirstSiblingBlock(node) !== null
          })
          const prevBlock = firstSelectedBlock?.getPreviousSibling()
          if (!firstSelectedBlock || prevBlock !== findFirstSiblingBlock(firstSelectedBlock)) {
            return false
          }

          if ($isDecoratorNode(prevBlock)) {
            const prevBlockElement = $getEditor().getElementByKey(prevBlock.getKey())
            if (prevBlockElement) {
              $selectDecorator({ element: prevBlockElement, node: prevBlock })
              event.preventDefault()
              return true
            }
          }

          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event, activeEditor) => {
          if (activeEditor !== editor) {
            return false
          }
          // CASE 1: Node selection
          const selection = $getSelection()
          if ($isNodeSelection(selection)) {
            event.preventDefault()
            const nextSibling = selection.getNodes()[0]?.getNextSibling()
            if ($isDecoratorNode(nextSibling)) {
              const element = $getEditor().getElementByKey(nextSibling.getKey())
              if (element) {
                $selectDecorator({ element, node: nextSibling })
              }
              return true
            }
            if (!$isElementNode(nextSibling)) {
              return true
            }
            const firstDescendant = nextSibling.getFirstDescendant() ?? nextSibling
            if (!firstDescendant) {
              return true
            }
            const block = $findMatchingParent(firstDescendant, INTERNAL_$isBlock)
            block?.selectEnd()
            event.preventDefault()
            return true
          }
          if (!$isRangeSelection(selection)) {
            return false
          }

          // CASE 2: Range selection
          // Get last selected block
          const lastPoint = selection.isBackward() ? selection.anchor : selection.focus
          const lastNode = lastPoint.getNode()
          const lastSelectedBlock = $findMatchingParent(lastNode, (node) => {
            return findLaterSiblingBlock(node) !== null
          })
          const nextBlock = lastSelectedBlock?.getNextSibling()
          if (!lastSelectedBlock || nextBlock !== findLaterSiblingBlock(lastSelectedBlock)) {
            return false
          }

          if ($isDecoratorNode(nextBlock)) {
            const nextBlockElement = $getEditor().getElementByKey(nextBlock.getKey())
            if (nextBlockElement) {
              $selectDecorator({ element: nextBlockElement, node: nextBlock })
              event.preventDefault()
              return true
            }
          }

          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  return null
}

function registerOutsideInteractions({
  clearNodeSelection,
  editor,
  hasNodeSelection,
}: {
  clearNodeSelection: () => void
  editor: LexicalEditor
  hasNodeSelection: () => boolean
}) {
  let removeRootListeners = () => {}
  const removeRootListener = editor.registerRootListener((root) => {
    removeRootListeners()
    if (!root) {
      return
    }
    const ownerDocument = root.ownerDocument
    let isActive = true
    let lastFocusEvent: FocusEvent | null = null
    let blurTimeout: ReturnType<typeof setTimeout> | undefined
    const pendingInteractions = new Set<ReturnType<typeof setTimeout>>()

    const onInteraction = (event: Event) => {
      if (!hasNodeSelection()) {
        return
      }
      if (isEditingDecoratorContent(editor, event.target)) {
        clearNodeSelection()
        return
      }
      // Wait for the complete dispatch: browsers can flush microtasks between
      // document capture and the React capture handlers that identify portals.
      const timeout = setTimeout(() => {
        pendingInteractions.delete(timeout)
        if (!isActive) {
          return
        }
        if (event.type === 'focusin') {
          lastFocusEvent = event as FocusEvent
        }
        if (!isEditorInteraction(editor, event)) {
          clearNodeSelection()
        }
      }, 0)
      pendingInteractions.add(timeout)
    }

    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget !== null || !hasNodeSelection()) {
        return
      }
      clearTimeout(blurTimeout)
      blurTimeout = setTimeout(() => {
        if (!isActive) {
          return
        }
        const activeElement = ownerDocument.activeElement
        if (
          !root.contains(activeElement) &&
          !(lastFocusEvent?.target === activeElement && isEditorInteraction(editor, lastFocusEvent))
        ) {
          clearNodeSelection()
        }
      }, 0)
    }

    ownerDocument.addEventListener('pointerdown', onInteraction, true)
    ownerDocument.addEventListener('focusin', onInteraction, true)
    ownerDocument.addEventListener('focusout', onFocusOut, true)

    removeRootListeners = () => {
      isActive = false
      clearTimeout(blurTimeout)
      pendingInteractions.forEach(clearTimeout)
      ownerDocument.removeEventListener('pointerdown', onInteraction, true)
      ownerDocument.removeEventListener('focusin', onInteraction, true)
      ownerDocument.removeEventListener('focusout', onFocusOut, true)
    }
  })

  return () => {
    removeRootListener()
    removeRootListeners()
  }
}

/** Editing controls own their keystrokes even if the outer editor has a stale node selection. */
function isEditingControl(editor: LexicalEditor, target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const control = target.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="combobox"], .react-select, .code-editor',
  )

  return Boolean(control && control !== editor.getRootElement())
}

function isEditingDecoratorContent(editor: LexicalEditor, target: EventTarget | null): boolean {
  if (!isEditingControl(editor, target) || !(target instanceof HTMLElement)) {
    return false
  }

  const root = editor.getRootElement()
  const decorator = target.closest('[data-lexical-decorator="true"]')

  return Boolean(decorator && root?.contains(decorator) && root.contains(target))
}

function $getDecoratorByMouseEvent(
  event: MouseEvent,
): { element: HTMLElement; node: DecoratorNode<unknown> } | undefined {
  if (!(event.target instanceof HTMLElement)) {
    return undefined
  }
  const element = event.target.closest('[data-lexical-decorator="true"]')
  if (!(element instanceof HTMLElement)) {
    return undefined
  }
  const node = $getNearestNodeFromDOMNode(element)
  return $isDecoratorNode(node) ? { element, node } : undefined
}

function $getSelectedDecorator() {
  const selection = $getSelection()
  if (!$isNodeSelection(selection)) {
    return undefined
  }
  const nodes = selection.getNodes()
  if (nodes.length !== 1) {
    return undefined
  }
  const node = nodes[0]
  return $isDecoratorNode(node)
    ? {
        decorator: node,
        element: $getEditor().getElementByKey(node.getKey()),
      }
    : undefined
}

function $selectDecorator({
  element,
  node,
}: {
  element: HTMLElement
  node: DecoratorNode<unknown>
}) {
  const selection = $createNodeSelection()
  selection.add(node.getKey())
  $setSelection(selection)
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/**
 * Copied from https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalUtils.ts
 *
 * This function returns true for a DecoratorNode that is not inline OR
 * an ElementNode that is:
 * - not a root or shadow root
 * - not inline
 * - can't be empty
 * - has no children or an inline first child
 */
export function INTERNAL_$isBlock(node: LexicalNode): node is DecoratorNode<unknown> | ElementNode {
  if ($isDecoratorNode(node) && !node.isInline()) {
    return true
  }
  if (!$isElementNode(node) || $isRootOrShadowRoot(node)) {
    return false
  }

  const firstChild = node.getFirstChild()
  const isLeafElement =
    firstChild === null ||
    $isLineBreakNode(firstChild) ||
    $isTextNode(firstChild) ||
    firstChild.isInline()

  return !node.isInline() && node.canBeEmpty() !== false && isLeafElement
}

function findLaterSiblingBlock(node: LexicalNode): LexicalNode | null {
  let current = node.getNextSibling()
  while (current !== null) {
    if (INTERNAL_$isBlock(current)) {
      return current
    }
    current = current.getNextSibling()
  }
  return null
}

function findFirstSiblingBlock(node: LexicalNode): LexicalNode | null {
  let current = node.getPreviousSibling()
  while (current !== null) {
    if (INTERNAL_$isBlock(current)) {
      return current
    }
    current = current.getPreviousSibling()
  }
  return null
}
