import { ref, type Ref } from 'vue'

export type GameView = 'dialogue' | 'settings'
export type GameOverlay =
  | { type: 'codex' }
  | { type: 'map' }
  | { type: 'auto-injection' }
  | { type: 'rollback-confirm'; messageId: string }
  | { type: 'exit-confirm' }
  | null

export interface GameNavigation {
  view: Ref<GameView>
  overlay: Ref<GameOverlay>
  menuOpen: Ref<boolean>
  showDialogue(): void
  showSettings(): void
  openOverlay(overlay: Exclude<GameOverlay, null>): void
  closeOverlay(): void
  openMenu(): void
  closeMenu(): void
}

export function useGameNavigation(): GameNavigation {
  const view = ref<GameView>('dialogue')
  const overlay = ref<GameOverlay>(null)
  const menuOpen = ref(false)

  return {
    view,
    overlay,
    menuOpen,
    showDialogue() {
      view.value = 'dialogue'
      menuOpen.value = false
    },
    showSettings() {
      view.value = 'settings'
      menuOpen.value = false
    },
    openOverlay(nextOverlay) {
      menuOpen.value = false
      overlay.value = nextOverlay
    },
    closeOverlay() {
      overlay.value = null
    },
    openMenu() {
      overlay.value = null
      menuOpen.value = true
    },
    closeMenu() {
      menuOpen.value = false
    },
  }
}
