# 架构优化路线图

本文面向后续架构维护者，记录在当前主干不推倒重写的前提下可以逐步实施的加固方向。它不是当前代码行为说明，也不是要求一次完成的任务清单；现行行为以源码、测试、[整体架构与实现](ARCHITECTURE.md)为准，实例规则见 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。

本文的目标是让后续维护者能够回答：

- 当前架构哪里已经足够稳定；
- 哪些问题可以通过实例规范避免；
- 哪些问题最终需要跨 Host/Frame/Protocol 加固；
- 每项优化的边界、风险和验收标准是什么。

---

## 1. 当前架构判断

### 1.1 不建议改变的主干

以下方向成立，应继续保留：

```text
MMD DOM Adapter
  → MmdNativeBridge
  → NativeGateway / HostSession
  → MessagePort Protocol
  → HostClient / HudContext
  → Theme
```

必须继续保持：

- MMD 是登录、消息、会话、模型和原生设置的唯一真实状态源；
- selector、reader、observer 和 handler 仅运行在父页面；
- iframe Theme 不访问父页面 DOM；
- 业务通信只走一次性 MessagePort；
- 跨窗口只传经过 decoder 和 Wire 净化的纯数据；
- 每次 reload 使用新的 bootstrap/channel/session；
- capability fail closed；
- Theme、Bridge、Host 和 Protocol 依赖方向不倒置。

目前没有证据支持改回同 Realm、开放 `allow-same-origin`、让 Theme 直连 MMD DOM，或在 Frame 内复制 MMD 状态系统。

### 1.2 已通过规范和局部代码修复的问题

以下问题不需要大型架构改造：

- `openXxx` / `closeXxx` handler 幂等；
- capability 与 handler 共用 resolver；
- Theme 不把本地 overlay 当原生面板事实；
- Payload 在 revision 更新时保留仍有效目标；
- 确认层冻结 action、payload 和 source revision；
- document visibility 不被 HUD hide/show 业务代码手动覆盖；
- ActionResult.data 只用于过渡，最终回归 Snapshot。

这些要求已纳入 `THEME_IMPLEMENTATION_GUIDE.md`，后续实例应优先通过实现规范和测试解决。

---

## 2. 优化原则

1. **渐进实施**：一次只解决一个明确状态边界，不做全链重写。
2. **兼容现有 Theme**：协议字段优先新增可选字段，再迁移消费者。
3. **先定义语义再改接口**：每项优化先写后置条件和失败语义。
4. **可观测后再自动化**：先能记录 revision、request、lifecycle，再做等待和恢复。
5. **真实 MMD 回归不可省略**：Mock 只验证结构和时序，不证明生产 selector 稳定。
6. **不让便利削弱隔离**：不得通过 `allow-same-origin` 或开放父页面对象解决生命周期问题。

---

## 3. 优先级概览

| 优先级 | 优化 | 主要收益 | 影响范围 |
|---|---|---|---|
| P0 | 发布原子性与 Build ID 门禁 | 防止 Host/Frame 错配 | build / release |
| P1 | HUD 可见性生命周期信号 | hide/show 后可靠暂停与恢复 | protocol / host / frame / context |
| P1 | 严格 refresh-after-read | 消除 refresh 返回旧 revision 的歧义 | gateway / bridge / host / client |
| P1 | 动作后置条件与 observed revision | 统一 ActionResult/Snapshot 协作 | contracts / bridge / client / Theme |
| P1 | cancel signal 端到端贯穿 | timeout 后真正终止原生等待 | host / gateway / bridge / handlers |
| P1 | Resolver 诊断标准化 | capability 与 handler 一致 | bridge/mmd / actions |
| P2 | 通用 `useNativePanel` | 减少各 Theme 重复状态机 | hud/shared |
| P2 | 完整领域 Runtime Schema | 加固跨窗口输入 | protocol / contracts |
| P2 | Theme 测试 Harness | 自动覆盖时序与生命周期 | tests / dev |
| P2 | 真实 MMD handler 回归矩阵 | 防止 DOM 改版回归 | QA / release |
| P3 | 受限 Host storage RPC | 可靠保存本地实例状态 | protocol / host / context |

---

## 4. P0：发布原子性与 Build ID 门禁

### 4.1 当前问题

Host 与 Frame 必须来自同一次构建，但当前发布仍依赖人工：

- 手动选择 Build ID；
- 手动复制两个产物；
- 手动更新 manifest；
- 手动提交 release 仓库；
- 构建不会阻止 `dev` Build ID 发布。

错误配对会在握手时失败，但用户拿到的是不可用 HUD，而不是发布阶段失败。

### 4.2 建议实现

新增发布脚本，单次执行：

1. 验证源码 Git 工作树干净；
2. 读取版本和源码 commit SHA；
3. 拒绝 `dev` 或空 Build ID；
4. 执行 typecheck、tests、Host/Frame build；
5. 验证两个 bundle 包含相同 Build ID；
6. 验证 Frame 目录只有一个 JS；
7. 生成 manifest 和 checksum；
8. 复制到 release 仓库；
9. 显示 diff，提交和 push 仍由明确命令触发。

### 4.3 验收标准

- `dev` Build ID 无法进入正式 release；
- Host/Frame Build ID 不同则脚本失败；
- manifest 自动生成，不允许手工漂移；
- release commit 中两个产物来自同一源码 commit；
- CI 对 release 仓库验证 checksum 和 manifest。

---

## 5. P1：HUD 可见性生命周期信号

### 5.1 当前问题

Host 的 `FrameController` 知道：

```text
hide → iframe display:none
show → iframe display:block
```

Frame/Theme 只知道自己请求了 `hideHud()`，不知道 Host 何时恢复。`document.visibilityState` 只反映浏览器文档可见性，不能代替 HUD display 状态。

高负载实例需要区分：

- 浏览器标签页隐藏；
- HUD 被切换到原生界面；
- 当前 Theme surface 未激活；
- 组件已卸载。

### 5.2 建议协议

新增 Host → Frame 生命周期消息或 BridgeEvent：

```ts
interface HudVisibilityChanged {
  type: 'hud-visibility-changed'
  visible: boolean
}
```

Host：

```text
hide ACK 后 → visible:false
show 时 → visible:true
```

HostClient/HudContext 暴露：

```ts
hudVisible: Readonly<Ref<boolean>>
```

Theme 使用：

```text
canRunEffect = documentVisible
  && hudVisible
  && surfaceActive
  && effectEnabled
```

### 5.3 设计注意

- 不要把该状态合并进 `connection`；隐藏 HUD 时 MessagePort 仍可保持 ready；
- show 事件必须在 iframe 恢复显示后送达；
- 首次挂载默认 visible；
- reload/destroy 应结束旧 lifecycle；
- 事件丢失后应能从最新 Host 状态恢复，不只依赖单次边沿事件。

### 5.4 验收标准

- hide 时 WebGL/Canvas/RAF 能暂停或卸载；
- show 时重新挂载；
- 浏览器 visibilitychange 与 HUD hide/show 可独立排列；
- 连续 hide/show 不产生永久暂停；
- reload 后旧 Frame 的 visible 事件不会进入新 Frame。

---

## 6. P1：严格 refresh-after-read 语义

### 6.1 当前问题

当前 `MmdNativeBridge.refresh()` 使用 RAF 调度，HostSession 随后立即 `getSnapshot()` 时可能仍得到旧 revision。调用者拿到 `refresh-result` 后，还要等待独立 Snapshot event 才可能看到新状态。

这符合 eventual consistency，但 `refresh()` 这个 API 名称容易让调用者误以为结果已经重新读取。

### 6.2 可选方案

#### 方案 A：新增严格接口

保留现有轻量 `refresh()`，新增：

```ts
refreshAndRead(): Promise<ChatSnapshot>
```

Bridge 合并同一帧请求，在 `refreshNow()` 完成后 resolve 最新克隆。

#### 方案 B：改变现有 refresh RPC

HostSession 等待 gateway 完成异步 refresh，再返回 Snapshot。

推荐方案 A，先保持兼容，迁移需要严格语义的调试工具和动作后置条件。

### 6.3 并发要求

- 同一帧多个严格 refresh 应合并；
- destroy 时 reject/返回断开 Snapshot；
- refresh 读取异常应传播 PLATFORM_CHANGED；
- 返回结果与随后事件允许是同 revision，HostClient 应去重；
- 不允许等待任意 DOM mutation 无上限阻塞。

### 6.4 验收标准

- 严格 refresh 返回值一定来自调用后执行的一次读取；
- revision 无内容变化时可以保持不变，但读取动作必须完成；
- 并发调用不产生多次无意义 DOM 全量读取；
- refresh 后不再需要固定 sleep。

---

## 7. P1：动作后置条件与 observed revision

### 7.1 当前问题

ActionResult 和 Snapshot 是两条独立消息链。handler 可以返回 panel data，但 Theme 无法统一知道：

- 动作观察了哪个 Bridge revision；
- result.data 是在哪次 DOM 状态上读取；
- 是否还需要等待新 Snapshot；
- 后置条件对应哪个 Snapshot 字段。

### 7.2 建议契约

可为成功 ActionResult 增加可选元数据：

```ts
interface ActionObservation {
  sourceRevision: number
  observedRevision?: number
  snapshotPending?: boolean
}
```

或将其放入 RPC envelope，而不是每个业务 `data`。

MmdNativeBridge 在 handler 成功后执行严格读取，再返回：

```text
ActionResult + observed revision
随后相同 revision Snapshot event（允许去重）
```

### 7.3 不建议的方案

- 不要把完整 Snapshot 塞进每个 ActionResult；会重复传输且混淆状态/响应边界；
- 不要让 Theme 自己猜测 action 对应字段；
- 不要用固定延迟替代后置条件；
- 不要要求所有动作都增加专用状态机元数据。

### 7.4 渐进实施

1. 先为面板 open/close 和选择类动作试点；
2. HostClient 记录 result observed revision；
3. 提供通用等待 API；
4. Theme 迁移后再考虑扩大范围。

### 7.5 验收标准

- ActionResult 先到或 Snapshot 先到都不影响状态机；
- UI 能区分“动作失败”和“动作成功、Snapshot 同步中”；
- 同一 observed revision 不重复触发重型重绘；
- 不破坏现有 ActionResult.data 类型。

---

## 8. P1：cancel signal 端到端贯穿

### 8.1 当前问题

Frame timeout 会发送 `cancel-request`，HostSession 停止等待/回复，但 AbortSignal 尚未穿过 NativeGateway 进入 MmdNativeBridge。已经开始的 DOM 等待可能继续执行。

### 8.2 建议接口

```ts
interface NativeGateway {
  invoke(action, payload, signal?: AbortSignal): Promise<ActionResult>
}
```

链路：

```text
HostClient timeout/unmount
  → cancel-request
  → HostSession AbortController.abort()
  → NativeGateway.invoke(..., signal)
  → MmdNativeBridge
  → actionRegistry waitForCondition
```

### 8.3 风险

DOM click 可能已经发生，取消不能回滚原生副作用。因此语义必须写清：

- signal 可终止尚未发生的点击和后续等待；
- 已发生的原生点击不保证回滚；
- handler 应在关键副作用前检查 aborted；
- destructive handler 仍依赖两阶段 token 和 live target 校验。

### 8.4 验收标准

- cancel 后 Host 不回复旧请求；
- handler wait/observer/timer 被清理；
- reload/destroy 会 abort 所有 in-flight action；
- 新 Session 不接收旧动作结果；
- 测试覆盖取消发生在点击前、点击后等待中和结果发送前。

---

## 9. P1：Resolver 诊断标准化

### 9.1 当前问题

Resolver 多数只返回 `HTMLElement | null`，调用者各自生成 reason。容易出现：

- capability 和 handler 查询范围不同；
- 相同结构错误产生不同文案；
- 无法区分未找到、多个匹配、不可见和结构不完整；
- 调试台难以展示 selector 失效原因。

### 9.2 建议类型

```ts
type ResolveResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      code: 'NOT_FOUND' | 'AMBIGUOUS' | 'HIDDEN' | 'INCOMPLETE'
      reason: string
    }
```

Capability 与 handler 共享 ResolveResult：

```text
resolve 失败 → capability.reason
resolve 失败 → ActionResult error
```

### 9.3 渐进范围

优先迁移：

1. 模型入口/列表/配置/关闭按钮；
2. 会话、删除确认；
3. 编辑和分享面板；
4. 其余更多菜单和设置。

### 9.4 验收标准

- 同一目标只有一个 resolver；
- 多匹配时 fail closed 并能诊断；
- capability 与 handler reason 一致；
- resolver 不跨 revision 保存节点；
- Mock 覆盖兄弟节点、叠层、隐藏 shell 和重复结构。

---

## 10. P2：通用 `useNativePanel` Composable

### 10.1 目标

减少每个 Theme 重复实现：

- opening/closing 状态；
- ActionResult 与 Snapshot 竞态；
- timeout；
- 关闭叠层；
- unmount cleanup；
- focus restore；
- error 文案。

### 10.2 可能接口

```ts
useNativePanel({
  isOpen: () => snapshot.value.modelPanel.open,
  openAction: 'openModelSettings',
  closeAction: 'closeModelSettings',
  readResult: result => result.data,
  waitTimeoutMs: 4_000,
})
```

返回：

```text
phase
error
open()
close()
waitForSnapshot()
```

### 10.3 边界

- Composable 只能位于 HUD shared 层，不能导入 Bridge selector；
- 不得隐藏 capability reason；
- 不应假设所有面板选中后都会自动关闭；
- 叠层流程需要显式策略，不能写死模型逻辑；
- 不要把所有 NativeAction 塞进一个巨大通用组件。

### 10.4 进入条件

至少有两个 Theme/业务面板完成同类状态机后再抽取。当前只为单个组件抽象可能过早。

---

## 11. P2：完整领域 Runtime Schema

### 11.1 当前问题

协议 decoder 对消息和各 panel 子结构仍较浅。TypeScript 类型不能验证跨窗口输入，浅验证意味着 Host/Frame 版本漂移或意外对象结构可能进入 Theme。

### 11.2 建议路径

- 为 ChatSnapshot 子结构编写分区 decoder；
- 复用基础字段校验器；
- 限制字符串长度、数组数量和数值范围；
- success ActionResult.data 按 action 做可选 decoder；
- 解码失败生成明确 connection error，不静默修补危险字段。

### 11.3 权衡

完整 schema 会增加 bundle 体积和维护成本。应先覆盖高风险字段：

- capabilities 完整性；
- message identity/reference；
- confirmation token 结构；
- model/conversation stable IDs；
- 原生 HTML/text 的类型和大小。

### 11.4 验收标准

- 畸形 panel/message 无法进入 Theme；
- decoder 错误包含字段路径；
- Host 和 Frame 使用同一共享 schema 定义或生成源；
- 兼容字段新增策略明确；
- Fuzz/边界测试覆盖过深、过长和循环结构（循环仍由 Wire 层拒绝）。

---

## 12. P2：Theme 测试 Harness

### 12.1 当前缺口

现有 Mock 能验证完整 Host/Frame，但 Theme 根组件、ActionResult/Snapshot 顺序和生命周期仍缺少易用测试入口。

### 12.2 建议能力

创建 fake HudContext harness，可脚本化：

- 初始 Snapshot；
- capability 变化；
- invoke result；
- result 与 Snapshot 的到达顺序；
- Snapshot revision 序列；
- hide/show；
- connection error；
- delayed/timeout action。

例如：

```ts
const harness = createHudContextHarness(snapshot)
harness.queueInvoke('openModelSettings', result)
harness.pushSnapshot(nextSnapshot)
```

### 12.3 需要覆盖的共享场景

- ActionResult → Snapshot；
- Snapshot → ActionResult；
- 多 revision；
- 目标保持/消失；
- 确认层冻结 payload；
- hide/show 与 visibilitychange；
- component unmount 清理 pending。

### 12.4 验收标准

- Theme 测试不需要父页面 DOM；
- 不通过 `any` 绕过 HudContext 类型；
- fake invoke 与真实 ActionResult contract 一致；
- 测试可精确控制异步顺序；
- bridge-debug 与 game 的关键镜像面板至少各有一条根挂载测试。

---

## 13. P2：真实 MMD handler 回归矩阵

### 13.1 目的

Mock DOM 无法证明真实 MMD 的：

- 中文文案；
- 组件层级和可见性；
- 动画时序；
- toggle 行为；
- 移动端结构；
- 路由/BFCache 生命周期。

### 13.2 建议记录格式

每个 action 记录：

```text
action
MMD 页面/前置状态
预期 capability
payload 来源
可观察后置条件
桌面/移动端
通过日期
MMD DOM 版本或关键结构签名
```

### 13.3 优先顺序

1. sendMessage 和 generation；
2. 模型打开/关闭/选择/配置；
3. 会话打开/选择/重命名/删除；
4. 编辑、回溯、分享和更多菜单；
5. 人设、补充设定、指令和对话设置；
6. 6 项 contract-only 确定性不可用。

### 13.4 验收标准

- 每个 registered handler 有成功和失败路径；
- open/close 有幂等回归；
- destructive action 有 replay/expired/stale target；
- selector 变更必须更新结构签名和回归记录；
- 发布前至少执行实际 Theme 依赖动作的冒烟集。

---

## 14. P3：受限 Host storage RPC

### 14.1 背景

opaque sandbox 下 Frame localStorage 可能不可用。当前实例只保证容错，不保证跨 reload 持久化。

### 14.2 仅在确有需求时实施

如果地图、图鉴或 UI 设置必须可靠保存，可设计受限 RPC：

```text
storage.get
storage.set
storage.delete
```

限制：

- 只允许 `CUSTOM_` namespace；
- key/value 大小限制；
- JSON/Wire 数据净化；
- schema/version 由 Theme 管理；
- 禁止枚举 MMD storage；
- 禁止读取 Cookie/token/Authorization；
- Host 使用独立项目 namespace。

### 14.3 不建议方案

- 不要为了 localStorage 开放 `allow-same-origin`；
- 不要把任意 localStorage API 暴露给 Frame；
- 不要允许 Theme 自定义 Host 代码执行；
- 不要保存 MMD 原生状态副本。

---

## 15. 建议实施批次

### 批次 A：发布和可观测性

- Build ID 门禁；
- release 脚本和 manifest；
- handler 回归矩阵模板；
- resolver 诊断先覆盖模型域。

风险低，收益直接。

### 批次 B：生命周期和严格刷新

- hudVisible 生命周期信号；
- `refreshAndRead()`；
- HostClient 去重和测试；
- bridge-debug 特效/模型流程迁移试点。

需要协议版本兼容设计。

### 批次 C：动作事务统一

- observed revision；
- 通用后置 Snapshot 等待；
- cancel signal 贯穿；
- `useNativePanel` 在已有实现基础上抽取。

需要较完整的 Host/Frame 和真实 MMD 回归。

### 批次 D：长期加固

- 完整 Runtime Schema；
- Theme harness；
- 受限 Host storage（仅在需求明确时）。

---

## 16. 每项优化的交付模板

后续执行任一优化时，建议交付说明包含：

```text
问题：当前可复现的错误或歧义
语义：优化后保证什么、不保证什么
影响层：contracts / bridge / host / protocol / frame / hud
兼容性：旧 Host/Frame/Theme 如何处理
测试：单元、跨窗口、Mock、真实 MMD
发布：Build ID、manifest、回滚方式
```

禁止只提交接口变化而不写清语义和失败路径。

---

## 17. 不应做的“优化”

以下方向会破坏现有边界：

- 让 Theme 访问 `window.parent.document`；
- 给 sandbox 增加 `allow-same-origin` 只为 storage 或 DOM；
- 将 MmdNativeBridge 实例传进 Frame；
- 跨 MessagePort 发送 DOM、函数、Proxy 或事件对象；
- 为每个 Theme 复制 Host/Protocol；
- 把 Snapshot 变成 Theme 可写 store；
- 用全局 loading 解决所有动作并发；
- 用固定 sleep 替代明确后置条件；
- 为了编译通过删掉 NativeAction 或使用宽泛 `any`；
- 在没有真实需求时引入通用工作流引擎或复杂状态机框架。

---

## 18. 当前推荐的下一步

如果继续架构加固，推荐顺序：

1. **发布原子性与 Build ID 门禁**；
2. **模型域 resolver 结构化诊断**；
3. **HUD 可见性生命周期信号**；
4. **严格 refresh-after-read**；
5. **Theme 测试 Harness**；
6. **动作 observed revision 与通用后置条件**；
7. **cancel signal 贯穿**；
8. **完整 Runtime Schema 和真实 61 项回归持续维护**。

前三项能以较小改动消除高频运维和生命周期错误；后续项应分阶段实施，避免把正确的主干架构一次性重写。

---

## 19. 一句话交接

> 当前架构应继续沿用；近期重点不是重构边界，而是把 HUD 可见性、严格刷新、动作后置 revision、resolver 诊断和发布原子性补成明确契约，再用 Theme harness 与真实 MMD 回归守住这些契约。
