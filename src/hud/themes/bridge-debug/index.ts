import BridgeDebugHud from './BridgeDebugHud.vue'
import styles from './bridge-debug.css?inline'
import type { HudThemeDefinition } from '../types'

export const bridgeDebugTheme: HudThemeDefinition = {
  id: 'bridge-debug',
  name: 'Bridge 全量实验室',
  component: BridgeDebugHud,
  styles,
}
