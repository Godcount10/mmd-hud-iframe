// 地图逻辑（占位）。
//
// 「纯本地功能」分区：与原生界面零交互，只有本地状态 + 渲染。
// 逻辑放这里，响应式状态放 stores/，持久化用 CUSTOM_ 存档。
//
// 约束：纯函数/纯逻辑，不 import Vue、不碰 DOM、不碰 Bridge。

export interface MapNode {
  id: string
  label: string
  visited: boolean
}

export interface MapModel {
  nodes: MapNode[]
  currentNodeId: string | null
}

export function createEmptyMap(): MapModel {
  return { nodes: [], currentNodeId: null }
}

// TODO: 移动、解锁、路径计算等地图规则在此实现。
