import GameHud from './GameHud.vue'
import gameStyles from './game.css?inline'
import dialogueStyles from './styles/dialogue-theme.css?inline'
import bridgeConsoleStyles from './components/bridgeConsole.css?inline'
import type { HudThemeDefinition } from '../types'

export const gameTheme: HudThemeDefinition = {
  id: 'game',
  name: '游戏 HUD',
  component: GameHud,
  styles: `${bridgeConsoleStyles}\n${gameStyles}\n${dialogueStyles}`,
}
