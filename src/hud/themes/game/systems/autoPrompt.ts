// 自动追加提示词（占位）。
//
// 「纯本地功能」分区中唯一需要触达原生的：产出的文本最终要通过
// Bridge 的 invoke('sendMessage', { text }) 发送——但这只复用已有动作，
// 不新增任何 Bridge 能力。
//
// 约束：本模块只做纯字符串拼接，产出“待发送文本”。
// 真正的发送交给 composables/useSend，本模块不碰 Bridge、不碰 Vue。

export interface AutoPromptOptions {
  /** 玩家原始输入。 */
  userText: string
  /** 需要自动追加的提示片段，按顺序拼接。 */
  appended: string[]
}

/** 把自动提示词拼到玩家输入上，产出最终待发送文本。 */
export function buildOutgoingText(options: AutoPromptOptions): string {
  const parts = [options.userText.trim(), ...options.appended.map((part) => part.trim())]
  return parts.filter(Boolean).join('\n')
}

// TODO: 根据地图/图鉴/状态栏动态决定 appended 内容。
