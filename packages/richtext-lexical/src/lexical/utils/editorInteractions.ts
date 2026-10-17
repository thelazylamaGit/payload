import type { LexicalEditor } from 'lexical'
import type { SyntheticEvent } from 'react'

const editorInteractions = new WeakMap<Event, Set<LexicalEditor>>()

// React capture events follow portals back to their owning editor, unlike DOM containment.
export function getEditorInteractionHandlers(...owningEditors: LexicalEditor[]) {
  const recordInteraction = (event: SyntheticEvent) => {
    let editors = editorInteractions.get(event.nativeEvent)
    if (!editors) {
      editors = new Set()
      editorInteractions.set(event.nativeEvent, editors)
    }
    for (const editor of owningEditors) {
      editors.add(editor)
    }
  }

  return {
    onFocusCapture: recordInteraction,
    onPointerDownCapture: recordInteraction,
  }
}

export function isEditorInteraction(editor: LexicalEditor, event: Event): boolean {
  if (editorInteractions.get(event)?.has(editor)) {
    return true
  }
  const target = event.target
  const root = editor.getRootElement()
  if (!root || !target || !('nodeType' in target)) {
    return false
  }
  const node = target as Node
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement

  return (
    root.contains(node) ||
    element
      ?.closest('[data-lexical-toolbar-editor]')
      ?.getAttribute('data-lexical-toolbar-editor') === editor.getKey()
  )
}
