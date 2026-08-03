// 图鉴逻辑（占位）。
//
// 「纯本地功能」分区：与原生界面零交互。可由 AI 文本派生态触发解锁，
// 但解锁后的图鉴数据是本地状态，用 CUSTOM_ 存档持久化。
//
// 约束：纯函数/纯逻辑，不 import Vue、不碰 DOM、不碰 Bridge。

export interface CodexEntry {
  id: string
  title: string
  unlocked: boolean
  description: string
}

export interface CodexModel {
  entries: CodexEntry[]
}

export function createEmptyCodex(): CodexModel {
  return { entries: [] }
}

// TODO: 解锁、分类、检索等图鉴规则在此实现。
