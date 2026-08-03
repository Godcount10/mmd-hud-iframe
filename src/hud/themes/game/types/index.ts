// 游戏 HUD 自己的数据结构。
//
// 这些类型只属于游戏层，不与 Bridge 协议（src/contracts）共享。
// 约束：本目录只放纯数据结构，不 import Vue、不碰 DOM。

/** 从 AI 文本中解析出的一条派生状态，例如 [好感度=80] → { key: '好感度', value: '80' }。 */
export interface DerivedStat {
  /** 状态名，例如“好感度”。 */
  key: string
  /** 状态原始文本值，例如 "80"。保持字符串，具体解读交给显示层。 */
  value: string
  /** 该状态来自哪条消息（快照 message.id）。仅用于调试/溯源，不作持久化主键。 */
  sourceMessageId: string
}

/** 一次解析的产出：从若干条消息里提取到的全部派生状态。 */
export interface ParseResult {
  stats: DerivedStat[]
}

/** 状态栏的显示样式。同一份 DerivedStat 可以用不同样式渲染。 */
export type StatDisplayKind = 'text' | 'bar' | 'badge'

/** 状态栏里的一项，已经从原始 DerivedStat 归一化为可直接渲染的模型。 */
export interface StatBarItem {
  key: string
  /** 面向玩家显示的值（可能与原始 value 不同，例如百分比补 %）。 */
  displayValue: string
  /** 数值化后的值，供 bar 样式使用；无法数值化时为 null。 */
  numeric: number | null
  kind: StatDisplayKind
}

/** 整个游戏层对外暴露的可持久化状态。写入 CUSTOM_ 存档时以此为准。 */
export interface GameState {
  /** 存档版本号，用于未来迁移。 */
  version: number
  /** 最近一次解析得到的状态栏项。 */
  statBar: StatBarItem[]
}

export const GAME_STATE_VERSION = 1
