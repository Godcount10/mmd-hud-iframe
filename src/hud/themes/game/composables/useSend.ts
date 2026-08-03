// 发送包装：自动提示词 → 原生发送。
//
// 职责：把游戏层拼好的文本通过 Bridge 已有的 sendMessage 动作发出。
// 这是「纯本地功能」中唯一触达原生的路径，且只复用现有动作，不新增 Bridge 能力。
//
// 约束：发送成功只代表原生发送动作成功；AI 回复要继续观察 snapshot
// （README 第 9 节原则 3）。

import { useHudContext } from '../../../context'
import { buildOutgoingText } from '../systems/autoPrompt'

export interface SendHelpers {
  /** 发送玩家文本，可附带自动追加的提示片段。返回原生动作是否成功。 */
  send(userText: string, appended?: string[]): Promise<boolean>
}

export function useSend(): SendHelpers {
  const { snapshot, invoke } = useHudContext()

  return {
    async send(userText, appended = []) {
      if (!snapshot.value.capabilities.sendMessage.available) return false
      const text = buildOutgoingText({ userText, appended })
      if (!text) return false
      const result = await invoke('sendMessage', { text })
      return result.ok
    },
  }
}
