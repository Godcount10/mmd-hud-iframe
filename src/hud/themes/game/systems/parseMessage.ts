// AI 文本派生状态解析。
//
// 职责：从只读的消息文本里提取形如 [A=B] 的标记，转成结构化 DerivedStat。
// 这是「AI 文本派生状态」分区的入口。
//
// 约束：
// - 纯函数，无副作用，不 import Vue、不碰 DOM。
// - 只读输入，绝不回写 Bridge 快照（README 第 9 节原则 1）。
// - 输入用哪一份文本（message.text 还是 message.html）由调用方决定；
//   本模块只认字符串，取决于原生正则把 [A=B] 抹在哪一层。

import type { ChatMessage } from '../../../../contracts'
import type { DerivedStat, ParseResult } from '../types'

/**
 * 匹配 [键=值]。
 * - 键、值都不含 '='、']'，避免贪婪跨越多个标记。
 * - 值允许为空（[A=]），交给上层决定是否丢弃。
 */
const STAT_PATTERN = /\[([^\]=]+)=([^\]]*)\]/g

/** 正则的可读文本，供调试面板展示当前解析规则。 */
export const STAT_PATTERN_SOURCE = STAT_PATTERN.source

/** 从单条文本里提取所有 [A=B]。晚出现的同名键覆盖早出现的，保证“最新值优先”。 */
export function parseStatsFromText(text: string, sourceMessageId: string): DerivedStat[] {
  const byKey = new Map<string, DerivedStat>()
  for (const match of text.matchAll(STAT_PATTERN)) {
    const key = match[1].trim()
    const value = match[2].trim()
    if (!key) continue
    byKey.set(key, { key, value, sourceMessageId })
  }
  return [...byKey.values()]
}

/**
 * 遍历消息列表，用“后出现覆盖先出现”的规则合并同名状态，
 * 得到当前应显示的一组派生状态。
 *
 * @param messages 当前快照的消息（已按时间顺序）。
 * @param pick 从一条消息里取用于解析的文本，默认取纯文本。
 */
export function parseMessages(
  messages: readonly ChatMessage[],
  pick: (message: ChatMessage) => string = (message) => message.text,
): ParseResult {
  const merged = new Map<string, DerivedStat>()
  for (const message of messages) {
    for (const stat of parseStatsFromText(pick(message), message.id)) {
      merged.set(stat.key, stat)
    }
  }
  return { stats: [...merged.values()] }
}

/** 单条消息的解析诊断，供调试面板可视化。 */
export interface MessageParseDiagnostic {
  messageId: string
  role: ChatMessage['role']
  /** 用于解析的文本（可能是 text 或 html），已截断预览。 */
  textPreview: string
  /** 这条消息命中的标记数。 */
  matched: number
  /** 命中的键，按出现顺序。 */
  keys: string[]
}

/** 整体解析诊断，供调试面板展示成败与来源。 */
export interface ParseDiagnostics {
  /** 扫描的消息总数。 */
  totalMessages: number
  /** 至少命中一条标记的消息数。 */
  messagesWithMatch: number
  /** 全部命中的标记总数（未去重前）。 */
  totalMatches: number
  /** 合并去重后最终生效的状态。 */
  result: ParseResult
  /** 逐条消息的明细。 */
  perMessage: MessageParseDiagnostic[]
}

const PREVIEW_LENGTH = 60

/**
 * 与 parseMessages 同源的诊断版：额外返回逐条命中情况，不改变解析规则。
 * 调试面板用它展示“读了几条、命中几条、失败几条”。
 */
export function diagnoseMessages(
  messages: readonly ChatMessage[],
  pick: (message: ChatMessage) => string = (message) => message.text,
): ParseDiagnostics {
  const merged = new Map<string, DerivedStat>()
  const perMessage: MessageParseDiagnostic[] = []
  let totalMatches = 0
  let messagesWithMatch = 0

  for (const message of messages) {
    const text = pick(message)
    const stats = parseStatsFromText(text, message.id)
    if (stats.length > 0) messagesWithMatch += 1
    totalMatches += stats.length
    for (const stat of stats) merged.set(stat.key, stat)
    perMessage.push({
      messageId: message.id,
      role: message.role,
      textPreview: text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text,
      matched: stats.length,
      keys: stats.map((stat) => stat.key),
    })
  }

  return {
    totalMessages: messages.length,
    messagesWithMatch,
    totalMatches,
    result: { stats: [...merged.values()] },
    perMessage,
  }
}
