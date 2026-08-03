import type { App, Component } from 'vue'

export interface HudThemeDefinition {
  id: string
  name: string
  component: Component
  styles?: string
  install?: (app: App) => void
}
