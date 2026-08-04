# Bridge 原生能力开发指南

本文面向需要让 HUD 读取或操作新的 MMD 原生功能的开发者。

如果功能只是 HUD 内部地图、图鉴、动画、AI 文本解析或本地存档，不应扩展 Bridge；请阅读 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。理解完整调用链前先阅读 [整体架构与实现](ARCHITECTURE.md)。

---

## 1. 何时应该新增 NativeAction

只有功能确实需要操作或读取新的 MMD 原生能力时才扩展，例如：

- 打开新的 MMD 原生面板；
- 选择原生模型或会话；
- 提交原生设置；
- 操作原生消息；
- 获取 Theme 必须显示的新原生状态。

通常不应新增 Action：

- 打开 HUD 内部地图或图鉴；
- 切换 Theme 页面；
- 本地动画和音效；
- 从消息解析游戏状态；
- 本地存档；
- 自动提示词拼接。

自动提示词最终可以复用 sendMessage。

---

## 2. 标准修改顺序

### 1. 契约

在 `src/contracts/bridge.ts` 增加：

- NativeAction；
- payload 类型和映射；
- result data 类型；
- 必要的 Snapshot 子结构；
- 对象级 capability（如果需要）。

不要通过删除现有 Action 或使用 any 换取编译通过。

### 2. Runtime decoder

在 `src/protocol/guards.ts` 增加 payload 校验：

- 只接受预期字段；
- 字符串非空和长度限制；
- ID/reference 结构；
- 枚举值；
- 未知字段 fail closed。

TypeScript 不能验证跨窗口输入。

### 3. Selector 与 resolver

在 `src/bridge/mmd/` 集中增加结构识别：

- selector 放入 selectors.ts；
- resolver 验证可见性、唯一性和结构；
- reader 只返回纯数据；
- 不把 selector 复制进 Theme；
- 不跨 Snapshot revision 缓存 DOM 节点。

### 4. Snapshot reader 与 capability

读取新状态，并为所有相关 action 动态计算 capability：

- 面板/入口是否存在；
- 当前生成状态是否允许；
- 目标是否仍然有效；
- handler 是否已注册；
- 失败时提供 reason。

### 5. Action handler

在 actionRegistry 注册 handler：

- 重新绑定 live DOM；
- 验证 payload/stable reference；
- 执行原生 setter/event/click；
- 等待可观察后置条件；
- 支持 timeout 和 AbortSignal；
- 将错误转成 ActionResult。

### 6. Debug manifest

更新 bridge-debug：

- actionDebugManifest；
- payload form；
- guided workflow；
- dangerous/confirm 标记；
- 导出脱敏规则（如包含敏感数据）。

### 7. Mock

在 `src/dev/mockMmd.ts` 提供足够真实的：

- DOM 层级；
- 可见性；
- 异步加载；
- toggle/open/close 行为；
- selected 状态；
- 成功和失败路径。

### 8. 测试

覆盖：

- decoder；
- capability；
- resolver；
- handler 成功/失败；
- stale target；
- timeout/cancel；
- 幂等 open/close；
- Snapshot 延迟和异步列表。

### 9. 真实 MMD 回归

Mock 通过后逐项验证真实页面。Mock 不能证明中文文案、层级、动画和移动端结构未变化。

---

## 3. Resolver 是唯一 DOM 定位来源

同一个目标的 capability 和 handler 必须调用同一 resolver。

正确：

```ts
resolveModelPanel(document)
resolveModelPanelClose(panel)
```

两处复用：

```text
Snapshot capability → resolver
Action handler      → resolver
```

禁止分别维护：

```ts
// capability
panel.querySelector(closeSelector)

// handler
panel.closest(popupSelector)?.querySelector(closeSelector)
```

否则会产生“按钮不可用但 handler 本来能执行”。

Resolver 应验证：

- element.isConnected；
- display/visibility/opacity；
- rect 尺寸；
- 唯一匹配；
- 容器层级；
- label/icon/结构签名；
- 目标属于预期 document。

多个相似目标时必须 fail closed，不选“第一个看起来像”的元素。

---

## 4. open / close 必须幂等

### openXxx

语义是“确保打开”：

```text
已经打开 → 直接返回成功和当前 reader 数据
未打开   → 点击入口并等待打开
```

如果原生入口是 toggle，禁止在已经打开时再次点击。

### closeXxx

语义是“确保关闭”：

```text
已经关闭 → 幂等成功，可返回 alreadyClosed
仍然打开 → 找到关闭按钮并等待关闭
```

只有契约明确命名 toggleXxx 时才允许反转状态。

### Capability

面板打开时，一般应：

```text
openXxx  = unavailable（already open）
closeXxx = available
```

即使 capability 因 Snapshot 滞后，handler 的幂等保护仍不可省略。

---

## 5. Handler 不是“点击器”

一个正确 handler 包含：

```text
解析 payload
  → resolve live target
  → 验证目标/结构
  → 检查 AbortSignal
  → 执行原生操作
  → 等待后置条件
  → 读取结果
  → ActionResult
```

不要“dispatch click 后立即 ok”。

可观察后置条件示例：

- panel 出现或消失；
- selected class 改变；
- 列表内容改变；
- 消息数量/文本改变；
- 原生确认结构出现；
- 目标元素被移除；
- 配置控件值变化。

如果后置条件不成立，返回 TIMEOUT；DOM 结构漂移或目标不再匹配时返回 PLATFORM_CHANGED/NOT_FOUND。

---

## 6. Stable reference 与陈旧目标

不要只传数组下标或可见文字。

按目标类型组合：

- stable/local ID；
- fingerprint；
- native index；
- role；
- label；
- DOM identity；
- revision；
- 结构签名。

执行时必须从 live DOM 重新定位。Snapshot 中目标存在不保证执行时仍存在。

### 消息

运行时 message ID 不适合作为永久业务主键。敏感动作结合 targetFingerprint 和 nativeIndex。

### 会话

使用 conversationId + fingerprint + index，重命名/删除前重新验证。

### 模型

稳定 ID 应由模型可观察字段生成，执行时在当前面板重新查找。配置层可能覆盖模型列表，需要处理可见层级。

### 指令

使用 instructionId + selector revision + fingerprint + label + index。

---

## 7. 破坏性动作

消息和会话删除使用 Bridge 强制两阶段确认。

第一阶段：

- 验证目标和原生确认结构；
- 不执行最终删除；
- 返回短 TTL confirmationToken。

第二阶段：

- 验证 token、TTL、目标 ID、fingerprint、index、DOM identity；
- 重新绑定 live 目标；
- 执行原生确认；
- 验证只删除了目标。

测试必须覆盖：

- token replay；
- token 过期；
- target stale；
- list reorder；
- 目标已删除；
- 错误确认结构。

Theme 的确认 UI不能替代 Bridge token 安全边界。

---

## 8. Capability 设计

Capability 是当前 Snapshot 下的 UI 门禁，不是 handler 安全验证的替代品。

Capability reason 应具体，例如：

- 原生面板尚未打开；
- AI 正在生成；
- 输入框禁用；
- 目标已失效；
- 关闭按钮尚未加载；
- action 只有契约没有 handler；
- DOM 结构不完整。

规则：

- 所有 Action 始终有 capability；
- reader 异常时全部原生能力 fail closed；
- capability 和 handler 复用 resolver；
- handler 执行时再次验证；
- Theme 应显示 reason。

---

## 9. Reader 与 Snapshot

Reader：

- 输入 document/明确容器；
- 输出可结构化克隆的纯数据；
- 不返回 DOM；
- 不修改页面；
- 不保存跨 revision 节点；
- 缺失结构时返回明确 closed/empty 或抛出平台变化错误。

高频 Snapshot 读取应使用 snapshotQueryCache 缓存单次查询，但不能跨 revision 缓存。

新增 Snapshot 字段后同步更新：

- EMPTY/disconnected snapshot；
- tests helper snapshot；
- runtime decoder；
- Host/Frame 测试；
- 调试导出脱敏。

---

## 10. ActionResult 与 Snapshot

ActionResult 与 Snapshot 是独立链路。Handler 可以在 data 中返回本次操作读取结果，但它不取代全局 Snapshot。

设计 result data 时：

- 返回调用者推进事务所需的最小数据；
- 不返回 DOM 或函数；
- 不复制无关完整 Snapshot；
- 确保 toWireValue 可接受；
- 标明 phase/status；
- Theme 最终应回归 Snapshot。

例如 open panel 可以返回 panel snapshot，以便 UI 结束 opening；随后全局 Snapshot 接管长期渲染。

---

## 11. Abort 与 timeout

handler 内所有 wait 必须：

- 有上限 timeout；
- 监听 AbortSignal；
- 清理 observer、timer、RAF 和 abort listener；
- action 取消后不继续发送成功结果。

当前 HostSession cancel 尚未把 signal 完整贯穿 NativeGateway，但 Bridge destroy 会 abort 自身 action。端到端取消属于 [架构优化路线图](ROADMAP.md)。

即使未来 signal 贯穿，已经发生的原生 click 也不保证回滚；必须在关键副作用前检查 aborted。

---

## 12. Mock 与测试矩阵

### Resolver

- 未找到；
- 唯一匹配；
- 多匹配；
- 隐藏元素；
- 兄弟/叠层容器；
- 被替换节点。

### Capability

- 前置状态满足/不满足；
- generation idle/non-idle；
- panel open/closed；
- handler registered/contract-only；
- resolver reason。

### Handler

- 正常成功；
- 已打开再次 open；
- 已关闭再次 close；
- payload 无效；
- stale target；
- timeout；
- abort；
- DOM 结构变化。

### 异步结构

- shell 先出现、rows 后加载；
- ActionResult 与 Snapshot 不同顺序；
- 动画期间可见性变化；
- 顶层配置关闭后底层列表重新显现。

### 协议

- payload runtime decoder；
- action/request/response 关联；
- malformed input fail closed；
- Wire 数据边界。

---

## 13. bridge-debug 验证

新增动作后在 bridge-debug 检查：

- action 是否出现在正确分组；
- registered/contract-only 标记；
- capability 和 reason；
- payload 是否来自最新 Snapshot；
- ActionResult data/error；
- Snapshot revision/diff；
- BridgeEvent；
- 确认 token；
- 默认导出是否脱敏。

完整导出可能包含聊天、人设、设定和链接，不应公开上传。

---

## 14. 真实 MMD 回归记录

每项 action 建议记录：

```text
action
前置页面/面板状态
预期 capability
payload 来源
可观察后置条件
桌面/移动端
通过日期
关键 DOM 结构签名
```

真实回归优先覆盖实例实际依赖的动作，再持续扩展到全部 registered handler。

---

## 15. 完成检查清单

- [ ] 契约和 payload 类型完整；
- [ ] runtime decoder 拒绝畸形输入；
- [ ] selector 集中管理；
- [ ] capability 与 handler 共用 resolver；
- [ ] open/close 幂等；
- [ ] handler 重验 live DOM；
- [ ] 后置条件可观察；
- [ ] wait 有 timeout/Abort/cleanup；
- [ ] stable reference 不只依赖下标或文字；
- [ ] destructive flow 不绕过两阶段确认；
- [ ] Snapshot/disconnected/helper 已更新；
- [ ] bridge-debug manifest/payload/export 已更新；
- [ ] Mock 覆盖真实层级和异步时序；
- [ ] typecheck/tests/build 通过；
- [ ] 真实 MMD 已回归该动作的成功和失败路径。
