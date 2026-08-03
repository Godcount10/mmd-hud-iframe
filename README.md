# MMD HUD iframe

一个覆盖在 MMD（魅魔岛）聊天页面之上的全屏游戏 HUD。

本项目不重写 MMD 的登录、会话、AI 请求、流式生成、消息持久化、模型或设置。注入父页面的 Host 将 MMD 原生页面保留为唯一真实状态源和执行引擎；Vue HUD 运行在无 `allow-same-origin` 的 sandbox `srcdoc` iframe 中，只通过一次性 `MessagePort` 接收纯数据快照、订阅事件并请求经过验证的标准动作。

```text
MMD 原生页面
  └─ MmdNativeBridge：DOM → Snapshot / NativeAction → DOM
       └─ HostApp / FrameController / HostSession
            ║  MessagePort（协议 v2、纯数据、每次 reload 独立世代）
            ▼
         HostClient / HudContext
            └─ Vue Theme：game / bridge-debug / 后续具体实例
```

> **当前实现状态（2026-08-03）**
>
> - 协议 v2、67 项动作契约、61 个原生 handler、Host/Frame 双构建和跨窗口测试已经可用；
> - `typecheck` 通过，当前测试为 **8 个文件、37 项测试全部通过**；
> - Host 与 Frame 构建通过，Frame 的 SFC CSS 已在构建阶段注入单一 Frame IIFE；
> - 真实 MMD 的完整 61 项动作回归、移动端、CSP、BFCache 和发布自动化仍需继续验收。

`README.md` 是当前项目的维护文档；运行行为仍以源码和测试为最终依据。

---

## 目录

- [1. 设计目标与状态归属](#1-设计目标与状态归属)
- [2. 完整运行时架构](#2-完整运行时架构)
- [3. 各个 Bridge / 适配边界的作用](#3-各个-bridge--适配边界的作用)
- [4. 启动、动作和状态调用链](#4-启动动作和状态调用链)
- [5. 共享契约：Snapshot、Capability、Action、Event](#5-共享契约snapshotcapabilityactionevent)
- [6. 通信协议 v2](#6-通信协议-v2)
- [7. MMD DOM 适配层](#7-mmd-dom-适配层)
- [8. Theme 与三类界面](#8-theme-与三类界面)
- [9. 目录结构](#9-目录结构)
- [10. 本地开发](#10-本地开发)
- [11. 测试与构建](#11-测试与构建)
- [12. 开发一个具体 HUD 实例](#12-开发一个具体-hud-实例)
- [13. 扩展新的 MMD 原生能力](#13-扩展新的-mmd-原生能力)
- [14. 本地状态与 AI 文本派生状态](#14-本地状态与-ai-文本派生状态)
- [15. 发布与 MMD 注入](#15-发布与-mmd-注入)
- [16. 调试工具与父页面 API](#16-调试工具与父页面-api)
- [17. 已知限制与后续工作](#17-已知限制与后续工作)

---

## 1. 设计目标与状态归属

### 1.1 MMD 始终是原生状态源

MMD 父页面继续负责：

- 登录、身份和角色；
- 当前聊天与历史会话；
- AI 模型请求与流式生成；
- 消息持久化；
- 模型选择与配置；
- 用户人设、设定补充、对话设置和指令；
- 原生编辑、回溯、删除、分享、评论、收藏等功能。

HUD 不复制这些系统，也不尝试维护第二套“原生真相”。

### 1.2 iframe HUD 负责什么

Frame 中的 Vue Theme 负责：

- 全屏游戏化界面；
- 动画、Canvas、WebGL 和视觉效果；
- 对 MMD Snapshot 的响应式渲染；
- 原生面板的镜像 UI；
- 从消息文本派生的游戏状态；
- 地图、图鉴、UI 偏好等纯本地玩法；
- 通过 `HudContext.invoke()` 请求 MMD 原生动作。

### 1.3 不可破坏的边界

1. `MmdNativeBridge`、MMD selector、DOM reader、observer 和 action handler 只能运行在父页面。
2. iframe / Theme 不读取或操作 `window.parent.document`。
3. Theme 不导入 `src/bridge/`、`src/host/` 或 transport 实现。
4. Bridge 不导入 Vue Theme。
5. 跨窗口不传 DOM 节点、函数、事件对象、Vue ref 或 Vue Proxy。
6. 不读取或传输 Cookie、Authorization、登录 token 或 MMD 内部 storage。
7. 全局 `window.postMessage` 只用于首次握手和转交唯一 `MessagePort`；业务通信只走该端口。
8. Host 与 Frame 的协议版本和 Build ID 必须匹配。
9. 每次 iframe load/reload 都创建新的 bootstrap ID、channel ID、MessagePort 和 `HostSession`。
10. Theme 不能因为某项 action 存在于类型中，就假定它当前可执行；运行时以最新 capability 为准。
11. MMD 的 server/native 状态与 HUD 的本地状态必须分开存放。
12. 保留完整 67 项 `NativeAction` 契约，不通过删类型或 `any` 绕过迁移问题。

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
                                │ NativeGateway（Host 窄接口）
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
│ game / bridge-debug / 后续具体实例                                 │
└────────────────────────────────────────────────────────────────────┘
```

### 2.1 两个构建、两个 JavaScript Realm

项目生成两个独立 IIFE：

- **Host IIFE**：在 MMD 父页面 Realm 执行，能访问 MMD `document`；
- **Frame IIFE**：在 sandbox `srcdoc` iframe Realm 执行，不能访问父页面 DOM。

Frame 脚本来自 HTTPS/CDN，但 Frame document 本身不是该 CDN 的普通页面 origin。因为 iframe 没有 `allow-same-origin`，它运行在 **opaque origin** 中。

### 2.2 `srcdoc` 而不是远程 HTML

Host 不导航到一个远程 `index.html`，而是：

1. 创建最小 `srcdoc`；
2. 在 `srcdoc` 中创建 `#app`；
3. 从 `frameScriptUrl` 加载 Frame IIFE；
4. 通过 `iframe.name` 传入 bootstrap；
5. 通过 `MessageChannel` 传入业务端口。

这样不依赖 CDN 正确返回 HTML MIME，同时保留了无 `allow-same-origin` 的隔离。

---

## 3. 各个 Bridge / 适配边界的作用

项目里“Bridge”不是单一文件，而是一条由多个窄边界组成的链。每层只处理自己应该知道的内容。

### 3.1 Bridge 总览

| 层 | 文件 | 方向 | 主要作用 |
|---|---|---|---|
| Domain Contract | `src/contracts/bridge.ts` | 双端共享 | 定义 Snapshot、67 项 Action、Payload、Capability、Event、Result |
| MMD DOM Adapter | `src/bridge/mmd/*` | DOM → 纯数据 | 集中 selector，读取消息/面板/生成状态，构造稳定引用 |
| Action Registry | `src/bridge/actions/actionRegistry.ts` | 标准动作 → DOM | 把 Action 转成经过验证的原生点击、输入、长按和结果检查 |
| MmdNativeBridge | `src/bridge/MmdNativeBridge.ts` | DOM ↔ Bridge API | 观察 DOM、维护 Snapshot、计算 capability、执行 action、发事件 |
| NativeGateway | `src/host/NativeGateway.ts` | HostSession → Bridge | 让 RPC 层只依赖最小原生网关，而不是具体 Bridge 类 |
| HostSession | `src/host/HostSession.ts` | MessagePort ↔ NativeGateway | Frame RPC 服务端、请求关联、超时、重复 ID、防陈旧 channel |
| HostClient | `src/frame/connection/HostClient.ts` | Theme ↔ MessagePort | Frame RPC 客户端、握手、响应式 Snapshot、pending Promise |
| HudContext | `src/hud/context.ts` | Theme ↔ HostClient | 向 Theme 暴露稳定而窄的 Vue 接口，隐藏端口与父页面实现 |
| Game Feed | `src/hud/themes/game/composables/useGameFeed.ts` | Snapshot → 游戏状态 | 将只读消息接入 `[A=B]` 解析链，是 AI 文本派生状态的桥 |
| Game Store | `src/hud/themes/game/stores/gameStore.ts` | 纯逻辑 ↔ Vue/UI | systems 与 components 之间的响应式、本地存储适配层 |

### 3.2 `MmdNativeBridge`：原生页面总桥

`src/bridge/MmdNativeBridge.ts` 是父页面中的核心 Bridge，实现 `NativeBridge`。

职责：

- 启动和销毁 DOM observer；
- 每 900ms 检查消息列表和输入生成状态；
- 将高频 DOM 变化合并到一次 `requestAnimationFrame` 刷新；
- 通过 reader 创建 `ChatSnapshot`；
- 动态计算完整 `CapabilityMap`；
- 通过 action registry 执行原生动作；
- 管理 Bridge 自己的 action `AbortController`；
- 推送 `ready`、`snapshot`、generation 和 error 事件；
- 在 MMD DOM 结构变化时 fail closed。

主要 API：

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

安全语义：

- `getSnapshot()` 和事件中的 Snapshot 都会克隆；
- `invoke()` 首先检查最新 capability；
- handler 执行时仍会重新读取 live DOM，不仅相信旧 Snapshot；
- Bridge 销毁后未完成动作返回不可用；
- DOM 解析异常时 connection 变为 `disconnected`，全部原生能力关闭，并发送 `PLATFORM_CHANGED`。

### 3.3 `actionRegistry`：标准动作到原生行为

`src/bridge/actions/actionRegistry.ts` 将 `NativeAction` 转成真正的 MMD DOM 操作。

它不仅“点按钮”，还负责：

- 调用原生 input/textarea value setter；
- 派发 `input`、`change`、pointer 和 mouse 事件；
- 模拟长按；
- 等待 panel 打开/关闭、列表改变、消息改变、selected 状态改变；
- 重新验证消息、会话、模型、指令等目标；
- 处理 timeout 与 AbortSignal；
- 将异常统一转换为 `ActionResult`。

当前共有：

- **67 项契约**；
- **61 项注册 handler**；
- **6 项 contract-only 安全占位**：
  - `stopGeneration`
  - `continueGeneration`
  - `editMessage`
  - `previousBranch`
  - `nextBranch`
  - `newChat`

没有 handler 的动作确定性返回 `NOT_AVAILABLE`，不会猜测性操作 DOM。

### 3.4 `NativeGateway`：RPC 与具体 Bridge 解耦

`src/host/NativeGateway.ts` 只暴露：

```ts
interface NativeGateway {
  getSnapshot(): ChatSnapshot
  refresh(): void
  subscribe(listener): () => void
  invoke(action, payload?): Promise<ActionResult>
}
```

`HostSession` 只依赖这个接口，不依赖 `MmdNativeBridge` 的 observer、生命周期或具体 DOM 实现。当前 `MmdNativeBridge` 在结构上实现了该网关。

方向：

```text
HostSession → NativeGateway → MmdNativeBridge
```

### 3.5 `HostSession`：MessagePort RPC 服务端

一个 `HostSession` 只对应一个 iframe document、一个 channel ID 和一对 MessagePort。

职责：

- runtime decode 所有 Frame 输入；
- 校验 Build ID、channel ID、bootstrap ready；
- ready 前拒绝业务请求；
- 处理 `invoke`、`refresh`、`hud-control` 和 `cancel-request`；
- 维护 in-flight request；
- 拒绝正在执行或最近完成的重复 request ID；
- Host 侧 15 秒超时；
- 转发 Snapshot 和 BridgeEvent；
- close 时终止请求等待、订阅、timer 和端口。

`hud-control` 会先发送 ACK，再在一个 microtask 后执行 hide/destroy/reload，避免端口先关闭导致 Frame 永远等不到结果。

### 3.6 `HostClient`：Frame RPC 客户端

`src/frame/connection/HostClient.ts` 是 iframe 中唯一知道 `MessagePort` 的业务客户端。

职责：

- 验证握手 source、origin、协议、Build ID、bootstrap ID、Theme 和唯一端口；
- 等待首个有效 Snapshot 后才将连接置为 `ready`；
- 持有响应式 `snapshot` 和 `connection`；
- 为请求生成 request ID；
- 关联 request ID、response type、action 和 control command；
- Frame 侧 16 秒 RPC timeout；
- timeout 后发送 `cancel-request`；
- 收到 BridgeEvent 时更新 Snapshot 并通知订阅者；
- Host closing、端口错误或畸形 Host 消息时拒绝 pending Promise。

### 3.7 `HudContext`：Theme 的唯一宿主入口

Theme 通过 Vue injection 获得：

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

设计意图：

- 业务 Theme 优先使用类型化 `invoke()`；
- 只有动作实验室等动态工具才使用 `invokeDynamic()`；
- Theme 不获得父页面、MessagePort、MMD selector 或完整 `NativeBridge`；
- Theme 不能直接 `showHud()`：隐藏后的恢复入口属于父页面 `FrameController`。

### 3.8 `HostTransport` 的当前地位

`src/protocol/transport.ts` 中还保留了旧的 `HostTransport` 接口，但当前没有实现类或消费者。现行路径是：

```text
HostClient + HudContext
```

不要再按照历史文档中的 `MessagePortHostTransport` 路径开发新功能。

---

## 4. 启动、动作和状态调用链

### 4.1 启动与握手

```text
MMD 加载 Host IIFE
  → src/host/main.ts boot()
  → 解析 frameScriptUrl / theme
  → new HostApp()
  → new MmdNativeBridge(document)
  → MmdNativeBridge.start()
  → 首次读取 MMD Snapshot
  → FrameController.mount()
  → 写 iframe.name bootstrap
  → 创建 sandbox srcdoc 并加载 Frame IIFE
  → Frame decodeFrameBootstrap(window.name)
  → new HostClient(...)
  → iframe load
  → Host 创建 channel ID + MessageChannel + HostSession
  → Host 向该 iframe contentWindow 发送 handshake + port2
  → HostClient 验证并通过 port2 发送 frame-ready
  → HostSession 验证 bootstrap ID
  → HostSession 订阅 Bridge 并发送首 Snapshot
  → HostClient connection = ready
  → Frame 创建 HudContext 并挂载 Theme
```

**首 Snapshot 是挂载门禁**：只完成握手但没有 Snapshot 时，不挂载正式 Theme。

### 4.2 发送消息

```text
ConversationPage
  → context.invoke('sendMessage', { text })
  → HostClient 创建 requestId 和 pending Promise
  → MessagePort: invoke
  → HostSession runtime decode + channel 校验
  → NativeGateway.invoke()
  → MmdNativeBridge capability 校验
  → actionRegistry.sendMessage
  → 写入 MMD 原生 textarea
  → dispatch input/change
  → 下一帧点击原生发送代理
  → ActionResult
  → MessagePort: invoke-result
  → HostClient 关联 requestId/action
  → Theme 获得结果
```

`sendMessage` 成功只表示“原生输入和发送动作成功触发”，**不表示 AI 已回复**。AI 输出要继续观察 `snapshot.generation` 和 `snapshot.messages`。

### 4.3 MMD 状态变化与流式输出

```text
MMD DOM / 输入状态变化
  → MutationObserver 或 900ms liveness probe
  → MmdNativeBridge.refresh()（RAF 合并）
  → readMmdSnapshot()
  → Snapshot revision 变化
  → snapshot / generation-* BridgeEvent
  → HostSession 转发 bridge-event
  → HostClient 更新 shallowRef
  → Vue Theme 响应式重绘
```

### 4.4 原生镜像面板

模型、会话、消息编辑、人设和设定补充使用同一模式：

```text
Theme invoke('openXxx')
  → Bridge 打开 MMD 原生 panel
  → reader 将 panel 转成 Snapshot 子结构
  → iframe 根据 Snapshot 重绘 NATIVE MIRROR UI
  → 用户在镜像 UI 选择 stable ID/reference
  → invoke('set/select/submitXxx', payload)
  → Bridge 在 live DOM 中重新定位和验证目标
  → 执行原生操作并等待可观察结果
  → 新 Snapshot 推送
```

镜像 UI 不拥有原生状态，也不自行持久化 MMD 设置。

### 4.5 两阶段删除

消息删除和会话删除由 Bridge 强制执行两阶段确认。

```text
第一次请求
  → 验证目标与原生确认结构
  → 不执行最终删除
  → 返回 30 秒 confirmationToken

第二次请求
  → 验证 token / TTL / ID / fingerprint / index / DOM identity
  → 重新绑定 live 目标
  → 执行原生确认
  → 验证只删除了目标对象
  → 返回 deleted
```

不要在新 Theme 中绕过这个流程做“一次点击直接删除”。

### 4.6 hide / show / reload / destroy

- `hideHud()`：Frame 请求 Host 隐藏 iframe；父页面显示“打开 HUD”按钮。
- `show()`：只能由父页面恢复按钮或调试 API触发，并会要求 Bridge refresh。
- `reloadFrame()`：关闭旧 Session，创建新 bootstrap、channel 和端口。
- `destroyHud()`：销毁 FrameController、Bridge、observer、timer、端口和全局 API。

旧 Frame 永远拿不到新 MessagePort，因此旧请求不能在 reload 后误投到新 Frame。

---

## 5. 共享契约：Snapshot、Capability、Action、Event

共享契约集中在 `src/contracts/bridge.ts`。

### 5.1 `ChatSnapshot`

`ChatSnapshot` 包含：

- `revision`；
- `character`；
- `messages`；
- `generation`；
- `connection`；
- `editPanel`；
- `sharePanel`；
- `modelPanel`；
- `modelConfiguration`；
- `moreMenu`；
- `conversationPanel`；
- `personaPanel`；
- `supplementPanel`；
- `instructionSelector`；
- `chatSettings`；
- 完整 `capabilities`。

Snapshot 是“当前可观察的 MMD 投影”，不是 MMD 数据库，也不保证包含平台全部内部字段。

### 5.2 消息引用

每条 `ChatMessage` 包含：

- `id`、`role`、`index`；
- `text` 和 `html`；
- `streaming`；
- 每消息 capability；
- `targetFingerprint`；
- `nativeIndex`。

`message.id` 是运行时身份，不应作为跨会话永久存档主键。破坏性或目标敏感动作会结合 fingerprint、native index 和 live DOM 重新校验。

### 5.3 Capability

```ts
interface Capability {
  available: boolean
  reason?: string
}

type CapabilityMap = Record<NativeAction, Capability>
```

所有 67 项 action 始终都有 capability。关闭功能时应向用户显示 `reason`，而不是静默失效。

常见关闭原因：

- 原生 panel 尚未打开；
- 输入框禁用；
- AI 正在生成；
- 目标消息或会话不再匹配；
- MMD DOM 结构不完整；
- action 只有契约，没有 handler。

### 5.4 ActionResult 与错误码

Bridge 结果：

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

业务失败通常通过 `ActionResult.ok === false` 表达；协议、连接或 RPC 失败会使 Frame 侧 Promise reject。

### 5.5 BridgeEvent

事件类型：

- `ready`
- `snapshot`
- `generation-started`
- `generation-streaming`
- `generation-finished`
- `error`

Theme 只需要渲染状态时，直接观察 `snapshot`；需要时间线或一次性副作用时，再使用 `subscribe()`。

---

## 6. 通信协议 v2

协议定义位于 `src/protocol/`：

- `messages.ts`：消息类型和协议常量；
- `guards.ts`：双向 runtime decoder；
- `frameBootstrap.ts`：`window.name` bootstrap 与 `srcdoc`；
- `ids.ts`：request/bootstrap/channel ID 与 timeout；
- `wireValue.ts`：Wire 数据净化；
- `transport.ts`：当前未使用的历史接口。

### 6.1 协议常量

```ts
IFRAME_PROTOCOL_NAME = 'mmd-hud-iframe'
IFRAME_PROTOCOL_VERSION = 2
```

当前 Theme ID：

```ts
type HudThemeId = 'game' | 'bridge-debug'
```

HUD control：

```ts
type HudControlCommand = 'hide' | 'destroy' | 'reload-frame'
```

### 6.2 Bootstrap 与握手

Bootstrap 通过 `iframe.name` 传递：

- bootstrap protocol；
- Build ID；
- bootstrap ID；
- parent origin；
- Theme。

握手携带：

- protocol name/version；
- Build ID；
- bootstrap ID；
- channel ID；
- Theme；
- 67 项 known actions；
- 当前 61 项 registered actions；
- 唯一 `MessagePort`。

#### 为什么 Host 使用 `targetOrigin: '*'`

当前接收方是无 `allow-same-origin` 的 sandbox `srcdoc`，其 origin 是 opaque，不能用普通 HTTPS origin 精确定位。因此 Host 在向**自己创建并持有的 `iframe.contentWindow`** 转交端口时使用 `'*'`。

这个 `'*'` 只用于首次端口交付；安全绑定由以下条件共同完成：

- Host 明确调用该 iframe 的 `contentWindow`；
- Frame 要求 `event.source === window.parent`；
- Frame 接受预期 parent origin，兼容 opaque 场景中的 `"null"`；
- 协议版本、Build ID、bootstrap ID 和 Theme 匹配；
- 恰好一个 `MessagePort`；
- Host 再验证 `frame-ready` 的 bootstrap ID 和 channel。

握手完成后 Frame 移除全局 `message` listener，所有业务消息只走端口。

### 6.3 Frame → Host

- `frame-ready`
- `invoke`
- `refresh`
- `hud-control`
- `cancel-request`

### 6.4 Host → Frame

状态与生命周期：

- `snapshot`
- `bridge-event`
- `connection-error`
- `host-closing`

RPC 响应：

- `invoke-result`
- `refresh-result`
- `hud-control-result`
- `request-failure`

Snapshot 推送是独立状态消息，不隐式充当任意 invoke 的 ACK。

### 6.5 Runtime decoder

TypeScript 类型不能验证跨窗口输入，因此两端先把消息当作 `unknown`，再验证：

- 普通对象和允许字段；
- message type；
- protocol version；
- Build ID、channel ID；
- 非空 request ID；
- Theme、control、action 枚举；
- action 与 payload 的对应关系；
- 会话和指令引用结构；
- Snapshot capability 完整性；
- response type、request ID、action 和 command 关联。

未知字段、未知 control 和畸形 payload 均 fail closed。

> 当前 Snapshot decoder 对 capability 完整性检查较严格，但对 `messages`、各 panel 子结构和成功 `ActionResult.data` 仍是较浅验证；完整领域 schema decoder 属于后续加固项。

### 6.6 Wire 数据净化

`toWireValue()` 在双端发送前递归复制：

- 只接受 `null`、`undefined`、字符串、布尔值、有限数字、数组和对象；
- 拒绝函数、symbol、bigint 等值；
- 拒绝 `NaN` / `Infinity`；
- 拒绝循环引用；
- 最大嵌套深度 12；
- 最大数组长度 10,000；
- 单对象最多 1,000 个字段；
- 对象被复制为 null-prototype plain object；
- Vue Proxy identity 不会跨端传播。

### 6.7 Timeout、取消与 refresh 语义

- 连接/首 Snapshot timeout：10 秒；
- Host request timeout：15 秒；
- Frame RPC timeout：16 秒。

当前取消语义的限制：

- Frame timeout 后发送 `cancel-request`；
- HostSession 会停止等待和回复；
- 但 HostSession 的 AbortSignal 目前没有传入 `NativeGateway.invoke()`；
- 已经进入 `MmdNativeBridge.invoke()` 的原生 DOM 动作可能继续；
- 销毁整个 Bridge 才会 abort Bridge 自己管理的动作。

因此当前 `cancel-request` 更准确地说是“取消请求等待/响应”，还不是完整端到端原生动作取消。

`refresh()` 也采用 eventual 语义：Bridge refresh 通过 RAF 调度，而 HostSession 随即读取当前 Snapshot；`refresh-result` 可能仍是旧 revision，真正刷新后的 Snapshot 随后通过 BridgeEvent 到达。

---

## 7. MMD DOM 适配层

### 7.1 Selector 集中管理

所有 MMD selector、关键中文文案和按钮签名集中在：

```text
src/bridge/mmd/selectors.ts
```

MMD DOM 改版时优先在 reader/selector 层修复，不要把 selector 复制到 Theme。

### 7.2 Reader 模块

| 模块 | 作用 |
|---|---|
| `snapshotReader.ts` | 汇总角色、消息、所有 panel 和 capability，生成完整 `ChatSnapshot` |
| `snapshotQueryCache.ts` | 为单次 Snapshot 读取缓存重复 selector 查询，不跨 revision 保存节点 |
| `generationReader.ts` | 从输入框禁用状态、输入提示和最后一条 AI 消息推测 idle/starting/streaming |
| `messageIdentity.ts` | 构建消息 fingerprint，处理 native index 和 live 列表对齐 |
| `messageActions.ts` | 验证消息操作菜单、inline action group、删除能力和 live 消息目标 |
| `headerActions.ts` | 精确识别顶部评论/分享/收藏/刷新四按钮 |
| `modelPanels.ts` | 读取模型筛选、模型列表、配置控件，并等待异步模型 rows |
| `editPanel.ts` | 读取唯一编辑面板、编辑器和文本 transform |
| `morePanels.ts` | 读取更多菜单、会话、人设、补充设定和 picker |
| `instructionSelector.ts` | 读取快捷栏与指令列表，维护 revision/fingerprint 引用 |
| `chatSettings.ts` | 识别并读取原生对话设置 panel |
| `sharePanel.ts` | 读取分享标题、说明和链接 |

### 7.3 Stable reference 与 fail-closed

对消息、会话、模型和指令的操作不能只按“数组下标”或“可见文字”点击。

现有 Bridge 会组合使用：

- stable/local ID；
- role；
- normalized text / HTML fingerprint；
- native index；
- Snapshot revision；
- label + icon/结构签名；
- DOM 节点 identity；
- 结果列表差异。

如果目标不再唯一、列表变化、panel 被替换或 fingerprint 失效，动作返回 `PLATFORM_CHANGED`，而不是点击一个“看起来差不多”的元素。

### 7.4 原生 HTML 的 Frame 渲染

`message.html` 进入 `v-html` 前必须经过 `src/hud/shared/sanitizeHtml.ts`。

Sanitizer：

- 禁止 script、style、iframe、object、embed、SVG、form、input、button、canvas、media 等；
- 只保留受控文本排版标签；
- 未知标签只展开其子节点；
- 不复制事件属性、class、链接和任意 style；
- 仅保留浏览器验证过的文字颜色；
- 提供按 message ID + content hash 的有界缓存。

---

## 8. Theme 与三类界面

### 8.1 当前 Theme

#### `game`

正式游戏 HUD，包含：

- 游戏对话页；
- 消息流式动画；
- 模型、会话、编辑、人设、补充设定等原生镜像；
- 游戏菜单、开局面板和 overlay；
- `[A=B]` 状态栏；
- 本地地图、图鉴、自动提示词接口；
- DEV Bridge/解析诊断入口。

入口：

```text
src/hud/themes/game/index.ts
src/hud/themes/game/GameHud.vue
```

#### `bridge-debug`

完整 Bridge 实验室，包含：

- 67 项动作目录；
- 61 项已实现 / 6 项占位过滤；
- capability 和不可用原因；
- 动态 payload 表单；
- 危险动作 UI 确认；
- 两阶段删除 token；
- Snapshot 历史和 diff；
- BridgeEvent 时间线；
- ActionResult 审计；
- 默认脱敏导出和二次确认的完整导出；
- 消息发送和模型快速切换；
- 本地视觉效果设置。

入口：

```text
src/hud/themes/bridge-debug/index.ts
src/hud/themes/bridge-debug/BridgeDebugHud.vue
```

### 8.2 三类界面必须区分

#### A. 原生镜像（Native Mirror）

例如模型、会话、人设、补充设定、消息编辑。

- 数据来自 Snapshot；
- 操作通过 NativeAction 回到 MMD；
- MMD 是唯一真实状态源；
- Theme 不直接保存原生设置。

#### B. AI 文本派生状态

例如从消息中提取：

```text
[好感度=80]
[地点=红井]
[黄金瞳=开启]
```

- 只读 `snapshot.messages`；
- 本地解析为游戏状态；
- 不回写 Snapshot；
- 是否写入本地存档由游戏层决定。

#### C. 纯本地功能

例如地图、图鉴、UI 偏好、动效设置。

- 不对应 MMD 原生 panel；
- 不需要新增 NativeAction；
- 使用 Theme 自己的 store/system；
- 必须在 storage 不可用时仍能运行。

把这三类功能混在一起会造成错误的状态归属和维护边界。

---

## 9. 目录结构

```text
mmd-hud-iframe/
├─ README.md
├─ package.json
├─ package-lock.json
├─ frame/
│  └─ index.html                     # Frame Vite 开发入口，不是生产 HTML
├─ host-dev/
│  ├─ index.html
│  └─ src/main.ts                    # Mock MMD + Host
├─ build/
│  └─ frameCssInjection.ts           # 将 Vite CSS 资产注入 Frame IIFE
├─ scripts/
│  └─ serve-cors.mjs                 # 为构建后的 Frame JS 提供 5273 CORS 服务
├─ src/
│  ├─ contracts/
│  │  └─ bridge.ts                   # Snapshot / Action / Payload / Event 契约
│  ├─ bridge/
│  │  ├─ MmdNativeBridge.ts
│  │  ├─ actions/
│  │  │  ├─ actionRegistry.ts
│  │  │  └─ capabilities.ts
│  │  └─ mmd/                        # selector 与 DOM reader/resolver
│  ├─ protocol/
│  │  ├─ messages.ts
│  │  ├─ guards.ts
│  │  ├─ frameBootstrap.ts
│  │  ├─ ids.ts
│  │  ├─ wireValue.ts
│  │  └─ transport.ts                # 未使用的历史接口
│  ├─ host/
│  │  ├─ main.ts
│  │  ├─ HostApp.ts
│  │  ├─ FrameController.ts
│  │  ├─ HostSession.ts
│  │  └─ NativeGateway.ts
│  ├─ frame/
│  │  ├─ main.ts
│  │  ├─ connection/HostClient.ts
│  │  └─ state/createDisconnectedSnapshot.ts
│  ├─ hud/
│  │  ├─ context.ts
│  │  ├─ shared/sanitizeHtml.ts
│  │  └─ themes/
│  │     ├─ types.ts
│  │     ├─ game/
│  │     └─ bridge-debug/
│  └─ dev/mockMmd.ts
├─ tests/
│  ├─ build/
│  ├─ protocol/
│  ├─ host/
│  ├─ frame/
│  └─ helpers/
└─ dist/
   ├─ host/mmd-hud-iframe-host.js
   └─ frame/mmd-hud-iframe-frame.js
```

---

## 10. 本地开发

需要 Node.js 和 npm。

```bash
npm ci
```

已有 lockfile，推荐使用 `npm ci`，而不是依赖现存 `node_modules`。

### 10.1 当前可用的完整 Mock 联调流程

当前 Host Mock 加载的是 `5273` 上**已构建的 Frame IIFE**，所以完整联调需要三个步骤。

#### 终端 A：构建 Frame

```bash
npm run build:frame
```

开发 Build ID 默认是 `dev`，与 Host Dev 一致。

#### 终端 B：提供 Frame JS

在项目根目录运行：

```bash
node scripts/serve-cors.mjs dist/frame 5273
```

服务地址：

```text
http://127.0.0.1:5273/mmd-hud-iframe-frame.js
```

#### 终端 C：启动 Mock MMD + Host

```bash
npm run dev:host
```

打开：

```text
正式 game：
http://127.0.0.1:5174/

Bridge Debug：
http://127.0.0.1:5174/?theme=bridge-debug
```

Host 页面在 5174，Frame 脚本来自 5273，而真正的 Frame document 是 opaque sandbox `srcdoc`。这比“两个普通跨 origin 页面”更接近当前生产架构。

### 10.2 `npm run dev` 的真实用途

```bash
npm run dev
```

会在 `127.0.0.1:5173` 启动 `frame/index.html`，但直接访问该页面没有：

- `window.name` bootstrap；
- 父页面 Host；
- MessagePort；
- 初始 Snapshot。

因此它会正常显示“缺少 bootstrap / 无法连接 Host”的错误页，而不是一个可操作的独立 HUD。当前没有内置的“假 HudContext standalone Theme playground”；完整功能开发请使用 5273 + 5174 Mock 流程。

### 10.3 Mock 能验证什么

Mock 可以验证：

- bootstrap、握手和 MessagePort；
- Snapshot 和 capability；
- 消息发送与模拟流式输出；
- 多数模型、会话、编辑、人设、补充设定流程；
- hide/show/reload/destroy；
- Theme 与响应式行为。

Mock 不能替代：

- 真实 MMD DOM 与中文文案；
- 真实事件时序；
- AI provider 行为；
- 生产 CSP；
- MMD 路由与 BFCache；
- 真实移动端软键盘、safe-area 和权限策略。

### 10.4 浏览器联调清单

- Console 无异常；
- Frame JS 200，CORS 正常；
- 首 Snapshot 前 Theme 不挂载；
- 发送成功后才清空草稿；
- 流式更新来自 Snapshot；
- capability 不可用时按钮禁用并显示原因；
- hide 后父页面出现“打开 HUD”；
- reload 后创建新 channel，旧请求不回流；
- destroy 后 iframe、恢复按钮、observer、timer 和 port 被清理；
- 390×844、横屏、桌面宽屏；
- `prefers-reduced-motion`；
- 页面隐藏/恢复；
- WebGL/Canvas 失败降级；
- storage 被拒绝时 Theme 仍能运行。

---

## 11. 测试与构建

### 11.1 命令

```bash
npm run typecheck
npm test
npm run test:watch
npm run build:host
npm run build:frame
npm run build
```

`npm run build` 执行：

```text
typecheck → build:host → build:frame
```

### 11.2 当前验证结果

2026-08-03 在本项目中实际执行：

- `npm run typecheck`：通过；
- `npm test`：8 个测试文件、37 项测试通过；
- `npm run build:host`：通过；
- `npm run build:frame`：通过。

### 11.3 现有测试覆盖

- handshake action 集合完整性；
- malformed control / payload fail closed；
- Snapshot capability 完整性；
- bootstrap round-trip 与 HTTPS/loopback 限制；
- 首 Snapshot ready 门禁；
- invoke request/result/action 关联；
- stale channel 响应忽略；
- duplicate request ID；
- Vue Proxy Wire 净化；
- 函数与循环引用拒绝；
- 会话 stable reference、重命名与两阶段删除；
- Debug effect storage 容错。

明显待补：

- FrameController 的完整生命周期自动化；
- timeout/cancel 端到端闭环；
- `hud-control` ACK + reload/destroy；
- Theme 根组件挂载；
- Frame CSS 构建注入、独立 CSS 资产清理与重复注入保护；
- Mock 浏览器 E2E；
- 61 项真实 MMD handler 回归；
- CSP、移动端、BFCache。

### 11.4 Build ID

Host 与 Frame 必须使用同一 Build ID。

PowerShell：

```powershell
$env:MMD_HUD_BUILD_ID="<version-or-commit-sha>"
npm run build
```

Git Bash：

```bash
MMD_HUD_BUILD_ID=<version-or-commit-sha> npm run build
```

开发缺省值为 `dev`。当前构建不会阻止发布 `dev`，所以正式发布流程必须自行检查。

### 11.5 单文件 Frame CSS 构建

当前实际产物：

```text
dist/host/mmd-hud-iframe-host.js
dist/frame/mmd-hud-iframe-frame.js
```

Frame 样式有两条来源，最终都会包含在同一个 Frame IIFE 中：

1. Theme 主 CSS 使用 `?inline` 导入，并由 `src/frame/main.ts` 在选择 Theme 后创建 `<style>`；
2. Vue SFC `<style>` / `<style scoped>` 先由 Vite 汇总为 CSS asset，再由 `build/frameCssInjection.ts` 在 `generateBundle` 阶段注入入口 IIFE，随后删除独立 CSS asset。

构建注入器会：

- 收集并按文件名排序所有 `.css` asset；
- 要求 Frame 构建恰好有一个 entry chunk，否则构建失败；
- 在入口代码前安装带 `data-mmd-hud-frame-styles` 标记的 `<style>`；
- 检查该标记以避免同一 document 重复注入；
- 安全序列化 CSS，包括 JavaScript 的 U+2028/U+2029 行分隔符；
- 从最终 bundle 删除所有独立 CSS asset。

因此生产 `srcdoc` 仍只需加载 `mmd-hud-iframe-frame.js`，SFC scoped 属性和注入后的选择器保持匹配，不需要新增 `frameCssUrl`、额外 CSP 资源或第三个版本化发布资产。

对应测试位于 `tests/build/frameCssInjection.test.ts`，并在真实 `build:frame` 后确认 `dist/frame/` 仅包含 Frame JS。

---

## 12. 开发一个具体 HUD 实例

在当前架构中，一个可选择的具体 HUD 通常就是一个 **Theme**。新增实例一般不需要复制 Host、Bridge 或 Protocol 实现。

以下以 `my-hud` 为例。

### 12.1 先决定：修改 `game` 还是新增 Theme

#### 只需要替换唯一正式业务 HUD

直接改造：

```text
src/hud/themes/game/
```

这样无需扩展协议 Theme ID，工作量最小。

#### 需要同时保留多个可选 HUD

新增：

```text
src/hud/themes/my-hud/
```

并将 `my-hud` 加入协议和 Frame registry。因为 Theme ID 会进入 bootstrap 和握手，所以它是协议表面的一部分，不只是前端路由。

### 12.2 最小 Theme

目录：

```text
src/hud/themes/my-hud/
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

`MyHud.vue`：

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

<template>
  <main class="my-hud">
    <header>
      <h1>{{ snapshot.character.name }}</h1>
      <button type="button" @click="hideHud">查看原生界面</button>
    </header>

    <article v-for="message in snapshot.messages" :key="message.id">
      <strong>{{ message.role }}</strong>
      <p>{{ message.text }}</p>
    </article>

    <form @submit.prevent="send">
      <textarea v-model="draft" />
      <button
        type="submit"
        :disabled="!canSend || !draft.trim()"
        :title="snapshot.capabilities.sendMessage.reason"
      >
        发送
      </button>
    </form>
  </main>
</template>
```

### 12.3 必须注册的五个位置

新增可选 Theme 时必须同步修改：

1. `src/protocol/messages.ts`
   - 扩展 `HudThemeId`。
2. `src/protocol/guards.ts`
   - 将 `my-hud` 加入 runtime `THEMES` 白名单。
3. `src/protocol/frameBootstrap.ts`
   - 扩展 bootstrap type 和 decoder。
4. `src/frame/main.ts`
   - 导入 Theme，并加入 Theme registry。
5. `host-dev/src/main.ts`
   - 让 `?theme=my-hud` 被 Mock Host 识别，而不是回退到 `game`。

同时更新：

- bootstrap/handshake 测试；
- Theme registry 测试；
- 发布注入示例和 manifest（如包含 Theme 列表）。

只创建目录而漏掉其中任一 decoder/registry，都会导致 Frame 拒绝 bootstrap 或回退到错误 Theme。

### 12.4 推荐的复杂实例目录

```text
my-hud/
├─ index.ts                 # HudThemeDefinition
├─ MyHud.vue                # 根编排
├─ my-hud.css               # ?inline 主样式
├─ shell/                   # 全屏壳层、背景、导航
├─ features/                # 对话、模型、设置等业务域
├─ overlays/                # 对话框、确认层
├─ components/              # 通用视觉组件
├─ composables/             # Snapshot/动作/导航接线
├─ stores/                  # 本地响应式状态和持久化
├─ systems/                 # 纯逻辑；不 import Vue/DOM/Bridge
└─ types/                   # 该实例自己的数据类型
```

### 12.5 Theme 中调用 Bridge 的规则

推荐：

```ts
const { snapshot, invoke } = useHudContext()

if (snapshot.value.capabilities.openModelSettings.available) {
  await invoke('openModelSettings')
}
```

不要：

```ts
window.parent.document.querySelector(...)
new MmdNativeBridge(...)
import { MMD_SELECTORS } from '../../../bridge/mmd/selectors'
```

业务 Theme 应使用类型化 `invoke()`。`invokeDynamic()` 只适合像 `bridge-debug` 这样在运行时选择任意 action 的实验室。

### 12.6 先按 Capability 设计 UI

按钮可用性通常需要两层判断：

```ts
const canEdit = message.capabilities.edit
  && snapshot.value.capabilities.openEditMessage.available
```

- 对象 capability：该条消息/会话是否支持；
- 全局 capability：当前原生页面是否允许执行该 action。

不可用时显示 `reason`。不要让按钮可点击后再把所有错误都当 toast 处理。

### 12.7 原生镜像实例开发方法

以模型选择为例：

1. 用户点击“模型”；
2. 检查 `openModelSettings` capability；
3. `invoke('openModelSettings')`；
4. 观察 `snapshot.modelPanel.open`；
5. 根据 `snapshot.modelPanel.models` 渲染本地镜像；
6. 用户选择最新 Snapshot 中的 `model.id`；
7. `invoke('selectModel', { modelId })`；
8. 等待 ActionResult 和后续 Snapshot；
9. 不把选中模型另存成 MMD 的真相。

会话、编辑、人设和补充设定采用同样模式。

### 12.8 AI 文本派生状态实例开发方法

现有 `game` 支持：

```text
[键=值]
```

链路：

```text
snapshot.messages
  → useGameFeed
  → parseMessage.ts
  → stateBar.ts
  → gameStore
  → StatusBar
```

要加入新规则：

1. 在 `systems/` 中写纯解析函数；
2. 明确读取 `message.text` 还是经过清理的 `message.html`；
3. 在 composable 中监听 `snapshot.messages`；
4. 对流式高频变化做增量缓存/合并；
5. 输出实例自己的纯数据类型；
6. store 只持久化真正需要跨 reload 的状态；
7. 不修改 Snapshot，不把 source message ID 当永久主键。

现有解析器会扫描所有消息角色；如果玩法只允许 AI 控制状态，请在新实例中显式过滤 `message.role === 'assistant'`。

### 12.9 纯本地玩法开发方法

地图、图鉴、UI 设置等不需要扩展 Bridge。

建议：

```text
systems/   纯规则
stores/    响应式状态、版本、存储容错
components/ 渲染和交互
```

自动提示词可以在纯本地 system 中拼接文本，最终只复用已有：

```ts
invoke('sendMessage', { text: finalText })
```

不要为了“地图移动”或“图鉴解锁”新增 MMD NativeAction，除非它确实需要控制 MMD 原生页面。

### 12.10 消息 HTML

若渲染 `message.html`：

```ts
import { createSanitizedHtmlCache } from '../../../shared/sanitizeHtml'

const sanitized = createSanitizedHtmlCache()
const html = sanitized.get(message.id, message.html || message.text)
```

然后才可使用 `v-html`。不要直接渲染原始 HTML。

### 12.11 CSS、资产与动画

- Theme 主 CSS 继续使用 `?inline`，SFC `<style scoped>` 也会由构建插件注入同一 Frame IIFE；
- 第三方库和资产应本地打入 bundle，不在运行时引用组件 CDN；
- 优先 CSS、内联 SVG、Canvas 或本地资源；
- 支持 `prefers-reduced-motion`；
- 使用 `100dvh`、safe-area；
- Canvas/WebGL 限制 DPR，在 `visibilitychange` 暂停；
- 卸载时清理 RAF、observer、listener、GSAP/Three 资源；
- 触控目标建议至少 44px；
- 单独测试移动端软键盘和横竖屏。

### 12.12 新实例验证流程

```bash
npm run typecheck
npm test
npm run build
node scripts/serve-cors.mjs dist/frame 5273
npm run dev:host
```

然后打开：

```text
http://127.0.0.1:5174/?theme=my-hud
```

最后必须在真实 MMD 验证该实例实际使用的 NativeAction。

---

## 13. 扩展新的 MMD 原生能力

只有“确实需要操作或读取新的 MMD 原生功能”时才扩展 Bridge。

### 13.1 修改顺序

1. **契约**：在 `src/contracts/bridge.ts` 增加 action、payload、Snapshot 子结构或 result 类型。
2. **Runtime decoder**：在 `src/protocol/guards.ts` 增加严格 payload 验证。
3. **Selector/reader**：在 `src/bridge/mmd/` 增加结构识别和纯数据读取。
4. **Capability**：在 Snapshot 读取过程中根据 live DOM 动态计算可用性。
5. **Handler**：在 `actionRegistry.ts` 注册动作。
6. **结果验证**：不要“点击即成功”，等待可观察 DOM 结果。
7. **Debug manifest**：更新 `bridge-debug/actionDebugManifest.ts`、PayloadForm 和工作流。
8. **Mock**：在 `src/dev/mockMmd.ts` 提供足够真实的 DOM 和时序。
9. **测试**：覆盖 decoder、capability、handler、stale target、timeout 和错误路径。
10. **真实 MMD 回归**：Mock 通过后再逐项验证真实页面。

### 13.2 Action handler 的安全要求

- 不使用过宽 selector 猜按钮；
- 验证可见性、唯一性、结构、label/icon 组合；
- 从最新 Snapshot 传 stable reference；
- 执行前重新绑定 live DOM；
- 破坏性动作使用两阶段确认或明确 UI 确认；
- 支持 AbortSignal 与 timeout；
- 验证结果，而不是只验证 click 已派发；
- DOM 变化时返回 `PLATFORM_CHANGED`；
- 不把未识别动作降级到相似动作。

### 13.3 何时不应新增 Action

以下通常属于 Theme 本地逻辑：

- 打开 HUD 内部地图/图鉴；
- 切换 HUD 页面；
- 本地动画和音效；
- AI 文本状态解析；
- 本地存档；
- 自动提示词拼接。

这些功能不应污染 `NativeAction` 契约。

---

## 14. 本地状态与 AI 文本派生状态

### 14.1 `CUSTOM_` key

项目自有 storage key 必须使用独立前缀，例如：

```ts
const STORAGE_KEY = 'CUSTOM_MY_HUD_STATE_V1'
```

要求：

- 存档包含 schema 版本；
- JSON 损坏或版本不匹配时回退；
- 写入失败不影响主流程；
- 不枚举 MMD 内部 key；
- 不保存 Cookie、token、DOM 节点或父页面状态；
- 不把运行时 message ID 当永久业务主键。

### 14.2 当前 opaque sandbox 的存储限制

生产 Frame 是无 `allow-same-origin` 的 `srcdoc` sandbox。浏览器可能对其中的 `localStorage` 抛出 `SecurityError`。

现有 `gameStore` 和 Debug effect settings 都做了 try/catch，因此不会崩溃，但不能承诺数据一定跨 iframe reload 持久化。

如果具体实例必须可靠保存：

- 先明确是否仍维持 opaque sandbox；
- 设计独立的、受限的 Host storage RPC；
- 只允许项目自己的 `CUSTOM_` namespace；
- 做 schema、大小、权限和数据净化；
- 不通过开放 `allow-same-origin` 简单换取存储，因为这会改变当前安全边界。

### 14.3 AI 文本不是原生设置

`[A=B]` 等派生状态是 HUD 对消息文本的本地解释：

- MMD 只负责保存和输出消息；
- Bridge 只负责提供只读消息 Snapshot；
- Theme 负责解析和展示；
- 派生状态不会自动写回 MMD。

---

## 15. 发布与 MMD 注入

### 15.1 当前发布形态

当前发布仓库为相邻目录：

```text
../mmd-hud-iframe-release/
├─ host/mmd-hud-iframe-host.js
├─ frame/mmd-hud-iframe-frame.js
├─ manifest.json
└─ README.md
```

Host 与 Frame 必须来自同一次构建、同一 Build ID、同一个不可变 release commit。

### 15.2 发布前流程

1. 选择唯一 Build ID（版本或 commit SHA），禁止 `dev`；
2. 更新 `package.json` 与 `package-lock.json` 版本（如需要）；
3. `npm ci`；
4. `npm run typecheck`；
5. `npm test`；
6. 使用同一个 `MMD_HUD_BUILD_ID` 执行 `npm run build`；
7. 检查 Host/Frame 中的 Build ID；
8. 验证 `dist/frame/` 仅包含 Frame JS，且构建日志没有独立 CSS；
9. 将最终依赖和资产全部打包，不引入运行时组件 CDN；
10. 复制产物到 release 仓库；
11. 更新 `manifest.json` 与 release README；
12. 检查 diff；
13. 提交并推送 release 仓库；
14. 使用该 commit SHA 的 jsDelivr URL；
15. 在真实 MMD 进行 Bridge Debug 和业务 Theme 冒烟。

当前没有自动 release copy、manifest 生成、checksum、CI 或 `dev` Build ID 门禁，发布仍是手动流程。

### 15.3 注入示例

正式 Theme：

```html
<script>
window.__MMD_HUD_IFRAME_CONFIG__ = {
  frameScriptUrl: 'https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/frame/mmd-hud-iframe-frame.js',
  theme: 'game'
}
</script>
<script src="https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/host/mmd-hud-iframe-host.js"></script>
```

Bridge Debug：

```html
<script>
window.__MMD_HUD_IFRAME_CONFIG__ = {
  frameScriptUrl: 'https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/frame/mmd-hud-iframe-frame.js',
  theme: 'bridge-debug'
}
</script>
<script src="https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/host/mmd-hud-iframe-host.js"></script>
```

注意：

- 不使用 `@main` 或浮动 tag；
- Host 与 Frame 不跨 commit 混用；
- Frame URL 生产只允许 HTTPS；本地开发仅允许 loopback HTTP；
- `frameScriptUrl` 当前只检查协议，不检查固定 hostname，因此 config 必须来自可信注入代码；
- 父页面 CSP 必须允许远程 Frame script；
- Frame 使用 `allow-downloads` 和 `clipboard-write`；
- Frame SFC CSS 已注入 Frame IIFE，无需发布独立 CSS。

---

## 16. 调试工具与父页面 API

### 16.1 Bridge Debug Lab

建议任何新实例先在 `bridge-debug` 中验证其依赖的原生能力：

- capability 是否可用；
- payload 是否来自最新 Snapshot；
- ActionResult；
- Snapshot revision 和 diff；
- BridgeEvent 时间线；
- 两阶段删除；
- 模型、编辑、人设、补充设定等 guided workflow。

默认导出会脱敏：

- confirmation token；
- HTTP(S) link/avatar；
- text/html/identity/subtitle/preview。

完整导出可能包含聊天正文、人设、设定补充和分享链接，需要额外 UI 确认，不应公开上传。

### 16.2 父页面 API

注入成功后：

```js
__MMD_HUD_IFRAME__.getSnapshot()
__MMD_HUD_IFRAME__.getThemeId()
__MMD_HUD_IFRAME__.getFrameScriptUrl()
__MMD_HUD_IFRAME__.refresh()
__MMD_HUD_IFRAME__.hide()
__MMD_HUD_IFRAME__.show()
__MMD_HUD_IFRAME__.reloadFrame()
__MMD_HUD_IFRAME__.destroy()
```

重复注入不会创建第二个实例，只会对现有 Bridge 调用 `refresh()`。要加载新 bundle 或新 Theme：

- 完整刷新页面；或
- 先执行 `__MMD_HUD_IFRAME__.destroy()`，再重新注入。

---

## 17. 已知限制与后续工作

### 17.1 当前已知限制

1. **本地 storage 不可靠**
   - opaque sandbox 下 `localStorage` 可能不可访问；
   - 现有代码只保证容错，不保证跨 reload 持久化。
2. **取消不是端到端动作中止**
   - HostSession cancel 不会把 signal 传入 NativeGateway。
3. **`refresh-result` 可能是旧 revision**
   - 真正刷新后的 Snapshot 可能随后通过 BridgeEvent 到达。
4. **Snapshot decoder 仍较浅**
   - 尚未逐字段验证所有 message/panel 数据。
5. **Frame script URL 没有 hostname allowlist**
   - 只检查 HTTPS 或本地 loopback；config 来源必须可信。
6. **破坏性授权不统一**
   - 消息/会话删除由 Bridge 强制 token；退出、回溯、新故事主要依赖 Theme 确认与原生结果验证。
7. **本地 Mock 不是完整 E2E**
   - 无 Playwright/Cypress；
   - 真实 MMD DOM 和移动端仍需人工验收。
8. **发布没有自动化门禁**
   - 没有 CI、原子发布、manifest/checksum 生成或禁止 `dev` Build ID。

### 17.2 后续优先级

#### P0：发布正确性

- 保持 Frame CSS 单文件产物断言；
- 正式构建禁止 `dev` Build ID；
- 自动生成 release manifest；
- 保证 Host/Frame 原子配对；
- 增加 CI：typecheck、tests、双构建、产物检查。

#### P1：协议与生命周期

- 将 cancel signal 贯穿到 NativeGateway/MmdNativeBridge；
- 定义严格 refresh-after-read 语义；
- 完整 Snapshot runtime schema；
- FrameController hide/show/reload/destroy E2E；
- pagehide、navigation、BFCache 和异常断线测试。

#### P1：真实 MMD 回归

- 61 项 handler 逐项回归；
- 6 项 contract-only 确定性不可用；
- 两阶段删除 replay/过期/stale target；
- MMD DOM 改版后的 selector 和语义签名维护。

#### P2：移动端与体验

- safe-area；
- 软键盘；
- 横竖屏；
- focus/Escape/返回键；
- reduced motion；
- Canvas/WebGL 降级和资源回收。

#### P2：具体游戏系统

- 地图、图鉴、自动提示词当前仍有占位/TODO；
- 明确可靠本地存储方案；
- 增加 Theme 开发 playground 或 fake `HudContext` harness。

---

## 一句话总结

**Bridge 是 MMD DOM 的安全适配层，Host 是父页面与 iframe 的生命周期/RPC 网关，Protocol 是唯一跨窗口边界，HostClient/HudContext 是 Frame 内的远程代理，而 Theme 才是具体 HUD 游戏实例。**

后续开发应沿着这条链扩展：

```text
MMD DOM Adapter
  → MmdNativeBridge
  → NativeGateway / HostSession
  → MessagePort Protocol
  → HostClient / HudContext
  → 具体 Theme
```

不要重新引入 Theme 直连 MMD DOM、复制原生状态、绕过 capability，或把纯本地玩法错误地扩展成 NativeAction。
