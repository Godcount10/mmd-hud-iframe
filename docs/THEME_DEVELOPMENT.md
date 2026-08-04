# Theme 实例开发指南

本文面向只需要开发 `src/hud/themes/` 下具体 HUD Theme/实例的前端开发者，说明如何创建和注册实例，以及实例如何消费 Snapshot、调用 NativeAction、实现原生镜像、管理本地状态和覆盖异步时序测试。

系统架构见 [整体架构与实现](ARCHITECTURE.md)，本地联调与构建见 [开发、测试与发布](DEVELOPMENT_AND_RELEASE.md)。只有需要新增 MMD 原生能力时，才阅读 [Bridge 原生能力开发指南](BRIDGE_DEVELOPMENT.md)。

---

## 0. 创建一个实例

一个可选择的 HUD 通常就是一个 Theme。新增实例一般不需要复制 Host、Bridge 或 Protocol。

### 修改 game 还是新增 Theme

如果项目只保留一个正式业务 HUD，直接改造：

```text
src/hud/themes/game/
```

如果需要同时保留多个可选 HUD，则新增：

```text
src/hud/themes/my-hud/
```

Theme ID 会进入 bootstrap、handshake 和 runtime decoder，因此新增可选 Theme 不是普通前端路由。

### 最小目录

```text
my-hud/
├─ index.ts
├─ MyHud.vue
└─ my-hud.css
```

`index.ts`：

```ts
import MyHud from './MyHud.vue'
import styles from './my-hud.css?inline'
import type { HudThemeDefinition } from '../types'

export const myHudTheme: HudThemeDefinition = {
  id: 'my-hud',
  name: 'My HUD',
  component: MyHud,
  styles,
}
```

### 必须注册的位置

新增可选 Theme 时同步修改：

1. `src/protocol/messages.ts`：扩展 HudThemeId；
2. `src/protocol/guards.ts`：加入 runtime Theme 白名单；
3. `src/protocol/frameBootstrap.ts`：扩展 bootstrap type/decoder；
4. `src/frame/main.ts`：导入并加入 Theme registry；
5. `host-dev/src/main.ts`：识别 `?theme=my-hud`。

同时更新 bootstrap/handshake、Theme registry、Mock 和发布 manifest。

### 推荐复杂目录

```text
my-hud/
├─ index.ts
├─ MyHud.vue
├─ my-hud.css
├─ shell/          # 全屏壳层、背景、导航
├─ features/       # 对话、模型、设置等业务域
├─ overlays/       # 对话框、确认层
├─ components/     # 通用视觉组件
├─ composables/    # Snapshot/动作/导航接线
├─ stores/         # 本地响应式状态和持久化
├─ systems/        # 纯逻辑；不 import Vue/DOM/Bridge
└─ types/
```

### 最小 HudContext 用法

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHudContext } from '../../context'

const { snapshot, invoke, hideHud } = useHudContext()
const draft = ref('')
const canSend = computed(() => snapshot.value.capabilities.sendMessage.available)

async function send(): Promise<void> {
  const text = draft.value.trim()
  if (!text || !canSend.value) return
  const result = await invoke('sendMessage', { text })
  if (result.ok) draft.value = ''
}
</script>
```

业务 Theme 优先使用类型化 invoke；invokeDynamic 只适合 bridge-debug 一类运行时选择任意 action 的工具。

禁止：

```ts
window.parent.document.querySelector(...)
new MmdNativeBridge(...)
import { MMD_SELECTORS } from '../../../bridge/mmd/selectors'
```

---

## 1. 先判断功能属于哪类状态

新增任何 `ref`、store 字段或本地缓存前，必须先确定状态归属。

### 1.1 MMD 原生事实

包括：

- 消息、生成状态和当前角色；
- 当前会话及会话列表；
- 当前模型、模型列表和模型设置；
- 用户人设、设定补充、指令和对话设置；
- 原生面板是否打开；
- 原生操作是否可用。

规则：

- 唯一来源是最新 `ChatSnapshot`；
- 所有者是 MMD；
- Theme 只能显示投影并通过 NativeAction 请求变更；
- Theme 禁止把这些字段持久化为第二份真相；
- ActionResult 或临时缓存不得永久覆盖后续 Snapshot。

### 1.2 原生动作事务状态

包括：

- `opening`、`closing`、`selecting`、`submitting`；
- 当前执行的 action；
- 动作开始时的 revision；
- 等待 ActionResult 或等待新 Snapshot；
- 动作失败及恢复提示。

规则：

- 事务状态属于 Theme，但不是 MMD 原生事实；
- 生命周期从用户发起动作开始，到成功、失败、取消或超时结束；
- 事务结束后必须回到 Snapshot 驱动渲染；
- 不得把 `opening=true` 等同于“原生面板已经打开”。

### 1.3 Theme 临时 UI 状态

包括：

- 当前页签、搜索词和过滤条件；
- 本地草稿、焦点和展开状态；
- 未提交的表单选择；
- HUD 内部 overlay；
- 动画阶段。

这些状态可以由 Theme 管理，但必须定义：

- 谁写入；
- 何时清理；
- unmount/reload 后是否需要恢复；
- Snapshot 变化时是否仍然有效。

### 1.4 Theme 持久化状态

包括：

- UI 偏好；
- 本地地图、图鉴和玩法存档；
- 特效参数；
- 不对应 MMD 原生设置的本地功能。

规则：

- storage key 使用 `CUSTOM_` 前缀；
- 包含 schema 版本并容忍损坏数据；
- opaque sandbox 拒绝 storage 时仍能运行；
- 不保存 Cookie、token、DOM 节点或 MMD 内部 storage；
- 不将运行时 message ID 当永久主键。

### 1.5 每个状态都必须能回答的问题

提交前应检查：

1. 它的所有者是谁？
2. 唯一写入来源是什么？
3. 它是事实、事务、UI 还是持久化状态？
4. 它在何时失效？
5. 谁负责恢复？
6. 它是否可能覆盖更新后的 Snapshot？

如果一个布尔值同时表达“本地弹窗显示”“原生面板打开”“动作执行中”，必须拆分。

---

## 2. Snapshot 与 ActionResult 的关系

### 2.1 不要假设到达顺序

以下时序都合法：

```text
ActionResult → Snapshot
Snapshot → ActionResult
多个 Snapshot → ActionResult
ActionResult → 多个 Snapshot
```

DOM MutationObserver、动画、异步列表加载和 `requestAnimationFrame` 刷新都会改变顺序。Theme 必须在所有顺序下保持一致。

### 2.2 ActionResult 表示动作后置条件

`result.ok === true` 只表示 handler 定义的后置条件已经成立，例如：

- 原生点击已被派发；
- 面板已被检测为打开；
- 模型项已被选中且面板已关闭；
- 原生表单提交后出现了可观察结果。

它不保证 Theme 当前持有的 Snapshot 已经是动作后的 revision。

### 2.3 Snapshot 是最终渲染真相

原生数据最终必须回归最新 Snapshot：

```text
ActionResult.data 可用于本次事务过渡
最新 Snapshot 用于长期渲染
```

允许：

- 使用 `openModelSettings` 返回的 panel data 结束 opening loading；
- 在新 Snapshot 到达前临时展示本次结果；
- 用 result data 判断是否进入下一事务阶段。

禁止：

- 永久缓存选中模型并让缓存优先于 Snapshot；
- ActionResult 成功后立即读取旧 props，并据此报告“原生未返回”；
- 将成功结果写入 MMD 原生状态的本地持久化副本；
- 阻止后续 Snapshot 修正临时显示。

### 2.4 后置 Snapshot 等待

当 UI 必须确认 Snapshot 已同步时，应明确等待条件，而不是依赖固定延迟：

```text
打开面板：等待 snapshot.modelPanel.open
关闭面板：等待 !snapshot.modelPanel.open
切换分类：等待 activeFilterId === expectedId
```

等待必须具备：

- 目标条件；
- 起始 revision；
- timeout；
- 组件卸载/动作取消清理；
- ActionResult 已成功但 Snapshot 超时时的准确错误文案。

不得只用“2.4 秒后数组仍为空”推断原生动作失败。

---

## 3. 原生镜像面板状态机

原生镜像包括模型、会话、人设、设定补充、编辑和设置面板。

推荐状态：

```ts
type NativePanelPhase =
  | 'closed'
  | 'opening'
  | 'open'
  | 'closing'
  | 'failed'
```

状态来源：

- `closed/open`：由最新 Snapshot 派生；
- `opening/closing/failed`：由当前动作事务补充。

### 3.1 打开流程

```text
用户请求打开
  → 检查 capability
  → phase = opening
  → invoke(openXxx)
  → 消费 ActionResult/data
  → 等待或接收开放 Snapshot
  → phase = open
```

如果 action 失败：

- 清除 opening；
- 显示 ActionResult error；
- 不伪造 `panel.open=true`；
- 不留下无法关闭的本地遮罩。

### 3.2 关闭流程

```text
用户请求关闭
  → phase = closing
  → 关闭当前顶层原生面板
  → 确认结果
  → 重新读取最新状态
  → 如底层原生面板重新显现，继续关闭
  → 原生状态确认关闭
  → 关闭本地镜像
```

规则：

- 本地 overlay 关闭不等于原生面板关闭；
- 原生关闭失败时不得静默 `emit('close')`；
- 关闭叠层面板后不能继续使用关闭前 Snapshot 判断底层状态；
- 卸载清理不能只用 `else if` 关闭一层；
- 恢复路径不应被无关 loading 永久禁用。

### 3.3 选择流程

选择成功后，如果原生 handler 保证面板自动关闭，可以结束本地选择事务；但最终显示的当前模型、会话或设置仍来自后续 Snapshot。

---

## 4. NativeAction 必须具有与名称一致的语义

### 4.1 `openXxx` 是“确保打开”

handler 必须先检查目标状态：

```text
已经打开 → 直接成功并返回当前读取结果
尚未打开 → 点击入口并等待打开
```

禁止使用无条件点击 toggle 入口来实现 `openXxx`。

### 4.2 `closeXxx` 是“确保关闭”

```text
已经关闭 → 幂等成功（可携带 alreadyClosed）
仍然打开 → 点击关闭并等待关闭
```

禁止将 `closeXxx` 实现成“盲目点击一个可能反转状态的入口”。

### 4.3 真正的反转行为才命名 `toggleXxx`

如果动作契约名是 open/close，调用者有权依赖幂等语义。Bridge 不得把 toggle DOM 行为原样泄漏为 open/close。

---

## 5. Capability 与 handler 必须共用 resolver

同一个原生目标不得在 Snapshot reader 和 action handler 中分别写不同 selector 逻辑。

正确模式：

```ts
resolveModelEntry(document)
resolveModelPanel(document)
resolveModelPanelClose(panel)
```

以下两处都调用同一个 resolver：

- Snapshot/capability 计算；
- action handler 执行。

禁止：

```ts
// capability
panel.querySelector(closeSelector)

// handler
panel.closest(popupSelector)?.querySelector(closeSelector)
```

这种分叉会导致“capability 不可用，但 handler 实际能执行”。

Resolver 应当：

- 验证可见性、唯一性和结构；
- fail closed；
- 尽量提供结构化失败原因；
- 不跨 Snapshot revision 缓存 DOM 节点；
- 支持 capability reason 与 ActionResult error 使用一致描述。

---

## 6. Pending 必须按事务和冲突关系拆分

不要把以下状态无条件合成一个全局 pending：

```text
opening
loadingSnapshot
closing
selecting
sending
其他无关 Bridge action
```

推荐至少区分：

- 当前 action pending；
- 面板 opening；
- 面板 closing；
- Snapshot 后置条件等待；
- 当前业务域之外的 action pending。

按钮是否禁用应根据冲突矩阵决定：

- 同一原生面板的互斥操作应阻止；
- 无关操作不应无理由锁住整个界面；
- loading Snapshot 不应永久阻止安全关闭；
- close/cancel 等恢复路径应尽可能保留；
- 禁用时必须显示 capability reason 或事务原因。

---

## 7. Payload、Snapshot revision 与确认事务

### 7.1 revision 变化不得无条件清空表单

Snapshot 更新后应重新验证当前选择：

```text
目标 ID 仍存在且仍适用于当前动作 → 保留
目标消失/失效 → 清空并明确提示
目标结构改变 → 要求重新选择
```

禁止：

```ts
watch(snapshot.revision, resetEveryField)
```

模型列表、会话列表和异步配置会产生多次合法 revision；无条件清空会让执行按钮反复变灰。

### 7.2 PreparedAction

需要确认或对 revision 敏感的操作应冻结：

```ts
interface PreparedAction {
  action: NativeAction
  payload: unknown
  sourceRevision: number
}
```

打开确认弹窗时复制：

- action；
- payload；
- source revision；
- 用户可见 label；
- effect/destructive 属性。

确认执行必须使用冻结副本，不得重新读取实时 `payload.value` 或实时 revision。

### 7.3 Theme 校验不替代 Bridge 校验

即使 source revision 未变化，handler 仍必须：

- 重新查询 live DOM；
- 验证 stable reference/fingerprint/index；
- 目标不唯一或失效时 fail closed。

Theme 的 revision 管理用于防止误导和改善 UX，不是安全边界。

---

## 8. 可见性和生命周期状态必须分离

至少区分：

```text
documentVisible  // document.visibilityState
hudVisible       // Host hide/show
componentMounted // Vue 生命周期
surfaceActive    // Theme 当前页签/页面
effectEnabled    // 用户设置
```

### 8.1 document visibility

只能由浏览器事实更新：

```ts
document.visibilityState
document.addEventListener('visibilitychange', ...)
```

禁止从业务事件手动写入派生的 document visibility：

```ts
pageVisible.value = false // 禁止把 HUD hide 伪装成浏览器页面隐藏
```

CSS `display:none` 通常不会触发 `visibilitychange`，因此这种单向写入可能永远无法恢复。

### 8.2 HUD hide/show

Theme 可以请求 `hideHud()`，但 Host 决定何时真正隐藏和恢复。如果实例必须在 HUD 隐藏时严格暂停 WebGL，应使用独立 Host 生命周期信号；在该信号尚未提供前，不要伪造 document visibility。

### 8.3 所有暂停状态必须具有对称恢复来源

写入任何 false/paused 状态前必须明确：

- 谁会设为 false；
- 谁会设回 true；
- 恢复事件是否一定发生；
- 组件卸载时如何清理。

找不到明确恢复来源时，不得写入该暂停状态。

### 8.4 动画与 GPU 资源

实例必须：

- 支持 `prefers-reduced-motion`；
- 页面真实隐藏时暂停高负载循环；
- unmount 时清理 RAF、listener、observer、GSAP context/timeline；
- 释放 Three/OGL/WebGL renderer、geometry、material、texture；
- 初始化失败时提供静态降级；
- HUD 恢复后允许重新挂载而不是永久 fallback。

---

## 9. 缓存规则

允许缓存：

- sanitize 后的 HTML；
- 以内容 hash 为键的纯派生结果；
- 可由当前 Snapshot 完整重建的计算数据；
- 仅用于当前事务的 ActionResult.data。

禁止缓存为原生真相：

- 当前模型；
- 当前会话；
- 原生面板开放状态；
- 原生设置值；
- 用户人设和设定补充。

为了视觉连续性临时缓存时必须满足：

1. Snapshot 优先级高于缓存；
2. 缓存有明确失效条件；
3. 缓存不会掩盖 ActionResult 失败；
4. 缓存不会被持久化为 MMD 原生事实。

---

## 10. 错误、超时和提示

必须区分：

- capability 当前不可用；
- action handler 失败；
- RPC/连接失败；
- ActionResult 已成功但 Snapshot 尚未同步；
- Snapshot 后置条件超时；
- payload 目标因 revision 变化失效；
- Theme 本地渲染异常；
- WebGL/Canvas 降级。

禁止把不同问题都显示为“原生未返回数据”。

如果 ActionResult.data 已经证明面板打开和列表存在，不应再用旧 Snapshot 报告“面板未打开”。如果只是等待状态同步，应明确显示“动作已完成，正在同步最新 Snapshot”。

---

## 11. 最低测试矩阵

每个原生镜像实例至少覆盖以下路径。

### 11.1 正常路径

```text
关闭 → 打开
打开 → 关闭
打开 → 选择
打开 → 配置 → 提交
```

### 11.2 幂等路径

```text
打开状态再次 open，不得关闭
关闭状态再次 close，不得打开或失败
```

### 11.3 时序路径

```text
ActionResult 先到
Snapshot 先到
多个 Snapshot 到达
Snapshot 延迟
Snapshot 后置条件超时
```

### 11.4 快速交互

```text
打开后立即关闭
关闭后立即打开
动作进行中切换 Theme 页签
组件 unmount 时仍有原生叠层面板
```

### 11.5 陈旧目标

```text
选择 payload 后 revision 改变但目标仍存在
选择 payload 后目标消失
确认弹窗期间 Snapshot 改变
stable reference/fingerprint 失效
```

### 11.6 生命周期

```text
浏览器 visibilitychange
HUD hide/show
Frame reload
组件 unmount
WebGL 初始化失败和重试
storage 拒绝访问
```

Mock 测试不能替代真实 MMD handler 回归，但应覆盖 Theme 状态机和已知时序排列。

---

## 12. 常见反模式

### 反模式 1：本地布尔值代表原生事实

```ts
modelOpen.value = true
```

如果这个值被解释为“原生模型面板已打开”，就是错误的。它最多表示“本地镜像希望显示”或“打开事务已启动”。

### 反模式 2：open 动作无条件点击 toggle

```ts
dispatchPointerClick(entry)
```

执行前必须检查目标是否已经打开。

### 反模式 3：动作成功后立即读取旧 props

```ts
await invoke('openModelSettings')
if (!props.modelPanel.models.length) showError()
```

必须考虑 Snapshot 尚未同步，并消费 ActionResult.data 或等待明确后置条件。

### 反模式 4：每个 revision 重置全部输入

```ts
watch(revision, resetEverything)
```

应验证当前目标是否仍然有效。

### 反模式 5：确认时读取实时 payload

```ts
confirm(() => execute(payload.value))
```

应执行打开确认层时冻结的 PreparedAction。

### 反模式 6：手动修改派生可见性

```ts
pageVisible.value = false
```

由浏览器事实派生的状态必须只有一个写入源。

### 反模式 7：原生关闭失败后仍关闭本地 UI

```ts
await maybeCloseNative()
emit('close')
```

这会使 HUD 与 MMD 原生面板立即分叉。

---

## 13. 实例完成检查清单

### 边界

- [ ] Theme 没有读取或操作 `window.parent.document`；
- [ ] Theme 没有导入 `src/bridge/`、`src/host/` 或 transport；
- [ ] 原生事实只来自 Snapshot；
- [ ] 纯本地功能没有错误扩展成 NativeAction。

### 动作与状态

- [ ] ActionResult 与 Snapshot 任意到达顺序都可工作；
- [ ] `openXxx` / `closeXxx` 具有幂等语义；
- [ ] capability 与 handler 共用 resolver；
- [ ] pending 已按业务事务拆分；
- [ ] 本地关闭不会遗留原生面板；
- [ ] 叠层面板会逐层关闭并重新读取状态；
- [ ] 临时 result data 最终会被 Snapshot 接管。

### Payload 与确认

- [ ] revision 更新不会无条件清空仍有效的 payload；
- [ ] 目标失效时有明确提示；
- [ ] 确认操作冻结 action、payload 和 source revision；
- [ ] Bridge 执行时仍重新验证 live DOM。

### 生命周期

- [ ] document visibility 与 HUD hide/show 没有混用；
- [ ] 所有暂停状态都有对称恢复来源；
- [ ] hide/show 后动画和 WebGL 能恢复；
- [ ] unmount 清理 listener、timer、RAF、observer 和 GPU 资源；
- [ ] reduced motion、移动端策略和降级状态可恢复。

### 验证

- [ ] typecheck 通过；
- [ ] 单元测试覆盖正常、幂等、时序、陈旧目标和生命周期路径；
- [ ] Host/Frame 使用同一 Build ID 构建；
- [ ] Frame 仍是单 JS 产物；
- [ ] 实例实际依赖的 NativeAction 已在真实 MMD 人工回归。

---

## 14. 一句话原则

> Theme 可以拥有事务和表现，但不能拥有 MMD 原生真相；每个异步动作都必须同时处理 ActionResult、后续 Snapshot、陈旧目标和恢复路径。
