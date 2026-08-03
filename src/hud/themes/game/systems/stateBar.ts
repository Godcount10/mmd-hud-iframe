// 派生状态 → 状态栏显示模型。
//
// 职责：把 parseMessage 产出的 DerivedStat 归一化为可直接渲染的 StatBarItem，
// 决定每一项用哪种显示样式（文字 / 进度条 / 徽标）。
//
// 约束：纯函数，不 import Vue、不碰 DOM。显示样式是数据决策，
// 具体怎么画是组件层的事。

import type { DerivedStat, StatBarItem, StatDisplayKind } from '../types'

/** 每个状态名可配置的显示规则。未配置的键走默认（text）。 */
export interface StatDisplayRule {
  kind: StatDisplayKind
  /** bar 样式的最大值，用于把 numeric 换算成百分比。 */
  max?: number
  /** 显示值后缀，例如 '%'。 */
  suffix?: string
}

export type StatDisplayConfig = Record<string, StatDisplayRule>

/** 默认把常见的“好感度”类数值配成进度条，其余走文字。可按玩法覆盖。 */
export const DEFAULT_STAT_DISPLAY: StatDisplayConfig = {
  好感度: { kind: 'bar', max: 100 },
}

function toNumeric(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function buildStatBar(
  stats: readonly DerivedStat[],
  config: StatDisplayConfig = DEFAULT_STAT_DISPLAY,
): StatBarItem[] {
  return stats.map((stat): StatBarItem => {
    const rule = config[stat.key]
    const numeric = toNumeric(stat.value)
    const kind: StatDisplayKind = rule?.kind ?? 'text'
    const suffix = rule?.suffix ?? ''
    return {
      key: stat.key,
      displayValue: `${stat.value}${suffix}`,
      numeric,
      kind,
    }
  })
}
