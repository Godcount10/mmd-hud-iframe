// 把 Bridge 快照喂给游戏解析链路。
//
// 职责：订阅只读的 snapshot.messages → parseMessages → buildStatBar → store。
// 这是「AI 文本派生状态」链路在 Vue 侧的接线，是游戏层唯一读取 Bridge 数据之处。
//
// 约束：只读 snapshot，绝不回写（README 第 9 节原则 1）。

import { getCurrentScope, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { ChatMessage } from '../../../../contracts'
import { useHudContext } from '../../../context'
import {
  diagnoseMessages,
  type MessageParseDiagnostic,
  type ParseDiagnostics,
} from '../systems/parseMessage'
import type { DerivedStat } from '../types'
import { buildStatBar, type StatDisplayConfig } from '../systems/stateBar'
import type { GameStore } from '../stores/gameStore'

/** 解析的文本来源：读纯文本还是 HTML。取决于原生正则把 [A=B] 抹在哪一层。 */
export type ParseSource = 'text' | 'html'

export interface GameFeed {
  /** 最近一次解析诊断，供调试面板可视化。 */
  diagnostics: Ref<ParseDiagnostics>
}

interface CachedMessageParse {
  id: string
  role: ChatMessage['role']
  source: string
  stats: DerivedStat[]
  diagnostic: MessageParseDiagnostic
}

function parseMessage(
  message: ChatMessage,
  text: string,
  diagnose: typeof diagnoseMessages,
): CachedMessageParse {
  const diagnostics = diagnose([message], () => text)
  return {
    id: message.id,
    role: message.role,
    source: text,
    stats: diagnostics.result.stats,
    diagnostic: diagnostics.perMessage[0],
  }
}

/**
 * 保留与 diagnoseMessages 完全相同的合并语义，但复用未变化消息的单条解析结果。
 * Bridge 每次发布新快照都会换数组；同 id/source/role 的消息无需再跑正则。
 */
export function createIncrementalMessageDiagnoser(
  pick: (message: ChatMessage) => string,
  diagnose: typeof diagnoseMessages = diagnoseMessages,
): (messages: readonly ChatMessage[]) => ParseDiagnostics {
  let previous: CachedMessageParse[] = []

  return (messages) => {
    let byId: Map<string, CachedMessageParse> | undefined
    const next: CachedMessageParse[] = []
    const merged = new Map<string, DerivedStat>()
    const perMessage: MessageParseDiagnostic[] = []
    let totalMatches = 0
    let messagesWithMatch = 0

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]
      const text = pick(message)
      const positional = previous[index]
      let candidate = positional?.id === message.id ? positional : undefined
      if (!candidate && previous.length > 0) {
        byId ??= new Map(previous.map((entry) => [entry.id, entry]))
        candidate = byId.get(message.id)
      }
      const cached = candidate
        && candidate.source === text
        && candidate.role === message.role
        ? candidate
        : parseMessage(message, text, diagnose)

      next.push(cached)
      perMessage.push(cached.diagnostic)
      if (cached.stats.length > 0) messagesWithMatch += 1
      totalMatches += cached.stats.length
      for (const stat of cached.stats) merged.set(stat.key, stat)
    }

    previous = next
    return {
      totalMessages: messages.length,
      messagesWithMatch,
      totalMatches,
      result: { stats: [...merged.values()] },
      perMessage,
    }
  }
}

export function useGameFeed(
  store: GameStore,
  config?: StatDisplayConfig,
  source: ParseSource = 'text',
): GameFeed {
  const { snapshot } = useHudContext()
  const pick = source === 'html' ? (m: ChatMessage) => m.html : (m: ChatMessage) => m.text
  const diagnoseIncrementally = createIncrementalMessageDiagnoser(pick)

  const diagnostics = shallowRef<ParseDiagnostics>({
    totalMessages: 0,
    messagesWithMatch: 0,
    totalMatches: 0,
    result: { stats: [] },
    perMessage: [],
  })

  watch(
    // 只依赖消息，避免面板等无关快照变化触发重算。
    () => snapshot.value.messages,
    (messages) => {
      const diag = diagnoseIncrementally(messages)
      diagnostics.value = diag
      const isStreaming = messages.some((message) => message.streaming)
      if (store.setStatBar(buildStatBar(diag.result.stats, config))) {
        // 流式 token 合并写入；普通更新和流结束立即提交最终值。
        store.persist(!isStreaming)
      }
    },
    { immediate: true },
  )

  if (getCurrentScope()) onScopeDispose(() => store.dispose())

  return { diagnostics }
}
