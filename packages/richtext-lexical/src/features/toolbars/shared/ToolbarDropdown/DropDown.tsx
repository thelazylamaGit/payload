'use client'
import { Button } from '@payloadcms/ui'
import { $addUpdateTag, isDOMNode, type LexicalEditor } from 'lexical'
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import type { ToolbarGroupItem } from '../../types.js'

const baseClass = 'toolbar-popup__dropdown-item'

interface DropDownContextType {
  activeSubmenu?: string
  menuRef: React.RefObject<HTMLDivElement | null>
  registerItem: (ref: React.RefObject<HTMLButtonElement | null>) => () => void
  setActiveSubmenu: React.Dispatch<React.SetStateAction<string | undefined>>
}

const DropDownContext = React.createContext<DropDownContextType | null>(null)

export function DropDownItem({
  active,
  children,
  editor,
  enabled,
  Icon,
  item,
  itemKey,
  tooltip,
}: {
  active?: boolean
  children: React.ReactNode
  editor: LexicalEditor
  enabled?: boolean
  Icon: React.ReactNode
  item: ToolbarGroupItem
  itemKey: string
  tooltip?: string
}): React.ReactNode {
  const className = useMemo(() => {
    return [
      baseClass,
      enabled === false ? 'disabled' : '',
      active ? 'active' : '',
      item?.key ? `${baseClass}-${item.key}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  }, [enabled, active, item.key])

  const ref = useRef<HTMLButtonElement>(null)

  const dropDownContext = React.use(DropDownContext)

  if (dropDownContext === null) {
    throw new Error('DropDownItem must be used within a DropDown')
  }

  const { registerItem } = dropDownContext

  useLayoutEffect(() => {
    if (ref?.current != null) {
      return registerItem(ref)
    }
  }, [ref, registerItem])

  return (
    <Button
      aria-label={tooltip}
      buttonStyle="none"
      className={className}
      disabled={enabled === false}
      extraButtonProps={{
        'data-item-key': itemKey,
      }}
      icon={Icon}
      iconPosition="left"
      iconStyle="none"
      onClick={() => {
        if (enabled !== false) {
          editor.focus(() => {
            editor.update(() => {
              $addUpdateTag('toolbar')
            })
            // We need to wrap the onSelect in the callback, so the editor is properly focused before the onSelect is called.
            item.onSelect?.({
              editor,
              isActive: active!,
            })
          })
        }
      }}
      onMouseDown={(e) => {
        // This is required for Firefox compatibility. Without it, the dropdown will disappear without the onClick being called.
        // This only happens in Firefox. Must be something about how Firefox handles focus events differently.
        e.preventDefault()
      }}
      ref={ref}
      tooltip={tooltip}
      type="button"
    >
      {children}
    </Button>
  )
}

function DropDownItems({
  children,
  dropDownRef,
  isSubmenu,
  itemsContainerClassNames,
  onClose,
}: {
  children: React.ReactNode
  dropDownRef: React.RefObject<HTMLDivElement | null>
  isSubmenu: boolean
  itemsContainerClassNames?: string[]
  onClose: () => void
}): React.ReactElement {
  const [activeSubmenu, setActiveSubmenu] = useState<string>()
  const [items, setItems] = useState<Array<React.RefObject<HTMLButtonElement | null>>>()
  const [highlightedItem, setHighlightedItem] =
    useState<React.RefObject<HTMLButtonElement | null>>()

  const registerItem = useCallback(
    (itemRef: React.RefObject<HTMLButtonElement | null>) => {
      setItems((prev) => (prev != null ? [...prev, itemRef] : [itemRef]))
      return () => setItems((prev) => prev?.filter((item) => item !== itemRef))
    },
    [setItems],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // React events from a portaled child menu also bubble through its parent menu.
    event.stopPropagation()
    const { key } = event
    const enabledItems = items?.filter((item) => item.current && !item.current.disabled) ?? []

    if (
      ['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(key) ||
      (isSubmenu && key === 'ArrowLeft')
    ) {
      event.preventDefault()
    }

    if (key === 'Escape' || key === 'Tab' || (isSubmenu && key === 'ArrowLeft')) {
      onClose()
    } else if ((key === 'ArrowUp' || key === 'ArrowDown') && enabledItems.length) {
      setActiveSubmenu(undefined)
      const currentIndex = enabledItems.findIndex((item) => item.current === document.activeElement)
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + (key === 'ArrowUp' ? -1 : 1) + enabledItems.length) %
            enabledItems.length
      setHighlightedItem(enabledItems[nextIndex])
      enabledItems[nextIndex]?.current?.focus()
    }
  }

  const contextValue = useMemo(
    () => ({
      activeSubmenu,
      menuRef: dropDownRef,
      registerItem,
      setActiveSubmenu,
    }),
    [activeSubmenu, dropDownRef, registerItem],
  )

  useLayoutEffect(() => {
    if (items != null && highlightedItem == null) {
      setHighlightedItem(items.find((item) => item.current && !item.current.disabled))
    }

    if (highlightedItem != null && highlightedItem?.current != null) {
      highlightedItem.current.focus()
    }
  }, [items, highlightedItem])

  return (
    <DropDownContext value={contextValue}>
      <div
        className={(itemsContainerClassNames ?? ['toolbar-popup__dropdown-items']).join(' ')}
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement

          if (event.currentTarget.contains(target)) {
            const focusedItem = items?.find((item) => item.current === target)

            if (focusedItem) {
              setHighlightedItem(focusedItem)
            }
          }
        }}
        onKeyDown={handleKeyDown}
        ref={dropDownRef}
      >
        {children}
      </div>
    </DropDownContext>
  )
}

export function DropDown({
  buttonAriaLabel,
  buttonClassName,
  children,
  disabled = false,
  dropdownKey,
  Icon,
  isSubmenu = false,
  itemsContainerClassNames,
  label,
  stopCloseOnClickSelf,
}: {
  buttonAriaLabel?: string
  buttonClassName: string
  children: ReactNode
  disabled?: boolean
  dropdownKey: string
  Icon?: React.FC
  isSubmenu?: boolean
  itemsContainerClassNames?: string[]
  label?: string
  stopCloseOnClickSelf?: boolean
}): React.ReactNode {
  const dropDownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const parentContext = React.use(DropDownContext)
  const parentMenu = isSubmenu ? parentContext : null
  const showDropDown = parentMenu ? parentMenu.activeSubmenu === dropdownKey : isOpen
  const setActiveSubmenu = parentMenu?.setActiveSubmenu
  const setShowDropDown = useCallback(
    (shouldOpen: boolean) => {
      if (setActiveSubmenu) {
        setActiveSubmenu(shouldOpen ? dropdownKey : undefined)
      } else {
        setIsOpen(shouldOpen)
      }
    },
    [dropdownKey, setActiveSubmenu],
  )

  const parentMenuRef = parentMenu?.menuRef
  const registerItem = parentMenu?.registerItem

  useLayoutEffect(() => {
    if (registerItem) {
      return registerItem(buttonRef)
    }
  }, [registerItem])

  const handleClose = (): void => {
    setShowDropDown(false)
    if (buttonRef?.current != null) {
      buttonRef.current.focus()
    }
  }

  useLayoutEffect(() => {
    if (!showDropDown) {
      return
    }

    const updatePosition = () => {
      const button = buttonRef.current
      const dropDown = dropDownRef.current

      if (!button || !dropDown) {
        return
      }

      const { bottom, left, right, top } = button.getBoundingClientRect()
      const gap = 5
      const maxLeft = window.innerWidth - dropDown.offsetWidth - gap
      const canOpenRight = right + gap <= maxLeft
      const canOpenLeft = left - dropDown.offsetWidth - gap >= gap
      const shouldStack = isSubmenu && !canOpenRight && !canOpenLeft
      const parentRect = parentMenuRef?.current?.getBoundingClientRect()
      let preferredLeft = left - gap
      let preferredTop = bottom + gap

      if (isSubmenu) {
        if (shouldStack) {
          // On narrow screens, stack below Add so both category buttons stay reachable.
          preferredLeft = parentRect?.left ?? left
          preferredTop = (parentRect?.bottom ?? bottom) + gap
        } else {
          preferredLeft = canOpenRight ? right + gap : left - dropDown.offsetWidth - gap
          preferredTop = top
        }
      }

      dropDown.style.maxHeight = shouldStack
        ? `${Math.max(80, window.innerHeight - preferredTop - gap)}px`
        : ''
      const maxTop = window.innerHeight - dropDown.offsetHeight - gap

      dropDown.style.top = `${Math.max(gap, Math.min(preferredTop, maxTop)) + window.scrollY}px`
      dropDown.style.left = `${Math.max(gap, Math.min(preferredLeft, maxLeft)) + window.scrollX}px`
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isSubmenu, parentMenuRef, showDropDown])

  useEffect(() => {
    const button = buttonRef.current

    if (button !== null && showDropDown) {
      const handle = (event: MouseEvent): void => {
        const target = event.target
        if (!isDOMNode(target)) {
          return
        }
        if (stopCloseOnClickSelf) {
          if (dropDownRef.current && dropDownRef.current.contains(target)) {
            return
          }
        }
        if (!button.contains(target)) {
          setShowDropDown(false)
        }
      }
      document.addEventListener('click', handle)

      return () => {
        document.removeEventListener('click', handle)
      }
    }
  }, [dropDownRef, buttonRef, setShowDropDown, showDropDown, stopCloseOnClickSelf])

  const portal = createPortal(
    <DropDownItems
      dropDownRef={dropDownRef}
      isSubmenu={isSubmenu}
      itemsContainerClassNames={itemsContainerClassNames}
      onClose={handleClose}
    >
      {children}
    </DropDownItems>,
    document.body,
  )

  return (
    <React.Fragment>
      <button
        aria-expanded={showDropDown}
        aria-haspopup="true"
        aria-label={buttonAriaLabel}
        className={buttonClassName + (showDropDown ? ' active' : '')}
        data-dropdown-key={dropdownKey}
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault()
          if (isSubmenu) {
            // Keep the parent menu mounted while its child dropdown is open.
            event.stopPropagation()
          }
          if (showDropDown) {
            handleClose()
          } else {
            setShowDropDown(true)
          }
        }}
        onKeyDown={(event) => {
          if (isSubmenu && event.key === 'ArrowRight') {
            event.preventDefault()
            event.stopPropagation()
            setShowDropDown(true)
          }
        }}
        onMouseDown={(e) => {
          // This fixes a bug where you are unable to click the button if you are in a NESTED editor (editor in blocks field in editor).
          // Thus only happens if you click on the SVG of the button. Clicking on the outside works. Related issue: https://github.com/payloadcms/payload/issues/4025
          // TODO: Find out why exactly it happens and why e.preventDefault() on the mouseDown fixes it. Write that down here, or potentially fix a root cause, if there is any.
          e.preventDefault()
        }}
        ref={buttonRef}
        type="button"
      >
        {Icon && <Icon />}
        {label && <span className="toolbar-popup__dropdown-label">{label}</span>}
        <i className="toolbar-popup__dropdown-caret" />
      </button>

      {showDropDown && <React.Fragment>{portal}</React.Fragment>}
    </React.Fragment>
  )
}
