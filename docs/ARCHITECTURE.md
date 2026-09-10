# 整体架构与实现

本文面向维护 Host、Frame、Protocol、Bridge 和共享契约的开发者，说明系统如何运行以及各层如何协作。

如果你只想开发具体 HUD，请阅读 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。如果你想了解为什么选择这套架构，请阅读 [架构优点与设计权衡](ARCHITECTURE_RATIONALE.md)。

---

## 1. 系统目标与状态边界

MMD 父页面继续负责：

- 登录、身份和角色；
- 当前聊天和历史会话；
- AI 请求、流式生成和消息持久化；
- 模型选择与配置；
- 用户人设、设定补充、对话设置和指令；
- 原生编辑、回溯、删除、分享、评论和收藏。

HUD Frame 负责：

- 游戏化界面、动画、Canvas 和 WebGL；
- 对 Snapshot 的响应式渲染；
- 原生面板镜像；
- AI 文本派生状态；
- 地图、图鉴、UI 偏好等纯本地功能；
- 通过 HudContext 请求原生动作。

核心边界：

```text
MMD 原生事实属于父页面
Theme 只拥有事务、表现和本地玩法
```

---

## 2. 完整运行时架构

```text
┌────────────────────────────────────────────────────────────────────┐
│ MMD 父页面                                                         │
│ 身份 / 角色 / 会话 / AI / 持久化 / 原生面板 / 原生 DOM            │
└───────────────────────────────┬────────────────────────────────────┘
                                │ DOM 查询、观察、原生事件模拟
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MMD DOM Adapter                                                    │
│ selectors + snapshotReader + panel readers + actionRegistry        │
└───────────────────────────────┬────────────────────────────────────┘
                                │ NativeBridge 契约
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ MmdNativeBridge                                                    │
│ ChatSnapshot / CapabilityMap / BridgeEvent / invoke()              │
└───────────────────────────────┬────────────────────────────────────┘
                                │ NativeGateway
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ Parent Host                                                        │
│ HostApp → FrameController → HostSession                            │
│ iframe 生命周期 / srcdoc / MessageChannel / RPC / timeout / cleanup│
└───────────────────────────────┬────────────────────────────────────┘
                                │ MessagePort，结构化克隆纯数据
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ opaque sandbox srcdoc iframe                                      │
│ HostClient → HudContext → Vue Theme                                │
│ game / bridge-debug / 后续实例                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 两个构建、两个 Realm

项目生成：

- **Host IIFE**：运行在 MMD 父页面 Realm，可以访问 MMD document；
- **Frame IIFE**：运行在 sandbox srcdoc iframe Realm，不能访问父页面 DOM。

Frame iframe 不带 `allow-same-origin`，因此 document 使用 opaque origin。

### srcdoc 启动

Host 不加载远程 HTML，而是：

1. 创建最小 srcdoc；
2. 建立 `#app`；
3. 从 frameScriptUrl 加载 Frame IIFE；
4. 通过 iframe.name 传 bootstrap；
5. 通过 MessageChannel 传唯一业务端口。

生产只需 Host JS 与 Frame JS 两个产物。

---

## 3. 各层职责

| 层 | 主要文件 | 职责 |
|---|---|---|
| Domain Contract | `src/contracts/bridge.ts` | Snapshot、Action、Payload、Capability、Event、Result |
| MMD DOM Adapter | `src/bridge/mmd/*` | selector、reader、resolver、stable reference |
| Action Registry | `src/bridge/actions/actionRegistry.ts` | 标准动作转成经过验证的 DOM 操作 |
| MmdNativeBridge | `src/bridge/MmdNativeBridge.ts` | observer、Snapshot、capability、action、事件 |
| NativeGateway | `src/host/NativeGateway.ts` | HostSession 依赖的最小原生接口 |
| HostSession | `src/host/HostSession.ts` | MessagePort RPC 服务端、超时、关联、清理 |
| FrameController | `src/host/FrameController.ts` | iframe、srcdoc、channel、hide/show/reload/destroy |
| HostClient | `src/frame/connection/HostClient.ts` | Frame RPC 客户端和响应式状态 |
| HudContext | `src/hud/context.ts` | Theme 的唯一宿主接口 |
| Theme | `src/hud/themes/*` | 具体 HUD 实例 |

### MmdNativeBridge

负责：

- 启动和销毁 observer；
- 每 900ms 检查消息列表与输入生成状态；
- 将高频 DOM 变化合并到一次 RAF 刷新；
- 创建 ChatSnapshot；
- 动态计算完整 CapabilityMap；
- 执行 action registry；
- 管理 action AbortController；
- 推送 ready、snapshot、generation 和 error；
- DOM 解析异常时 fail closed。

主要接口：

```ts
interface NativeBridge {
  start(): Promise<void>
  destroy(): void
  refresh(): void
  getSnapshot(): ChatSnapshot
  getCapabilities(): CapabilityMap
  subscribe(listener: BridgeListener): () => void
  invoke<T>(action: NativeAction, payload?: unknown): Promise<ActionResult<T>>
  sendMessage(text: string): Promise<ActionResult>
}
```

handler 执行前检查最新 capability，执行时仍重新读取 live DOM。

### Action Registry

它不仅派发 click，还负责：

- 调用原生 input/textarea setter；
- 派发 input、change、pointer、mouse；
- 模拟长按；
- 等待面板、列表、selected 状态和消息变化；
- 重新验证消息、会话、模型和指令目标；
- timeout、AbortSignal 与 ActionResult 错误转换。

当前契约为 67 项，注册 handler 61 项，6 项 contract-only：

- stopGeneration；
- continueGeneration；
- editMessage；
- previousBranch；
- nextBranch；
- newChat。

无 handler 动作确定性返回 NOT_AVAILABLE。

### 宿主提供的 Bridge

`HostApp` 先讀 `window.__MMD_HUD_NATIVE_BRIDGE__`，再退回 `MmdNativeBridge`：

```ts
window.__MMD_HUD_NATIVE_BRIDGE__ = bridge            // 已建好的 NativeBridge
window.__MMD_HUD_NATIVE_BRIDGE__ = (document) => bridge // 或工廠，收到宿主 document
```

用途：宿主頁面本身就有應用層狀態（訊息陣列、生成狀態、模型目錄、會話列表）時，
直接用它實作 `NativeBridge`，不必讓 Host 去猜 DOM。Snapshot、Capability、
ActionResult、兩階段確認等契約完全不變，Frame 與 Theme 察覺不到差別。

規則：

- 全域存在但不是有效 `NativeBridge`（缺任一必要方法）時 `HostApp` 直接拋錯，
  不會靜默退回 DOM 抓取——那會把整合錯誤藏在「大致能動」的 HUD 後面；
- 提供者可實作 `getRegisteredActions()`，握手裡的 `registeredActions` 會改用它，
  讓 bridge-debug 能區分「契約沒 handler」與「當下不可用」；
- 這個全域刻意不放進 `__MMD_HUD_IFRAME_CONFIG__`：內嵌注入的啟動片段會整個覆寫
  該物件；
- `MmdNativeBridge` 仍是沒有任何 API 的頁面的預設路徑。

### 單頁宿主的生命週期

`FrameController` 掛載後觀察 `document.body` 的直接子節點；宿主頁面把
`#mmd-hud-iframe-host` 從文件移除時，Host 自行 `destroy()`（關 Session、
銷毀 Bridge 與 observer、刪除全域實例）。`boot()` 再次執行時若既有實例的元素已不在
文件裡，視為過期：先銷毀再重新啟動。這讓沒有 `pagehide` 的單頁應用可以用一般的
DOM 清理當作拆除訊號，不需要知道 Host 的存在。

### NativeGateway

```ts
interface NativeGateway {
  getSnapshot(): ChatSnapshot
  refresh(): void
  subscribe(listener): () => void
  invoke(action, payload?): Promise<ActionResult>
}
```

HostSession 只依赖窄网关，不知道 Bridge 的 observer 和 DOM 实现。

### HostSession

每个 HostSession 对应一个 iframe document、channel 和端口对。它负责：

- runtime decode Frame 输入；
- Build ID、channel、bootstrap ready 校验；
- invoke、refresh、hud-control、cancel-request；
- in-flight request 和重复 request ID；
- Host 侧 15 秒 timeout；
- 转发 Snapshot 与 BridgeEvent；
- close 时清理请求、订阅、timer 和端口。

hud-control 先 ACK，再在 microtask 后执行 hide/destroy/reload，避免端口先关闭。

### HostClient

HostClient 是 Frame 内唯一知道 MessagePort 的业务客户端：

- 验证 handshake source、origin、协议、Build ID、bootstrap ID、Theme 和端口；
- 等待首 Snapshot 后 connection 才 ready；
- 持有响应式 snapshot 与 connection；
- 生成 request ID 并关联响应；
- Frame 侧 16 秒 timeout；
- timeout 后发送 cancel-request；
- 收到 BridgeEvent 时更新 Snapshot；
- 连接关闭或畸形消息时拒绝 pending Promise。

### HudContext

```ts
interface HudContext {
  snapshot: Readonly<Ref<ChatSnapshot>>
  connection: Readonly<Ref<HudConnectionState>>
  invoke<A extends NativeAction>(
    action: A,
    payload?: NativeActionPayload<A>,
  ): Promise<ActionResult>
  invokeDynamic(action: NativeAction, payload?: unknown): Promise<ActionResult>
  refresh(): Promise<ChatSnapshot>
  subscribe(listener: (event: BridgeEvent) => void): () => void
  hideHud(): Promise<void>
  destroyHud(): Promise<void>
}
```

业务 Theme 优先使用类型化 invoke；invokeDynamic 仅适用于 bridge-debug 等动作实验室。

`src/protocol/transport.ts` 的 HostTransport 是未使用的历史接口，现行路径是 HostClient + HudContext。

---

## 4. 启动与握手

```text
MMD 加载 Host IIFE
  → host/main.ts boot()
  → 解析 frameScriptUrl / theme
  → HostApp
  → MmdNativeBridge.start()
  → 首次读取 Snapshot
  → FrameController.mount()
  → 写 iframe.name bootstrap
  → 创建 srcdoc，加载 Frame IIFE
  → Frame 解码 bootstrap
  → HostClient
  → iframe load
  → Host 创建 channel + MessageChannel + HostSession
  → handshake + port2
  → HostClient 验证并发送 frame-ready
  → HostSession 验证 bootstrap ID
  → 订阅 Bridge 并发送首 Snapshot
  → HostClient connection = ready
  → 创建 HudContext 并挂载 Theme
```

首 Snapshot 是正式 Theme 的挂载门禁。

---

## 5. 动作与状态调用链

### 发送消息

```text
Theme context.invoke('sendMessage', { text })
  → HostClient requestId + pending Promise
  → MessagePort invoke
  → HostSession decode/channel 校验
  → NativeGateway.invoke
  → MmdNativeBridge capability 校验
  → actionRegistry.sendMessage
  → 写原生 textarea，派发 input/change
  → 点击发送代理
  → ActionResult
  → invoke-result
  → Theme
```

发送成功只表示原生发送动作成功触发，不表示 AI 已回复。AI 输出继续观察 generation 与 messages。

### MMD 状态变化

```text
MMD DOM / 输入状态变化
  → MutationObserver 或 liveness probe
  → MmdNativeBridge.refresh()（RAF 合并）
  → readMmdSnapshot()
  → revision 变化
  → BridgeEvent
  → HostSession
  → HostClient 更新 shallowRef
  → Theme 响应式重绘
```

### 原生镜像面板

```text
Theme invoke(openXxx)
  → Bridge 确保原生 panel 打开
  → reader 转为 Snapshot 子结构
  → Theme 渲染镜像
  → 用户选择 stable ID/reference
  → invoke(select/set/submitXxx)
  → handler 在 live DOM 中重新定位和验证
  → 等待可观察结果
  → 新 Snapshot
```

ActionResult 与 Snapshot 是独立链路，Theme 不得假设先后顺序。实例规则见 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。

### 两阶段删除

消息和会话删除由 Bridge 强制两阶段确认：

```text
第一次请求
  → 验证目标和确认结构
  → 返回 30 秒 confirmationToken

第二次请求
  → 验证 token / TTL / ID / fingerprint / index / DOM identity
  → 重新绑定 live 目标
  → 原生确认
  → 验证只删除目标
```

Theme 不得绕过。

### hide / show / reload / destroy

- hideHud：Frame 请求 Host 隐藏 iframe，父页面显示恢复按钮；
- show：仅由父页面恢复入口或 API 触发，并要求 Bridge refresh；
- reloadFrame：关闭旧 Session，创建新 bootstrap/channel/端口；
- destroyHud：销毁 FrameController、Bridge、observer、timer、port 和全局 API。

旧 Frame 永远拿不到新 MessagePort。

---

## 6. 共享契约

契约集中在 `src/contracts/bridge.ts`。

### ChatSnapshot

主要字段：

- revision；
- character；
- messages；
- generation；
- connection；
- editPanel、sharePanel；
- modelPanel、modelConfiguration；
- moreMenu、conversationPanel；
- personaPanel、supplementPanel；
- instructionSelector、chatSettings；
- capabilities。

Snapshot 是当前可观察 MMD 投影，不是数据库。

### 消息引用

ChatMessage 包含 id、role、index、text/html、streaming、对象 capability、targetFingerprint 和 nativeIndex。

message.id 是运行时身份，不应作为永久存档主键。敏感动作结合 fingerprint、native index 和 live DOM 重验。

### Capability

```ts
interface Capability {
  available: boolean
  reason?: string
}

type CapabilityMap = Record<NativeAction, Capability>
```

所有 action 始终有 capability。不可用时应显示 reason。

### ActionResult

```ts
interface ActionResult<T = unknown> {
  ok: boolean
  action: NativeAction
  data?: T
  error?: {
    code:
      | 'NOT_FOUND'
      | 'NOT_AVAILABLE'
      | 'INVALID_ARGUMENT'
      | 'TIMEOUT'
      | 'PLATFORM_CHANGED'
      | 'UNKNOWN'
    message: string
  }
}
```

业务失败通常由 ok=false 表达；协议、连接或 RPC 失败会 reject Frame Promise。

### BridgeEvent

- ready；
- snapshot；
- generation-started；
- generation-streaming；
- generation-finished；
- error。

只需渲染时直接观察 snapshot；需要时间线或一次性副作用时使用 subscribe。

---

## 7. Protocol v2

协议文件：

- messages.ts；
- guards.ts；
- frameBootstrap.ts；
- ids.ts；
- wireValue.ts；
- transport.ts（未使用历史接口）。

常量：

```ts
IFRAME_PROTOCOL_NAME = 'mmd-hud-iframe'
IFRAME_PROTOCOL_VERSION = 2
```

Theme ID：

```ts
type HudThemeId = 'game' | 'bridge-debug'
```

HUD control：

```ts
type HudControlCommand = 'hide' | 'destroy' | 'reload-frame'
```

### Bootstrap 与 handshake

bootstrap 经 iframe.name 传递：protocol、Build ID、bootstrap ID、parent origin 和 Theme。

handshake 携带协议、Build ID、bootstrap/channel ID、Theme、known/registered actions 和唯一 MessagePort。

由于 sandbox srcdoc origin 为 opaque，Host 交付端口时 targetOrigin 使用 `*`。安全绑定由以下条件共同完成：

- Host 明确向自己创建的 iframe.contentWindow 发送；
- Frame 验证 event.source === window.parent；
- parent origin 与 opaque null 场景校验；
- 协议、Build ID、bootstrap ID、Theme 匹配；
- 恰好一个端口；
- Host 再验证 frame-ready 的 bootstrap ID 和 channel。

握手后移除全局 message listener，业务只走端口。

### 消息方向

Frame → Host：

- frame-ready；
- invoke；
- refresh；
- hud-control；
- cancel-request。

Host → Frame：

- snapshot；
- bridge-event；
- connection-error；
- host-closing；
- invoke-result；
- refresh-result；
- hud-control-result；
- request-failure。

Snapshot 不隐式充当 invoke ACK。

### Runtime decoder

两端先把跨窗口消息视为 unknown，再校验：

- 普通对象和允许字段；
- message type 和协议版本；
- Build ID、channel、request ID；
- Theme、control、action 枚举；
- action/payload 对应关系；
- stable reference；
- capability 完整性；
- response/request/action/command 关联。

未知字段、未知 control 和畸形 payload fail closed。

### Wire 净化

`toWireValue()`：

- 只接受 null/undefined/string/boolean/有限数字/数组/对象；
- 拒绝函数、symbol、bigint、NaN、Infinity、循环引用；
- 最大深度 12；
- 数组最多 10,000；
- 对象最多 1,000 字段；
- 复制为 null-prototype plain object；
- 不传播 Vue Proxy identity。

### Timeout 与取消

- 连接/首 Snapshot：10 秒；
- Host request：15 秒；
- Frame RPC：16 秒。

当前 cancel-request 取消等待和响应，但 AbortSignal 尚未贯穿 NativeGateway；已经进入 Bridge 的 DOM 动作可能继续。完整加固见 [架构优化路线图](ROADMAP.md)。

refresh 当前是 eventual 语义，refresh-result 可能仍是旧 revision，真正 Snapshot 随后到达。

---

## 8. MMD DOM Adapter

### Selector

所有 selector、关键中文文案和按钮签名集中在 `src/bridge/mmd/selectors.ts`。MMD 改版时优先修 reader/resolver，禁止复制 selector 到 Theme。

### Reader 模块

| 模块 | 作用 |
|---|---|
| snapshotReader.ts | 汇总完整 ChatSnapshot 和 capability |
| snapshotQueryCache.ts | 单次读取缓存重复 selector，不跨 revision 保存节点 |
| generationReader.ts | 推测 idle/starting/streaming |
| messageIdentity.ts | fingerprint、native index 与 live 对齐 |
| messageActions.ts | 消息操作、删除能力和目标验证 |
| headerActions.ts | 顶部评论/分享/收藏/刷新识别 |
| modelPanels.ts | 模型筛选、列表、配置和异步 rows |
| editPanel.ts | 编辑面板和 transform |
| morePanels.ts | 更多菜单、会话、人设和补充设定 |
| instructionSelector.ts | 快捷栏、指令和引用 |
| chatSettings.ts | 对话设置 |
| sharePanel.ts | 分享数据 |

### Stable reference 与 fail closed

消息、会话、模型和指令不能只按数组下标或可见文字点击。Bridge 组合：

- stable/local ID；
- role；
- normalized text / HTML fingerprint；
- native index；
- revision；
- label + icon/结构签名；
- DOM identity；
- 结果列表差异。

目标不唯一、列表变化、panel 被替换或 fingerprint 失效时返回 PLATFORM_CHANGED。

### 原生 HTML

message.html 在 Frame 使用 v-html 前必须经过 `src/hud/shared/sanitizeHtml.ts`。它删除脚本、样式、iframe、表单、事件属性、任意链接/style 等，只保留受控文本排版和验证过的文字颜色。

---

## 9. 源码目录

```text
src/
├─ contracts/
│  └─ bridge.ts
├─ bridge/
│  ├─ MmdNativeBridge.ts
│  ├─ actions/
│  └─ mmd/
├─ protocol/
│  ├─ messages.ts
│  ├─ guards.ts
│  ├─ frameBootstrap.ts
│  ├─ ids.ts
│  └─ wireValue.ts
├─ host/
│  ├─ main.ts
│  ├─ HostApp.ts
│  ├─ FrameController.ts
│  ├─ HostSession.ts
│  └─ NativeGateway.ts
├─ frame/
│  ├─ main.ts
│  └─ connection/HostClient.ts
├─ hud/
│  ├─ context.ts
│  ├─ shared/
│  └─ themes/
└─ dev/mockMmd.ts
```

---

## 10. 架构修改前的阅读顺序

1. 本文；
2. [架构优点与设计权衡](ARCHITECTURE_RATIONALE.md)；
3. `src/contracts/bridge.ts`；
4. `src/protocol/messages.ts` 与 guards；
5. 目标层源码和测试；
6. [架构优化路线图](ROADMAP.md)。

新增 NativeAction 时，按照 [Bridge 原生能力开发指南](BRIDGE_DEVELOPMENT.md) 执行。
