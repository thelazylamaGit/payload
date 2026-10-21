'use client'

import type { LexicalEditor } from 'lexical'

import type { ToolbarDropdownGroup } from '../../../types.js'

import { useToolbarStates } from '../../useToolbarStates.js'
import { ToolbarDropdown } from '../index.js'

export const ToolbarSubmenu = ({
  anchorElem,
  editor,
  enabled,
  group,
  label,
}: {
  anchorElem: HTMLElement
  editor: LexicalEditor
  enabled?: boolean
  group: ToolbarDropdownGroup
  label: string
}) => {
  const states = useToolbarStates(editor, [group])
  const groupState = states.groupStates.get(group.key)

  if (!groupState) {
    return null
  }

  return (
    <ToolbarDropdown
      anchorElem={anchorElem}
      classNames={['toolbar-popup__dropdown-submenu']}
      editor={editor}
      group={group}
      groupState={{ ...groupState, enabledGroup: enabled !== false && groupState.enabledGroup }}
      Icon={group.ChildComponent}
      isSubmenu
      label={label}
    />
  )
}
