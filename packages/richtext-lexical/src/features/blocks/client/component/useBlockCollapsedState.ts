'use client'

import type { DocumentPreferences } from 'payload'

import { useCallback, useEffect, useState } from 'react'

import type { InitialLexicalFormState } from '../../../../utilities/buildInitialState.js'

type Args = {
  blockID: string
  fieldName: string
  getDocPreferences: () => Promise<DocumentPreferences>
  initialState: InitialLexicalFormState
}

// The server field snapshot survives tab remounts. Keep unsaved preference changes
// alongside it without mutating props or retaining snapshots after the field is discarded.
const collapsedChanges = new WeakMap<InitialLexicalFormState, Map<string, boolean>>()

export function useBlockCollapsedState({
  blockID,
  fieldName,
  getDocPreferences,
  initialState,
}: Args): readonly [boolean, (isCollapsed: boolean) => void] {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(
    () =>
      collapsedChanges.get(initialState)?.get(blockID) ?? initialState[blockID]?.collapsed ?? false,
  )

  useEffect(() => {
    const changedState = collapsedChanges.get(initialState)?.get(blockID)
    if (typeof changedState === 'boolean') {
      setIsCollapsed(changedState)
      return
    }

    let isActive = true

    // Document preferences are already cached by Payload, including in-flight reads.
    void getDocPreferences()
      .then((preferences) => {
        if (!isActive) {
          return
        }
        const changedState = collapsedChanges.get(initialState)?.get(blockID)
        const collapsed = preferences?.fields?.[fieldName]?.collapsed

        setIsCollapsed(changedState ?? (Array.isArray(collapsed) && collapsed.includes(blockID)))
      })
      .catch(() => {
        // Keep the initial/local state if preferences cannot be loaded.
      })

    return () => {
      isActive = false
    }
  }, [blockID, fieldName, getDocPreferences, initialState])

  const setCollapsed = useCallback(
    (isCollapsed: boolean) => {
      let changes = collapsedChanges.get(initialState)
      if (!changes) {
        changes = new Map()
        collapsedChanges.set(initialState, changes)
      }
      changes.set(blockID, isCollapsed)
      setIsCollapsed(isCollapsed)
    },
    [blockID, initialState],
  )

  return [isCollapsed, setCollapsed]
}
