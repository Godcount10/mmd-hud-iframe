// 游戏响应式状态 + CUSTOM_ 存档。
//
// 职责：持有 systems/ 计算出的结果，供组件订阅；负责持久化。
// 这是 systems（纯逻辑）和 components（渲染）之间的响应式桥。
//
// 约束：
// - 只读写自己的 CUSTOM_ 前缀 key（README 第 9 节存档约束）。
// - 不枚举 MMD 内部 key、不读认证信息。
// - 存档带版本号，提供容错。

import { shallowRef, type Ref } from 'vue'
import { GAME_STATE_VERSION, type GameState, type StatBarItem } from '../types'

const STORAGE_KEY = 'CUSTOM_MMD_GAME_STATE_V1'
const PERSIST_DEBOUNCE_MS = 200

function createDefaultState(): GameState {
  return { version: GAME_STATE_VERSION, statBar: [] }
}

/** 读取存档，版本不符或损坏时回退到默认值（容错，不抛错）。 */
function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const parsed = JSON.parse(raw) as Partial<GameState>
    if (parsed.version !== GAME_STATE_VERSION) {
      // TODO: 未来版本在此做迁移，暂时直接回退默认。
      return createDefaultState()
    }
    return { version: GAME_STATE_VERSION, statBar: parsed.statBar ?? [] }
  } catch {
    return createDefaultState()
  }
}

function saveSerializedState(serialized: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serialized)
    return true
  } catch {
    // 存储不可用（隐私模式/配额）时静默失败，不影响游戏运行。
    return false
  }
}

export interface GameStore {
  state: Ref<GameState>
  setStatBar(items: StatBarItem[]): boolean
  /** 合并高频更新；immediate 用于流结束等必须立刻落盘的边界。 */
  persist(immediate?: boolean): void
  dispose(): void
}

function sameStatBar(current: readonly StatBarItem[], next: readonly StatBarItem[]): boolean {
  return current.length === next.length
    && JSON.stringify(current) === JSON.stringify(next)
}

/** 创建一个游戏状态仓库。每个 theme 实例一个。 */
export function createGameStore(): GameStore {
  const state = shallowRef<GameState>(loadState())
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let lastPersisted = JSON.stringify(state.value)

  function flushPersist(): void {
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    const serialized = JSON.stringify(state.value)
    if (serialized === lastPersisted) return
    if (saveSerializedState(serialized)) lastPersisted = serialized
  }

  return {
    state,
    setStatBar(items) {
      if (sameStatBar(state.value.statBar, items)) return false
      state.value = { ...state.value, statBar: items }
      return true
    },
    persist(immediate = false) {
      if (immediate) {
        flushPersist()
        return
      }
      if (persistTimer !== null) clearTimeout(persistTimer)
      persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS)
    },
    dispose() {
      flushPersist()
    },
  }
}
