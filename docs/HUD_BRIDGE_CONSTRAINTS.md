# HUD 与 Bridge 约束提醒

> HUD 负责界面与流程状态；Bridge 负责原生状态和最终安全校验。HUD 不能替代或绕过 Bridge。

## 必须遵守

1. **MMD/Bridge 是唯一真实状态源**：HUD 只消费 Snapshot，不自行维护原生状态副本。
2. **HUD 不访问父页面 DOM**：selector、reader、observer 和 handler 只能在父页面 Bridge 中运行。
3. **跨边界只传纯数据**：不得传递 DOM、Window、Event、函数、Vue Proxy、ref 或其他不可结构化克隆对象。
4. **Capability 不是最终授权**：HUD 只能据此控制界面；每次 action 仍由 Bridge 重新读取并校验实时 DOM。
5. **破坏性动作必须两阶段确认**：HUD 必须保存并提交 Bridge 返回的 token，不得自行生成、修改、复制或替换 token。
6. **稳定引用不可被重新选择覆盖**：`conversationId`、`messageId`、`fingerprint`、`index` 必须来自当前有效 Snapshot 或 pending confirmation。
7. **确认状态必须区分来源**：原生 capability available 不等于 HUD 已拥有可提交 token；两者不能混用。
8. **状态最终回归 Snapshot**：ActionResult 只表示本次调用结果，不能作为长期原生状态；兼容 Snapshot 与 ActionResult 的不同到达顺序。
9. **失败必须保持安全**：目标缺失、过期、重排、替换、重复提交或状态不明确时，显示不可用并交由 Bridge 拒绝。
10. **不通过删契约或宽泛 `any` 绕过问题**：所有 NativeAction 都必须保留完整契约和明确的不可用原因。

## 两阶段动作标准流程

```text
HUD 发起第一阶段 action
→ Bridge 验证实时目标并返回 confirmation-required + token
→ HUD 保存并展示 pending confirmation
→ 用户二次确认
→ HUD 原样提交 token payload
→ Bridge 再次验证 token、TTL、目标和 DOM
→ 成功后以最新 Snapshot 作为最终显示状态
```

## 禁止事项

- 不让 Bridge 读取或依赖 HUD/Vue 状态；
- 不把 HUD 的本地选择当作破坏性动作的最终授权；
- 不因 HUD 没有 token 而放宽 Bridge 校验；
- 不让 `deleteConversation`、`deleteMessage` 等动作绕过 token 流程；
- 不用手工重新选择目标替代已生成的 confirmation token。
