import { useEffect } from "react"
import { UI_CONSTANTS } from "@/lib/constants"

interface UseKeyboardShortcutsProps {
  isActive: boolean
  onToggleFreeze: () => void
}

export function useKeyboardShortcuts({ isActive, onToggleFreeze }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== UI_CONSTANTS.SHORTCUTS.FREEZE) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (!isActive) return
      e.preventDefault()
      onToggleFreeze()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isActive, onToggleFreeze])
}
