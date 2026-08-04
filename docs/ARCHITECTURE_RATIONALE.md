# 架构优点与设计权衡

本文面向架构评审者、未来重构者和需要理解设计理由的维护者。它回答“为什么这样设计”，不重复全部实现细节；系统如何运行见 [整体架构与实现](ARCHITECTURE.md)。

---

## 1. 核心设计结论

当前主干是：

```text
MMD 原生页面作为唯一真实状态源
  → 父页面 DOM Adapter / NativeBridge
  → Host 生命周期与 RPC
  → MessagePort
  → opaque sandbox Frame
  → HudContext
  → Theme
```

它追求的不是最少文件或最短调用链，而是：

- 不重写 MMD 已经可靠提供的系统；
- 把不稳定 DOM 限制在单一适配层；
- 把视觉实例与父页面权限隔离；
- 让错误 fail closed；
- 让多个 HUD 实例复用同一原生能力契约；
- 让 Host/Frame 生命周期、版本和请求可验证。

---

## 2. 为什么 MMD 是唯一真实状态源

MMD 已经拥有：

- 登录与权限；
- 会话和消息数据库；
- AI provider、请求和流式输出；
- 模型、设置、人设和指令；
- 编辑、删除、分享等原生流程。

如果 HUD 复制这些系统，会产生：

```text
MMD 状态 ≠ HUD 状态
```

并需要重新解决持久化、并发、权限、错误恢复和平台升级。

因此 HUD 采用：

- Snapshot：原生状态的只读可观察投影；
- NativeAction：经过验证的原生操作请求；
- ActionResult：动作后置条件；
- Capability：当前是否允许执行。

### 优点

- 不出现第二套会话或模型真相；
- MMD 原生持久化和权限继续生效；
- HUD 可随时销毁，不丢失 MMD 数据；
- 新实例不需要重建后端。

### 代价

- Snapshot 是最终一致，而非同步内存共享；
- Theme 必须处理 ActionResult 与 Snapshot 任意到达顺序；
- 原生 DOM 改版需要维护 Adapter。

这是有意接受的代价，实例规则见 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。

---

## 3. 为什么使用 iframe，而不是 ShadowRoot 或普通 DOM 注入

ShadowRoot 只能隔离部分 CSS，不能创建独立 JavaScript Realm。注入组件仍可访问父页面全局、DOM 和应用对象，也更容易被父页面样式、事件和异常影响。

sandbox iframe 提供：

- 独立 document 和 Vue 应用；
- 独立全局对象和事件循环边界；
- 父页面 DOM 权限隔离；
- 更清晰的资源清理；
- 可验证的通信入口。

### 优点

- Theme 失误不应直接操作 MMD DOM；
- 样式隔离完整；
- 后续实例可以自由使用复杂动画和组件系统；
- Host 与 Frame 能独立构建和测试。

### 代价

- 必须设计协议；
- 不能直接共享对象；
- focus、软键盘、尺寸和可见性需要跨层考虑；
- opaque sandbox 下 storage 不可靠。

这些代价比 Theme 获得父页面权限更可控。

---

## 4. 为什么不使用 allow-same-origin

无 `allow-same-origin` 的 srcdoc Frame 使用 opaque origin。即使 Frame 脚本来自 CDN，它也不能凭 origin 获得父页面能力。

### 优点

- Frame 不能读取父页面 DOM、Cookie 和 storage；
- CDN 资源供应与 MMD 页面权限解耦；
- 即使 Theme 依赖存在问题，影响范围受限；
- 安全边界由浏览器而不是团队约定强制执行。

### 代价

- localStorage 可能抛出 SecurityError；
- 某些需要 origin 的浏览器 API 不可用；
- handshake 交付端口时无法用普通 HTTPS targetOrigin 精确指向 opaque Frame。

项目通过 bootstrap ID、Build ID、event.source、parent origin 兼容、Theme 和 channel 二次验证补足端口交付绑定。可靠存储如有真实需求，应设计受限 Host RPC，而不是开放同源权限。

---

## 5. 为什么使用 srcdoc，而不是远程 HTML

Host 动态创建最小 srcdoc 并加载 Frame IIFE。

### 优点

- 不依赖 CDN 返回正确 HTML MIME；
- Frame document 始终由当前 Host 创建；
- bootstrap 可以通过 iframe.name 绑定当前 document；
- 生产只发布两个 JS；
- 保留 opaque origin。

### 代价

- Frame CSS 必须进入 JS；
- 不能把 frame/index.html 当生产页面；
- 本地开发需要 Host Mock 才能获得真实 bootstrap/MessagePort。

Frame CSS 注入构建解决了单文件发布问题。

---

## 6. 为什么 Host 与 Frame 分开构建

两个 bundle 运行在不同 Realm 并拥有不同权限：

- Host：可访问 MMD document，不加载 Vue Theme；
- Frame：包含 Vue 和 Theme，不访问父页面 DOM。

### 优点

- 依赖方向可由构建边界验证；
- Frame 视觉依赖不会进入父页面执行环境；
- Host 可以保持窄、稳定；
- CSP、缓存和发布资产清晰。

### 代价

- 两个产物必须原子配对；
- Build ID 和 manifest 必须正确；
- 发布流程比单 bundle 更严格。

因此 Host/Frame 使用同一 Build ID，握手时拒绝错配。发布自动化是路线图中的 P0。

---

## 7. 为什么全局 postMessage 只用于握手

如果所有业务都使用 window.postMessage：

- 每条消息都需要重新判断 source/origin/channel；
- 页面中其他脚本也能发送同类型消息；
- listener 生命周期容易泄漏；
- 请求隔离更困难。

当前做法是：

1. Host 向自己创建的 iframe.contentWindow 交付唯一 MessagePort；
2. Frame 验证 handshake；
3. 双方通过 frame-ready 再绑定 bootstrap/channel；
4. Frame 移除全局 message listener；
5. 所有业务只走端口。

### 优点

- 每个 Frame document 独享通道；
- reload 后旧 Frame 不拥有新端口；
- RPC request/response 关联集中；
- close 时可以一次性清理。

### 代价

- 需要 HostSession 和 HostClient；
- 需要 runtime decoder；
- 需要管理 request ID、timeout 和 cancel。

这些复杂度换来了清晰的生命周期和隔离。

---

## 8. 为什么 Theme 只获得 HudContext

Theme 不获得：

- window.parent；
- MessagePort；
- selector；
- NativeBridge；
- FrameController；
- MMD document。

它只获得 Snapshot、connection、invoke、refresh、subscribe 和有限 HUD control。

### 优点

- 实例可以独立开发；
- Theme 无法绕过 protocol 和 capability；
- Host/Frame 实现可替换而不修改业务组件；
- 测试可提供 fake HudContext。

### 代价

- 新宿主能力必须显式扩展契约；
- hide 后恢复入口属于 Host，Theme 不能直接 show；
- 可见性等生命周期若未进入 context，Theme 无法可靠得知。

后者应通过窄的生命周期信号加固，而不是暴露 FrameController。

---

## 9. 为什么需要 Snapshot，而不是细粒度 DOM 事件

直接把每个 DOM mutation 映射成业务事件会让 Theme 依赖 MMD 渲染细节，并难以处理漏事件、初始化和重连。

Snapshot 提供：

- 当前状态的完整可观察投影；
- revision；
- 面板和列表结构；
- capability；
- 重连和首次挂载基线。

BridgeEvent 仅补充 generation 时间线和错误等一次性语义。

### 优点

- Theme 可以从任意 Snapshot 恢复；
- 不必重放所有历史事件；
- Vue 响应式消费自然；
- 调试台可以保存历史和 diff。

### 代价

- 读取完整 Snapshot 有成本；
- 多个 DOM mutation 可能产生多 revision；
- Theme 不能在 revision 变化时无条件清空表单；
- decoder 需要逐步加固。

Bridge 通过 RAF 合并刷新和单次查询缓存降低成本。

---

## 10. 为什么需要 CapabilityMap

类型中存在某项 NativeAction，不代表当前 DOM 允许执行。例如：

- 面板未打开；
- AI 正在生成；
- 输入框禁用；
- 目标消失；
- selector 结构不完整；
- 动作只有契约没有 handler。

CapabilityMap 让 UI 在点击前知道是否可用，并显示 reason。

### 优点

- fail closed；
- 减少误点和无意义 RPC；
- 调试台能观察平台变化；
- contract-only 动作仍保留类型，但明确不可用。

### 代价

- capability reader 和 handler 必须保持一致；
- Snapshot 可能短暂滞后；
- capability 不是安全终点，handler 仍需重验 live DOM。

因此 capability 与 handler 必须共用 resolver，执行时必须二次验证。

---

## 11. 为什么 ActionResult 与 Snapshot 独立

ActionResult 回答“本次请求是否满足 handler 后置条件”；Snapshot 回答“当前 MMD 可观察状态是什么”。它们属于不同语义。

如果把 Snapshot 当作任意 invoke 的隐式 ACK：

- 无内容变化的动作无法确认；
- 多个并发 mutation 无法归属于特定请求；
- request/response 与状态广播耦合。

独立后：

- RPC 可以精确关联 request ID；
- Snapshot 仍是广播状态；
- ActionResult.data 可携带本次动作结果；
- Theme 最终回归 Snapshot。

### 代价

Theme 必须处理两条链的任意先后顺序。通用 observed revision 和后置等待可作为后续优化，但不应合并两种语义。

---

## 12. 为什么使用 stable reference 和 live DOM 重验

DOM 下标和可见文字都可能变化。破坏性或目标敏感动作需要组合：

- ID；
- fingerprint；
- native index；
- role；
- DOM identity；
- label/结构签名；
- revision 和结果差异。

### 优点

- Snapshot 陈旧时安全失败；
- 不会点击“看起来相似”的新目标；
- 两阶段删除可以抵御 replay 和 stale target。

### 代价

- handler 更复杂；
- 需要 reader、resolver 和测试；
- MMD DOM 改版仍需真实回归。

对于操作用户消息和会话，这一复杂度是必要的。

---

## 13. 为什么三类 Theme 功能必须分区

### 原生镜像

数据和持久化属于 MMD，需要 Snapshot + NativeAction。

### AI 文本派生状态

来源是 messages，规则和存档属于 Theme，不写回 Snapshot。

### 纯本地功能

地图、图鉴、动画和 UI 设置不对应原生面板，不需要新增 Action。

混合后会产生：

- 把本地状态错当 MMD 设置；
- 为地图移动增加无意义 NativeAction；
- 缓存原生模型成为第二真相；
- 删除 HUD 后无法判断数据归属。

分区是长期可维护性的核心，而不只是文件组织偏好。

---

## 14. 当前架构的主要优点

### 安全隔离

浏览器强制 Theme 与父页面权限分离，协议输入 fail closed。

### 状态所有权清晰

MMD 拥有原生事实，Theme 拥有表现和本地玩法。

### 可替换实例

多个 Theme 复用同一 Host/Bridge/Protocol，不复制原生适配层。

### 可测试

Protocol、HostSession、HostClient、Wire、reader 和 Theme 状态机可以分层测试。

### 生命周期隔离

每次 reload 使用新 channel，旧请求不会误投新 Frame。

### 故障范围受限

Theme 视觉异常不应直接修改 MMD DOM；Bridge selector 异常会关闭 capability。

### 发布资产简单

生产只有 Host JS 和 Frame JS，Frame CSS 已内联。

---

## 15. 已接受的代价

- 代码层次和文件数量增加；
- 需要维护跨窗口协议；
- Snapshot 是最终一致；
- Host/Frame 必须原子发布；
- opaque sandbox 存储不可靠；
- DOM Adapter 需要随 MMD 更新；
- 完整 E2E 和真实 handler 回归成本较高；
- 生命周期信号和严格 refresh 仍需加固。

这些不是理由去删除隔离，而是后续工程化优化的目标。详见 [架构优化路线图](ROADMAP.md)。

---

## 16. 不应采用的“简化”

禁止：

- Theme 直接访问 parent.document；
- 开放 allow-same-origin 只为 storage；
- 将 NativeBridge 或 DOM 节点传入 Frame；
- 使用 window.postMessage 承担全部业务；
- 在每个 Theme 复制 Host/Protocol；
- 把 Snapshot 变成 Theme 可写 store；
- 用固定 sleep 代替动作后置条件；
- 删除 contract-only 动作来缩小类型；
- 将原生状态缓存为 Theme 真相。

这些做法短期减少代码，长期会重新引入权限、状态分叉和生命周期问题。

---

## 17. 何时应该修改架构

只有在需求无法通过当前窄接口正确表达时，才扩展架构。例如：

- 高负载 Theme 必须知道 Host hide/show：新增 hudVisible 信号；
- 调试工具必须获得严格刷新：新增 refreshAndRead；
- timeout 必须真正停止 DOM 等待：贯穿 AbortSignal；
- 本地状态必须可靠跨 reload：设计受限 Host storage RPC。

扩展原则：

1. 明确状态所有者；
2. 定义成功和失败语义；
3. 使用最窄接口；
4. 不扩大 Frame 权限；
5. 保持旧 channel 和旧 Build 拒绝机制；
6. 添加跨窗口和生命周期测试。
